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

  async rebuildEmbeddings(organizationId: string) {
    const examples = await this.vectorStore.listExamples(organizationId);
    let rebuilt = 0;
    const next = [];

    for (const example of examples) {
      try {
        const embedding = this.normalizeEmbedding(
          (await this.ollama.embed(example.content))[0]
        );
        if (embedding?.length) {
          rebuilt += 1;
          next.push({ ...example, embedding });
          continue;
        }
      } catch {
        // Keep the existing example usable through token fallback.
      }
      next.push({ ...example, embedding: undefined });
    }

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
    const content = this.cleanString(request.content, 50000);

    if (!(snapsTargetPlatforms as readonly string[]).includes(platform)) {
      throw new BadRequestException('platform is required.');
    }
    if (content.length < 5) {
      throw new BadRequestException('content must be at least 5 characters.');
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
      ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
      : '';
  }
}
