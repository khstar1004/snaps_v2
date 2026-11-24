import { BadRequestException, Injectable } from '@nestjs/common';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  boundStoredRecord,
  SnapsRecordBounds,
} from '@gitroom/nestjs-libraries/snaps/storage/bounded-record';
import { ensureSnapsDataDir } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

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
  /**
   * Which metric produced `score` - the only thing that makes the number
   * readable. Both consumers used to re-derive this as
   * `hit.embedding ? 'embedding' : 'keyword'`, which is half the condition:
   * a cosine also needs the *query* to have embedded and the two vectors to
   * be the same length. With Ollama down every hit is token-scored, and the
   * stored examples were still labelled 'embedding'. The store knows which
   * branch it took; nobody else can.
   */
  matchedBy: 'embedding' | 'keyword';
};

const MAX_STYLE_EXAMPLES = 500;

// A real metrics object is a handful of counts; the demo workspace's largest
// is 45 characters at one level.
const METRICS_BOUNDS: SnapsRecordBounds = {
  maxChars: 4000,
  maxDepth: 6,
  maxKeys: 60,
  maxItems: 100,
  maxText: 1000,
};
// nomic-embed-text returns 768 values and the largest common alternative
// 4,096, so this is several times any real embedding.
const MAX_EMBEDDING_VALUES = 8192;

/** A token this rule applies to: a Hangul syllable carries a morpheme. */
const HANGUL_START = /^[가-힣]/;

@Injectable()
export class SnapsVectorStoreService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async addExample(
    organizationId: string,
    example: Omit<SnapsStoredStyleExample, 'id' | 'organizationId' | 'createdAt'>
  ) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const examples = await this.readExamples(organizationId);
      const next = this.normalizeImportedExample(organizationId, {
        ...example,
        id: makeId(14),
        organizationId,
        createdAt: new Date().toISOString(),
      });
      if (!next) {
        throw new BadRequestException('유효한 platform과 content가 필요합니다.');
      }
      // Same as saveSource in the source library: at the cap, adding one
      // deletes the oldest and the caller used to hear nothing about it.
      const merged = [next, ...examples];
      const evicted = merged.slice(MAX_STYLE_EXAMPLES);
      await this.writeExamples(organizationId, merged.slice(0, MAX_STYLE_EXAMPLES));
      return evicted.length
        ? {
            ...next,
            evicted: evicted.length,
            warning:
              `RAG 스타일 예시가 상한 ${MAX_STYLE_EXAMPLES}개에 도달해 가장 오래된 ` +
              `${evicted.length}개를 지웠습니다. 필요한 예시는 먼저 내보내세요.`,
          }
        : next;
    });
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
    // Two different metrics used to be sorted into one list. A cosine score and
    // a token score both land in 0..1 but mean nothing to each other, and the
    // token score reaches exactly 1.0 whenever every query word appears in the
    // text. Measured: a promotional post with no embedding that happened to
    // contain both query words scored 1.0000 and outranked the semantically
    // near-identical embedded example at 0.9994. That is not a rare state -
    // addExample() stores `embedding: undefined` whenever the embed call fails,
    // so one brief Ollama outage leaves a store where keyword matches beat
    // every semantic one, silently, until `/snaps/rag/rebuild` is run.
    //
    // Rank by metric first, score second: examples that can be compared to the
    // query embedding come first among themselves, and the ones that can only
    // be scored by tokens follow. When the query itself has no embedding,
    // everything uses the token score and the tiers collapse to one.
    const scored = examples
      .filter((example) => !params.platform || example.platform === params.platform)
      .map((example) => {
        const cosine = params.embedding
          ? this.cosine(params.embedding, example.embedding)
          : undefined;
        return {
          ...example,
          comparable: cosine !== undefined,
          score:
            cosine ?? this.tokenScore(queryTokens, this.tokenize(example.content)),
        };
      });

    const hits = scored
      .sort((a, b) => {
        if (a.comparable !== b.comparable) {
          return a.comparable ? -1 : 1;
        }
        return b.score - a.score;
      })
      .slice(0, topK)
      .map(({ comparable, ...hit }) => ({
        ...hit,
        matchedBy: comparable ? ('embedding' as const) : ('keyword' as const),
      }));

    return hits;
  }

  async listExamples(organizationId: string) {
    return this.readExamples(organizationId);
  }

  async replaceExamples(
    organizationId: string,
    examples: SnapsStoredStyleExample[]
  ) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const limited = examples.slice(0, MAX_STYLE_EXAMPLES);
      await this.writeExamples(organizationId, limited);
      return {
        total: limited.length,
      };
    });
  }

  async deleteExample(organizationId: string, exampleId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const examples = await this.readExamples(organizationId);
      const next = examples.filter((example) => example.id !== exampleId);
      await this.writeExamples(organizationId, next);
      return {
        deleted: next.length !== examples.length,
        total: next.length,
      };
    });
  }

  async importExamples(organizationId: string, examples: unknown[] = []) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const current = await this.readExamples(organizationId);
      const arrived = examples
        .map((example) => this.normalizeImportedExample(organizationId, example))
        .filter((example): example is SnapsStoredStyleExample => !!example);
      // Bounds the merge below. Everything past the cap is discarded here and
      // never reaches `deduped`, so the count has to be carried to `dropped`
      // by hand - see the return.
      const incoming = arrived.slice(0, MAX_STYLE_EXAMPLES);
      const deduped = this.mergeByKey(
        [...incoming, ...current],
        (example) => example.id || `${example.platform}:${example.content.trim().toLowerCase()}`
      );
      const merged = deduped.slice(0, MAX_STYLE_EXAMPLES);

      await this.writeExamples(organizationId, merged);
      return {
        // What the caller sent that was usable, not what survived - the four
        // other stores all report it that way and an operator comparing a
        // backup against the response needs the number they can compare.
        imported: arrived.length,
        total: merged.length,
        // Two ways to lose an example, and only one of them used to be
        // counted. Measured: importing 505 examples answered
        // `imported: 500, dropped: 0` - the incoming cap had thrown five away
        // before the merge could see them, so the response told the operator
        // their restore was complete when it was not. The second term is the
        // one the comment in importSources describes; the first is the cut
        // above.
        dropped:
          arrived.length - incoming.length + (deduped.length - merged.length),
      };
    });
  }

  private async readExamples(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId),
          new Error('file does not hold a JSON array'),
          '스타일 예시'
        );
        return [] as SnapsStoredStyleExample[];
      }
      return parsed
        .map((example) => this.normalizeImportedExample(organizationId, example))
        .filter((example): example is SnapsStoredStyleExample => !!example)
        .slice(0, MAX_STYLE_EXAMPLES);
    } catch (error) {
      warnUnreadableJsonFile(this.filePath(organizationId), error, '스타일 예시');
      return [] as SnapsStoredStyleExample[];
    }
  }

  private async writeExamples(
    organizationId: string,
    examples: SnapsStoredStyleExample[]
  ) {
    await ensureSnapsDataDir(this.dataDir);
    // The read above answers [] for a file it cannot parse, so without this a
    // truncated file would be overwritten by the next write and the entries
    // it still held would be gone for good. Move it aside first.
    const target = this.filePath(organizationId);
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(examples, null, 2));
  }

  private filePath(organizationId: string) {
    // Not a plain replace: two different ids can escape to the same string
    // and share one file. See snaps/storage/org-file-key.ts.
    const safeOrg = snapsOrgFileKey(organizationId);
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
      // Stored exactly as given until now, like the three blobs in
      // snaps/storage/bounded-record.ts. Real ones are counts - the demo
      // workspace's are `{likes, comments, shares}` at 45 characters - while an
      // imported backup could hold anything: measured, a 200KB string and a
      // 2,000-level nesting both went in untouched.
      metrics: boundStoredRecord(example.metrics, METRICS_BOUNDS, '지표'),
      embedding: this.cleanEmbedding(example.embedding),
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
    // Composed first: HANGUL_START is the composed block, so a decomposed
    // example scored zero overlap against a composed query and never matched.
    return snapsComposeHangul(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s#]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  /**
   * How much of the query the example covers, 0..1.
   *
   * Matching was exact, which works for English and barely works for Korean. A
   * Korean noun carries its particle in the same whitespace token, so `환절기`
   * and `환절기에는` are two different strings for the same word. Measured
   * before this changed:
   *
   *   `환절기 건강관리 팁` against `환절기에는 건강관리가 무엇보다 중요합니다`
   *   scored 0.00 - the same score as `오늘 점심 메뉴는 김치찌개입니다`, which
   *   has nothing to do with it. `카페 신메뉴 홍보` against `저희 카페의
   *   신메뉴를 소개합니다` also scored 0.00.
   *
   * This is the path every search takes whenever embeddings are unavailable,
   * and addExample() stores no embedding whenever the embed call fails, so one
   * Ollama hiccup leaves the store ranking Korean examples at random.
   *
   * A token now counts when one side starts with the other, which is where a
   * Korean particle attaches. It over-matches occasionally - `카페` also finds
   * `카페인` - but this is a ranking fallback, not a filter, and a related
   * neighbour beats scoring the right example at zero.
   */
  /**
   * Whether two tokens are the same word wearing different particles.
   *
   * The rule was "one starts with the other", which only fires when one side is
   * the bare noun. A stored example is running prose, so both sides usually
   * carry a particle and neither is a prefix of the other: measured,
   * `환절기가` against `환절기에는` scored 0, and at 0 an unrelated English
   * example ranked first.
   *
   * Two syllables of shared prefix is the smallest unit that carries meaning in
   * Korean - a single one matches far too much (`신제품` and `신뢰`). The
   * over-matching this still admits is the trade the prefix rule already
   * documents: a ranking fallback, not a filter.
   */
  private sharesStem(token: string, content: string) {
    if (content.startsWith(token) || token.startsWith(content)) {
      return true;
    }
    if (!HANGUL_START.test(token) || !HANGUL_START.test(content)) {
      return false;
    }
    const limit = Math.min(token.length, content.length);
    let shared = 0;
    while (shared < limit && token[shared] === content[shared]) {
      shared += 1;
    }
    return shared >= 2;
  }

  private tokenScore(queryTokens: string[], contentTokens: string[]) {
    if (!queryTokens.length || !contentTokens.length) {
      return 0;
    }

    const contentSet = new Set(contentTokens);
    const matched = queryTokens.filter((token) => {
      if (contentSet.has(token)) {
        return true;
      }
      // Both directions: the query is operator text too, so the particle can
      // just as easily be on that side - measured symmetric at 0.67 either way.
      // No minimum length is checked here because tokenize() already drops
      // anything shorter than two characters; adding one would have been a
      // condition that can never be false.
      return contentTokens.some((content) =>
        this.sharesStem(token, content)
      );
    }).length;
    return matched / queryTokens.length;
  }

  /**
   * Cosine similarity, or undefined when the two vectors cannot be compared.
   *
   * This used to compare `Math.min(a.length, b.length)` components, so a vector
   * produced by a different embed model was scored on its first N values and
   * came back as a confident number: measured, a 2-component stored vector
   * against a 6-component query returned 0.9333 for content that had nothing to
   * do with the query. Vectors of different lengths come from different models
   * and are not comparable at all; saying so lets the caller fall back to the
   * token score instead of ranking on an invented number.
   */
  private cosine(a: number[], b?: number[]): number | undefined {
    if (!b || a.length !== b.length) {
      return undefined;
    }
    const length = a.length;
    if (!length) {
      return undefined;
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
      // A zero vector has no direction, so there is no similarity to report.
      return undefined;
    }

    return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
  }

  /**
   * Drops an embedding that could not have come from an embedding model.
   *
   * nomic-embed-text, the model this ships with, returns 768 values; the
   * largest common alternative returns 4,096. Nothing capped the length, so an
   * imported backup carrying a 2,000,000-value array was stored whole - 28.8MB
   * across four records - and every search then ran a cosine over all of it.
   *
   * Dropped rather than truncated: a shortened vector is not the vector the
   * text embeds to, and cosine() refuses vectors of unequal length anyway, so
   * a truncated one would silently never match. Without an embedding the
   * example still works through keyword scoring, which is the same path any
   * example takes when the embed call fails.
   */
  private cleanEmbedding(value: unknown): number[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    if (value.length > MAX_EMBEDDING_VALUES) {
      return undefined;
    }
    return value.filter(
      (item) => typeof item === 'number' && Number.isFinite(item)
    );
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
      ? snapsClampText(value.trim(), 500)
      : undefined;
  }

  // Five stores carried a byte-identical copy of this, and every copy left
  // the temporary file behind when the rename failed. Shared now; see
  // snaps/storage/atomic-json-write.ts.
  // No lock here: the mutating methods above already hold the per-file lock
  // for the whole read-modify-write, and taking it again from inside would
  // wait on a lock this same call already owns - a deadlock.
  private async atomicWrite(filePath: string, content: string) {
    await writeJsonFileAtomically(filePath, content);
  }
}
