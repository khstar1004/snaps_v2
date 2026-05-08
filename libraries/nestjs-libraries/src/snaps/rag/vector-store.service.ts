import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsStoredStyleExample = {
  id: string;
  organizationId: string;
  platform: SnapsTargetPlatform;
  content: string;
  authorType?: string;
  topic?: string;
  tone?: string;
  sourceUrl?: string;
  metrics?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
};

export type SnapsStyleSearchHit = SnapsStoredStyleExample & {
  score: number;
};

const MAX_STYLE_EXAMPLES = 500;

@Injectable()
export class SnapsVectorStoreService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async addExample(
    organizationId: string,
    example: Omit<SnapsStoredStyleExample, 'id' | 'organizationId' | 'createdAt'>
  ) {
    const examples = await this.readExamples(organizationId);
    const next = this.normalizeImportedExample(organizationId, {
      ...example,
      id: makeId(14),
      organizationId,
      createdAt: new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('valid platform and content are required.');
    }
    await this.writeExamples(organizationId, [next, ...examples].slice(0, MAX_STYLE_EXAMPLES));
    return next;
  }

  async search(
    organizationId: string,
    params: {
      platform?: string;
      query: string;
      embedding?: number[];
      topK: number;
    }
  ): Promise<SnapsStyleSearchHit[]> {
    const examples = await this.readExamples(organizationId);
    const queryTokens = this.tokenize(params.query);
    const topK = this.normalizeTopK(params.topK);
    const hits = examples
      .filter((example) => !params.platform || example.platform === params.platform)
      .map((example) => ({
        ...example,
        score:
          params.embedding && example.embedding
            ? this.cosine(params.embedding, example.embedding)
            : this.tokenScore(queryTokens, this.tokenize(example.content)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return hits;
  }

  async listExamples(organizationId: string) {
    return this.readExamples(organizationId);
  }

  async replaceExamples(
    organizationId: string,
    examples: SnapsStoredStyleExample[]
  ) {
    const limited = examples.slice(0, MAX_STYLE_EXAMPLES);
    await this.writeExamples(organizationId, limited);
    return {
      total: limited.length,
    };
  }

  async deleteExample(organizationId: string, exampleId: string) {
    const examples = await this.readExamples(organizationId);
    const next = examples.filter((example) => example.id !== exampleId);
    await this.writeExamples(organizationId, next);
    return {
      deleted: next.length !== examples.length,
      total: next.length,
    };
  }

  async importExamples(organizationId: string, examples: unknown[] = []) {
    const current = await this.readExamples(organizationId);
    const incoming = examples
      .map((example) => this.normalizeImportedExample(organizationId, example))
      .filter((example): example is SnapsStoredStyleExample => !!example)
      .slice(0, MAX_STYLE_EXAMPLES);
    const merged = this.mergeByKey(
      [...incoming, ...current],
      (example) => example.id || `${example.platform}:${example.content.trim().toLowerCase()}`
    ).slice(0, MAX_STYLE_EXAMPLES);

    await this.writeExamples(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private async readExamples(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsStoredStyleExample[];
      }
      return parsed
        .map((example) => this.normalizeImportedExample(organizationId, example))
        .filter((example): example is SnapsStoredStyleExample => !!example)
        .slice(0, MAX_STYLE_EXAMPLES);
    } catch {
      return [] as SnapsStoredStyleExample[];
    }
  }

  private async writeExamples(
    organizationId: string,
    examples: SnapsStoredStyleExample[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(examples, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.style-examples.json`);
  }

  private normalizeImportedExample(
    organizationId: string,
    value: unknown
  ): SnapsStoredStyleExample | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const example = value as Partial<SnapsStoredStyleExample>;
    const platform =
      typeof example.platform === 'string' ? example.platform.trim() : '';
    const content =
      typeof example.content === 'string'
        ? example.content.trim()
        : '';
    if (
      content.length < 5 ||
      !(snapsTargetPlatforms as readonly string[]).includes(platform)
    ) {
      return undefined;
    }

    return {
      id: String(example.id || makeId(14)),
      organizationId,
      platform: platform as SnapsTargetPlatform,
      content,
      authorType: this.cleanOptionalString(example.authorType),
      topic: this.cleanOptionalString(example.topic),
      tone: this.cleanOptionalString(example.tone),
      sourceUrl: this.cleanOptionalString(example.sourceUrl),
      metrics:
        example.metrics && typeof example.metrics === 'object'
          ? example.metrics
          : undefined,
      embedding: Array.isArray(example.embedding)
        ? example.embedding.filter(
            (value) => typeof value === 'number' && Number.isFinite(value)
          )
        : undefined,
      createdAt:
        typeof example.createdAt === 'string' && example.createdAt.trim()
          ? example.createdAt
          : new Date().toISOString(),
    };
  }

  private mergeByKey<T>(items: T[], keyOf: (item: T) => string) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private tokenize(value: string) {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s#]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  private tokenScore(queryTokens: string[], contentTokens: string[]) {
    if (!queryTokens.length || !contentTokens.length) {
      return 0;
    }

    const contentSet = new Set(contentTokens);
    const matched = queryTokens.filter((token) => contentSet.has(token)).length;
    return matched / queryTokens.length;
  }

  private cosine(a: number[], b: number[]) {
    const length = Math.min(a.length, b.length);
    if (!length) {
      return 0;
    }

    let dot = 0;
    let aMag = 0;
    let bMag = 0;
    for (let index = 0; index < length; index += 1) {
      dot += a[index] * b[index];
      aMag += a[index] * a[index];
      bMag += b[index] * b[index];
    }

    if (!aMag || !bMag) {
      return 0;
    }

    return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
  }

  private normalizeTopK(value: unknown) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return 5;
    }
    return Math.min(Math.max(1, Math.floor(normalized)), 50);
  }

  private cleanOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim()
      ? value.trim().slice(0, 500)
      : undefined;
  }

  private async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
  }
}
