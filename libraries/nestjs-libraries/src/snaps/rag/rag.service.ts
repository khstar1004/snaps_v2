import { BadRequestException, Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import {
  SnapsStoredStyleExample,
  SnapsVectorStoreService,
} from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsStyleExampleDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

/**
 * How many embed calls the rebuild keeps in flight. Small on purpose: the
 * embed model is a local Ollama, not a service that scales with load.
 */
const SNAPS_REBUILD_CONCURRENCY = 4;

@Injectable()
export class SnapsRagService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly vectorStore: SnapsVectorStoreService
  ) {}

  async addExample(organizationId: string, body?: SnapsStyleExampleDto) {
    const example = this.normalizeExample(body);
    let embedding: number[] | undefined;
    try {
      embedding = this.normalizeEmbedding((await this.ollama.embed(example.content))[0]);
    } catch {
      embedding = undefined;
    }

    return this.vectorStore.addExample(organizationId, {
      ...example,
      embedding,
    });
  }

  async search(
    organizationId: string,
    query: string,
    platform?: string,
    topK = Number(process.env.SNAPS_RAG_TOP_K || 5)
  ) {
    let embedding: number[] | undefined;
    try {
      embedding = this.normalizeEmbedding((await this.ollama.embed(query))[0]);
    } catch {
      embedding = undefined;
    }

    return this.vectorStore.search(organizationId, {
      query,
      platform,
      embedding,
      topK,
    });
  }

  listExamples(organizationId: string): Promise<SnapsStoredStyleExample[]> {
    return this.vectorStore.listExamples(organizationId);
  }

  deleteExample(organizationId: string, exampleId: string) {
    return this.vectorStore.deleteExample(organizationId, exampleId);
  }

  importExamples(organizationId: string, examples: unknown[] = []) {
    return this.vectorStore.importExamples(organizationId, examples);
  }

  /**
   * Re-embeds every stored style example.
   *
   * One embed call per example, and they used to run one after another:
   * measured over 100 examples with a 20ms stub, 3,020ms, which is the shape of
   * a loop that waits. A real embed round trip is more like 30-150ms and the
   * store holds up to 200 examples, so the operator pressing "RAG 재임베딩" was
   * waiting somewhere between six and thirty seconds.
   *
   * Bounded rather than all at once: firing 200 concurrent requests at a local
   * Ollama is a good way to make it slower or make it fail, and the failure
   * would land as a silent token-fallback downgrade on every example.
   */
  async rebuildEmbeddings(organizationId: string) {
    const examples = await this.vectorStore.listExamples(organizationId);
    let rebuilt = 0;
    // Written by index so the stored order survives the concurrency.
    const next: typeof examples = new Array(examples.length);
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= examples.length) {
          return;
        }
        const example = examples[index];
        try {
          const embedding = this.normalizeEmbedding(
            (await this.ollama.embed(example.content))[0]
          );
          if (embedding?.length) {
            rebuilt += 1;
            next[index] = { ...example, embedding };
            continue;
          }
        } catch {
          // Keep the existing example usable through token fallback.
        }
        next[index] = { ...example, embedding: undefined };
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(SNAPS_REBUILD_CONCURRENCY, examples.length) }, worker)
    );

    await this.vectorStore.replaceExamples(organizationId, next);
    return {
      total: next.length,
      rebuilt,
      fallback: next.length - rebuilt,
    };
  }

  private normalizeEmbedding(value: unknown) {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is number =>
            typeof entry === 'number' && Number.isFinite(entry)
        )
      : undefined;
  }

  private normalizeExample(body?: SnapsStyleExampleDto): SnapsStyleExampleDto {
    const request = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Partial<SnapsStyleExampleDto>)
      : {};
    const platform = this.cleanString(request.platform, 60);
    // The style is the line breaks as much as the words; cleanString
    // flattened them and the example taught a style with none.
    const content = snapsCleanBodyText(request.content, 50000);

    if (!(snapsTargetPlatforms as readonly string[]).includes(platform)) {
      throw new BadRequestException('platform은 필수입니다.');
    }
    if (content.length < 5) {
      throw new BadRequestException('content는 최소 5자 이상이어야 합니다.');
    }

    return {
      platform: platform as SnapsTargetPlatform,
      content,
      authorType: this.cleanString(request.authorType, 120) || undefined,
      topic: this.cleanString(request.topic, 200) || undefined,
      tone: this.cleanString(request.tone, 200) || undefined,
      sourceUrl: this.cleanString(request.sourceUrl, 2000) || undefined,
      metrics:
        request.metrics && typeof request.metrics === 'object' && !Array.isArray(request.metrics)
          ? request.metrics
          : undefined,
    };
  }

  private cleanString(value: unknown, maxLength: number) {
    return typeof value === 'string'
      ? snapsClampText(value.trim().replace(/\s+/g, ' '), maxLength)
      : '';
  }
}
