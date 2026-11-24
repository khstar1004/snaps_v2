import { Injectable } from '@nestjs/common';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import {
  SnapsFeedbackImportDto,
  SnapsFeedbackInputDto,
  SnapsFeedbackSentiment,
  snapsFeedbackSentiments,
  SnapsFeedbackSummaryRequestDto,
} from '@gitroom/nestjs-libraries/snaps/dto/feedback-inbox.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { ensureSnapsDataDir } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';

export type SnapsFeedbackItem = SnapsFeedbackInputDto & {
  id: string;
  organizationId: string;
  sentiment: SnapsFeedbackSentiment;
  conversionSignals: SnapsFeedbackConversionSignalId[];
  importedAt: string;
};

type SnapsFeedbackConversionSignalId =
  | 'link-request'
  | 'purchase-intent'
  | 'pricing'
  | 'how-to-use'
  | 'brand-mention'
  | 'collaboration'
  | 'complaint-risk';

type SnapsFeedbackConversionSignal = {
  id: SnapsFeedbackConversionSignalId;
  label: string;
  priority: 'high' | 'medium' | 'low';
  count: number;
  examples: string[];
  action: string;
};

type SnapsInboxSummary = {
  // Which path produced this summary, matching the label the other snaps
  // results carry. Optional on the type because deterministicSummary()
  // builds the shape before summarize() stamps the label on it.
  provider?: 'ollama' | 'deepseek' | 'rule-fallback';
  total: number;
  byPlatform: Record<string, number>;
  bySentiment: Record<SnapsFeedbackSentiment, number>;
  conversionSignals: SnapsFeedbackConversionSignal[];
  highlights: string[];
  replySuggestions: Array<{
    target: SnapsFeedbackSentiment;
    reply: string;
  }>;
};

const MAX_FEEDBACK_ITEMS = 1000;

const conversionSignalDefinitions: Array<
  Omit<SnapsFeedbackConversionSignal, 'count' | 'examples'>
> = [
  {
    id: 'link-request',
    label: '링크 요청',
    priority: 'high',
    action: '관련 링크, 자료, 신청 경로를 답글 초안에 바로 포함합니다.',
  },
  {
    id: 'purchase-intent',
    label: '구매/신청 의도',
    priority: 'high',
    action: '구매/신청 CTA와 DM 유도 문구를 우선 준비합니다.',
  },
  {
    id: 'pricing',
    label: '가격 문의',
    priority: 'high',
    action: '가격 안내 가능 범위와 상담 유도 답글을 분리합니다.',
  },
  {
    id: 'how-to-use',
    label: '사용법 질문',
    priority: 'medium',
    action: '짧은 사용법 답변과 후속 튜토리얼 소재를 만듭니다.',
  },
  {
    id: 'brand-mention',
    label: '브랜드 언급',
    priority: 'medium',
    action: '브랜드 모니터링 대상으로 표시하고 톤을 맞춘 대응을 준비합니다.',
  },
  {
    id: 'collaboration',
    label: '협업 문의',
    priority: 'medium',
    action: '협업 범위와 연락 채널을 묻는 응대 초안을 만듭니다.',
  },
  {
    id: 'complaint-risk',
    label: '불만 리스크',
    priority: 'high',
    action: '원인 확인과 공개 답변/비공개 후속 조치를 나눠 준비합니다.',
  },
];

/**
 * The two judgements that are made twice.
 *
 * `classify()` decides a comment's sentiment and `detectConversionSignals()`
 * decides what the operator should do about it, and both have to agree about
 * what a complaint looks like and what an approach looks like. They were two
 * hand-written copies, and they drifted:
 *
 *   품질이 기대 이하네요       sentiment=complaint      signals=-
 *   배송이 느립니다            sentiment=complaint      signals=-
 *   광고문의 드립니다          sentiment=collaboration  signals=-
 *
 * The first two because the complaint list grew in one copy and not the other;
 * the last because one copy wrote `광고 문의` with a literal space and the
 * other `광고\s*문의`. A comment classified as a complaint that carries no
 * complaint-risk signal gets no follow-up prompt, which is the whole point of
 * the signal.
 *
 * One pattern each, used by both.
 */
const SNAPS_COMPLAINT_PATTERN =
  /(별로|싫|문제(?!\s*없)|불편|실망|최악|틀렸|아쉽|불만|기대\s*이하|느[리려림립린렸]|bad|wrong|disappoint|slow)/i;

const SNAPS_COLLABORATION_PATTERN =
  /(협업|제휴|콜라보|광고\s*문의|광고\s*제안|partnership|collab|sponsor)/i;

@Injectable()
export class SnapsFeedbackInboxService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  constructor(private readonly ollama: OllamaClient) {}

  async importItems(organizationId: string, body?: SnapsFeedbackImportDto) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const stored = await this.readItems(organizationId);
      const nextItems = (Array.isArray(body?.items) ? body.items : [])
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsFeedbackItem => !!item)
        .slice(0, MAX_FEEDBACK_ITEMS);
      const deduped = this.dedupe([...nextItems, ...stored]);
      const merged = deduped.slice(0, MAX_FEEDBACK_ITEMS);
      await this.writeItems(organizationId, merged);

      return {
        imported: nextItems.length,
        total: merged.length,
        // The cap keeps incoming items first, so anything past it is an item the
        // inbox already held. This is the path /snaps/inbox/import and
        // /snaps/inbox/import-post-comments use - the ordinary way feedback
        // arrives - and it was the one import method left reporting only what it
        // added. See importSources in source-library.service.ts.
        dropped: deduped.length - merged.length,
        items: nextItems,
      };
    });
  }

  async importStoredItems(organizationId: string, items: unknown[] = []) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const stored = await this.readItems(organizationId);
      const arrived = items
        .map((item) => this.normalizeStoredItem(organizationId, item))
        .filter((item): item is SnapsFeedbackItem => !!item);
      // Bounds the merge below. Everything past the cap is discarded here and
      // never reaches `deduped`, so the count has to be carried to `dropped`
      // by hand - see the return.
      const incoming = arrived.slice(0, MAX_FEEDBACK_ITEMS);
      const deduped = this.dedupe([...incoming, ...stored]);
      const merged = deduped.slice(0, MAX_FEEDBACK_ITEMS);
      await this.writeItems(organizationId, merged);

      return {
        // What the caller sent that was usable, not what survived - see
        // importExamples in rag/vector-store.service.ts.
        imported: arrived.length,
        total: merged.length,
        // Two ways to lose an item and only one used to be counted; the
        // incoming cap above threw the rest away before the merge could see
        // them and the response still said `dropped: 0`.
        dropped:
          arrived.length - incoming.length + (deduped.length - merged.length),
      };
    });
  }

  async listItems(
    organizationId: string,
    filters: {
      platform?: SnapsTargetPlatform;
      sentiment?: SnapsFeedbackSentiment;
    } = {}
  ) {
    const items = await this.readItems(organizationId);
    return items.filter((item) => {
      return (
        (!filters.platform || item.platform === filters.platform) &&
        (!filters.sentiment || item.sentiment === filters.sentiment)
      );
    });
  }

  async deleteItem(organizationId: string, itemId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const items = await this.readItems(organizationId);
      const next = items.filter((item) => item.id !== itemId);
      await this.writeItems(organizationId, next);
      return {
        deleted: next.length !== items.length,
        total: next.length,
      };
    });
  }

  async clearItems(organizationId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const items = await this.readItems(organizationId);
      await this.writeItems(organizationId, []);
      return {
        deleted: items.length,
        total: 0,
      };
    });
  }

  async summarize(organizationId: string, body: SnapsFeedbackSummaryRequestDto = {}) {
    const inlineItems = Array.isArray(body?.items) ? body.items : [];
    const items = inlineItems.length
      ? inlineItems
          .map((item) => this.normalizeItem(organizationId, item))
          .filter((item): item is SnapsFeedbackItem => !!item)
      : await this.listItems(organizationId, {
          platform: body?.platform,
          sentiment: this.normalizeSentiment(body?.sentiment),
        });

    const fallback = this.deterministicSummary(items);
    if (!items.length) {
      return fallback;
    }

    try {
      const generated = await this.ollama.chatJson<Partial<SnapsInboxSummary>>([
        {
          role: 'system',
          content:
            'You are snaps feedback analyst. Return compact JSON only with total, byPlatform, bySentiment, conversionSignals, highlights, and replySuggestions. Write Korean output.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            fallback,
            // Passing `fallback` alone gave the model a shape to imitate but
            // also an answer to copy: measured against the live DeepSeek API it
            // echoed the single fallback reply verbatim, so the call cost a
            // request and added nothing. Naming the sentiment enum and asking
            // for one reply per sentiment actually present produced a distinct,
            // comment-specific draft for every sentiment in the batch.
            rules: [
              `replySuggestions[].target must be one of: ${snapsFeedbackSentiments.join(
                ', '
              )}.`,
              'Write one replySuggestion for each sentiment that actually appears in comments, up to 6.',
              'Base each reply on the real comments, and do not copy the fallback text.',
              'highlights: 2-4 short Korean lines naming what needs operator attention.',
              'fallback is the deterministic baseline for shape reference only; improve on it.',
            ],
            comments: items.slice(0, 80).map((item) => ({
              platform: item.platform,
              sentiment: item.sentiment,
              author: item.author,
              content: item.content,
              conversionSignals: item.conversionSignals,
            })),
          }),
        },
      ]);
      // normalizeSummary() fills every missing field from the deterministic
      // fallback, so a partially usable answer is still a model result; a
      // thrown call is not. Say which, the way the other snaps results do.
      return {
        ...this.normalizeSummary(generated, fallback, items),
        // The engine that actually answered; was the literal 'ollama'.
        provider: this.ollama.provider(),
      };
    } catch {
      return { ...fallback, provider: 'rule-fallback' as const };
    }
  }

  private normalizeItem(
    organizationId: string,
    item: SnapsFeedbackInputDto
  ): SnapsFeedbackItem | undefined {
    if (!item || typeof item !== 'object') {
      return undefined;
    }

    const platform = this.cleanOptionalText(item.platform, 80) || '';
    // A customer's comment, stored as they wrote it.
    const content = snapsCleanBodyText(item.content, 5000);
    if (
      !content ||
      !(snapsTargetPlatforms as readonly string[]).includes(platform)
    ) {
      return undefined;
    }

    return {
      ...item,
      id: makeId(14),
      organizationId,
      platform: platform as SnapsTargetPlatform,
      content,
      postId: this.cleanOptionalText(item.postId, 200),
      author: this.cleanOptionalText(item.author, 200),
      sourceUrl: this.cleanOptionalText(item.sourceUrl, 2000),
      createdAt: this.cleanOptionalText(item.createdAt, 80),
      sentiment: this.classify(content),
      conversionSignals: this.detectConversionSignals(content),
      importedAt: new Date().toISOString(),
    };
  }

  private normalizeStoredItem(
    organizationId: string,
    value: unknown
  ): SnapsFeedbackItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const item = value as Partial<SnapsFeedbackItem>;
    const platform = this.cleanOptionalText(item.platform, 80) || '';
    // A customer's comment, stored as they wrote it.
    const content = snapsCleanBodyText(item.content, 5000);
    if (
      !content ||
      !(snapsTargetPlatforms as readonly string[]).includes(platform)
    ) {
      return undefined;
    }

    const sentiment = this.normalizeSentiment(item.sentiment);
    return {
      id: this.cleanOptionalText(item.id, 160) || makeId(14),
      organizationId,
      platform: platform as SnapsTargetPlatform,
      content,
      postId: this.cleanOptionalText(item.postId, 200),
      author: this.cleanOptionalText(item.author, 200),
      sourceUrl: this.cleanOptionalText(item.sourceUrl, 2000),
      createdAt: this.cleanOptionalText(item.createdAt, 80),
      sentiment: sentiment || this.classify(content),
      conversionSignals: this.normalizeConversionSignalIds(
        item.conversionSignals,
        content
      ),
      importedAt: this.cleanOptionalText(item.importedAt, 80) || new Date().toISOString(),
    };
  }

  private deterministicSummary(items: SnapsFeedbackItem[]): SnapsInboxSummary {
    const byPlatform = this.countBy(items, (item) => item.platform);
    const bySentiment = {
      question: 0,
      praise: 0,
      complaint: 0,
      spam: 0,
      collaboration: 0,
      other: 0,
      ...this.countBy(items, (item) => item.sentiment),
    } as Record<SnapsFeedbackSentiment, number>;

    const highlights = [
      `총 ${items.length}개의 피드백을 확인했습니다.`,
      bySentiment.question
        ? `질문성 댓글 ${bySentiment.question}개는 답변 우선순위가 높습니다.`
        : '',
      bySentiment.complaint
        ? `불만/부정 반응 ${bySentiment.complaint}개는 원인 확인이 필요합니다.`
        : '',
      bySentiment.collaboration
        ? `협업 문의 ${bySentiment.collaboration}개는 별도 영업 응대가 필요합니다.`
        : '',
      this.highPrioritySignalCount(items)
        ? `링크/구매/가격 같은 고전환 신호 ${this.highPrioritySignalCount(items)}개를 우선 처리하세요.`
        : '',
    ].filter(Boolean);

    return {
      total: items.length,
      byPlatform,
      bySentiment,
      conversionSignals: this.buildConversionSignals(items),
      highlights,
      replySuggestions: [
        {
          target: 'question',
          reply: '자료 링크나 사용 경로가 필요한 부분이면 바로 확인하실 수 있는 링크를 함께 안내드리겠습니다.',
        },
        {
          target: 'question',
          reply: '문의 주셔서 감사합니다. 핵심만 먼저 답변드리면, 이 부분은 다음 게시물에서 더 자세히 정리하겠습니다.',
        },
        {
          target: 'complaint',
          reply: '불편하게 느끼신 부분 확인했습니다. 말씀해주신 지점을 기준으로 내용과 안내를 다시 점검하겠습니다.',
        },
        {
          target: 'collaboration',
          reply: '제안 감사합니다. 협업 범위와 일정 확인을 위해 DM 또는 메일로 세부 내용을 보내주세요.',
        },
      ],
    };
  }

  private normalizeSummary(
    value: unknown,
    fallback: SnapsInboxSummary,
    items: SnapsFeedbackItem[] = []
  ): SnapsInboxSummary {
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const summary = value as Partial<SnapsInboxSummary>;
    return {
      // Counts are facts this service already has: the fallback is built by
      // counting the stored items the model was shown, so the model cannot know
      // better. Taking `Math.max(model, real)` let a hallucinated number
      // through - measured with four items in the store, a model answering
      // `{ total: 99, bySentiment: { question: 50, praise: 50 } }` produced a
      // summary reading 99 responses with a distribution summing to 102.
      total: fallback.total,
      byPlatform: this.countsMatchingTotal(
        this.normalizeNumberRecord(summary.byPlatform, fallback.byPlatform),
        fallback.byPlatform,
        fallback.total
      ),
      // The distribution itself is the model's to improve - it reads the text
      // and the rule fallback only matches keywords - but only while it still
      // describes the same items.
      bySentiment: this.countsMatchingTotal(
        this.normalizeSentimentRecord(summary.bySentiment, fallback.bySentiment),
        fallback.bySentiment,
        fallback.total
      ),
      // The same two rules as the fields above it, which this was left out
      // of: a signal cannot have occurred more often than there are responses,
      // and its examples are quotes - the deterministic side takes them
      // verbatim from the stored items, so the model does not get to write
      // new ones.
      conversionSignals: this.normalizeConversionSignals(
        summary.conversionSignals,
        fallback.conversionSignals,
        fallback.total,
        items
      ),
      highlights: this.normalizeStringArray(summary.highlights, fallback.highlights),
      replySuggestions: this.normalizeReplySuggestions(
        summary.replySuggestions,
        fallback.replySuggestions
      ),
    };
  }

  private normalizeConversionSignals(
    value: unknown,
    fallback: SnapsFeedbackConversionSignal[],
    total = 0,
    items: SnapsFeedbackItem[] = []
  ) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const byId = new Map(fallback.map((signal) => [signal.id, signal]));
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const signal = item as Partial<SnapsFeedbackConversionSignal>;
      const id = this.normalizeConversionSignalId(signal.id);
      if (!id) {
        continue;
      }
      const definition = this.conversionSignalDefinition(id);
      const existing = byId.get(id);
      // Bounded above as well as below. The model reads the text and may spot
      // an occurrence the keyword rules missed, so it can raise the count -
      // but not past the number of responses that were summarized, which is a
      // fact this service counted. Measured with two responses in the store, a
      // model answering `{ id: 'purchase-intent', count: 40 }` produced a
      // signal claiming forty purchase intents out of two.
      const count = Math.min(
        Math.max(
          this.normalizeNumber(signal.count, existing?.count || 0),
          existing?.count || 0
        ),
        total || existing?.count || 0
      );
      const quoted = this.normalizeStringArray(signal.examples, [])
        .map((example) => this.quoteFromItems(example, items))
        .filter(Boolean)
        .slice(0, 3);
      const examples = quoted.length ? quoted : existing?.examples || [];
      byId.set(id, {
        id,
        label: this.cleanOptionalText(signal.label, 80) || definition.label,
        priority: this.normalizeSignalPriority(signal.priority) || definition.priority,
        count,
        examples,
        action: this.cleanOptionalText(signal.action, 240) || definition.action,
      });
    }

    return Array.from(byId.values())
      .filter((signal) => signal.count > 0)
      .sort((a, b) => this.priorityWeight(a.priority) - this.priorityWeight(b.priority));
  }

  private normalizeNumber(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private normalizeNumberRecord(
    value: unknown,
    fallback: Record<string, number>
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    // `value` here is the model's JSON answer, so its keys are whatever the
    // model wrote. On a plain object `all['constructor']` reads the Object
    // function, and Math.max of a function is NaN - the platform's count came
    // back as null in the summary. Null-prototype accumulator, same treatment as
    // groupMetrics in the report generator and countBy below.
    const all = Object.create(null) as Record<string, number>;
    for (const [key, count] of Object.entries(fallback)) {
      all[key] = count;
    }
    for (const [key, count] of Object.entries(value)) {
      const current = all[key] || 0;
      all[key] = Math.max(this.normalizeNumber(count, current), current);
    }
    return all;
  }

  /**
   * Keeps a count breakdown only while it adds up to the number of items there
   * actually are; otherwise the deterministic one, whose sum is the item count
   * by construction.
   */
  private countsMatchingTotal<T extends Record<string, number>>(
    candidate: T,
    fallback: T,
    total: number
  ): T {
    const sum = Object.values(candidate).reduce(
      (running, value) => running + (Number(value) || 0),
      0
    );
    return sum === total ? candidate : fallback;
  }

  private normalizeSentimentRecord(
    value: unknown,
    fallback: Record<SnapsFeedbackSentiment, number>
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    // Replaces rather than merges. Merging with Math.max meant the model could
    // only ever add to the rule-based counts, so a correct redistribution -
    // `{question: 2, complaint: 1, praise: 1}` over four items - came out as a
    // sum of five and was thrown away by the total check. The model reads the
    // text and the rule fallback only matches keywords, so its classification
    // is the one worth having when it describes the same items.
    const normalized = Object.fromEntries(
      Object.keys(fallback).map((key) => [key, 0])
    ) as Record<SnapsFeedbackSentiment, number>;
    let sawOne = false;
    for (const [key, count] of Object.entries(value)) {
      const sentiment = this.normalizeSentiment(key);
      if (sentiment) {
        normalized[sentiment] = this.normalizeNumber(count, 0);
        sawOne = true;
      }
    }
    return sawOne ? normalized : fallback;
  }

  private normalizeStringArray(value: unknown, fallback: string[]) {
    return Array.isArray(value)
      ? value
          .map((item) =>
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean'
              ? String(item).trim()
              : ''
          )
          .filter(Boolean)
          .slice(0, 8)
      : fallback;
  }

  private normalizeReplySuggestions(
    value: unknown,
    fallback: SnapsInboxSummary['replySuggestions']
  ) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const suggestions = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const suggestion = item as Partial<SnapsInboxSummary['replySuggestions'][number]>;
        const target = this.normalizeSentiment(suggestion.target);
        const reply = String(suggestion.reply || '').trim();
        return target && reply ? { target, reply } : undefined;
      })
      .filter(
        (
          item
        ): item is {
          target: SnapsFeedbackSentiment;
          reply: string;
        } => !!item
      );

    return suggestions.length ? suggestions.slice(0, 6) : fallback;
  }

  /**
   * Which bucket a comment goes in when the model is not available.
   *
   * Measured against ten labelled Korean comments: four went to the wrong
   * bucket, and every one of them cost the operator something.
   *
   * - `문제없이 잘 쓰고 있어요` was a complaint, because `문제` matches inside
   *   `문제없이`, which says the opposite.
   * - `광고 문의 드립니다. 제휴 가능할까요?` was spam. Bare `광고` sat in the
   *   spam list ahead of the collaboration list, so `광고 문의` there could
   *   never be reached - a business enquiry filed as junk.
   * - `광고가 너무 많아서 불편해요` was spam for the same reason, so a customer
   *   complaint disappeared.
   * - `이 제품 링크 https://... 이거 맞나요?` was spam because any URL counted.
   *
   * Collaboration is tested first now, a link only counts alongside promotional
   * wording, and `광고` on its own is not a spam signal at all - the spam
   * vocabulary that remains says what it is.
   */
  private classify(content: string): SnapsFeedbackSentiment {
    const text = content.toLowerCase();

    // Before spam: an enquiry usually says 광고 문의, and a spam rule that
    // matched bare 광고 swallowed it.
    if (SNAPS_COLLABORATION_PATTERN.test(text)) {
      return 'collaboration';
    }
    const link = /(https?:\/\/|\bwww\.)/i.test(text);
    const promoHits = (
      text.match(/(무료|가입|클릭|수익|대출|코인|이벤트\s*참여|보장|free money|crypto pump)/gi) ||
      []
    ).length;
    // A link plus one pitch word, or several pitch words with no link at all:
    // `가입하면 수익 보장! 클릭하세요` carries three and no URL, and was
    // classified as `other` - so the one comment kind the operator most wants
    // filtered sat in the same bucket as `음...`. One pitch word on its own
    // stays out of this: `무료 배송이라 좋아요` is a compliment.
    if (
      /(바카라|카지노|토토|먹튀|loan shark)/i.test(text) ||
      (link && promoHits >= 1) ||
      promoHits >= 3
    ) {
      return 'spam';
    }
    if (/[?？]|(어떻게|왜|언제|무엇|가능한가|궁금|how|why|when|what)/i.test(text)) {
      return 'question';
    }
    // Complaint before praise, so a mixed comment is answered rather than
    // filed as approval. Measured, `좋긴 한데 배송이 너무 느려요` came back as
    // praise: the only complaint words were speed words, and none of them were
    // listed. `기대 이하` is the other phrasing Korean reviews reach for that
    // nothing here matched.
    //
    // 문제없- and 문제 없- say the opposite of 문제.
    if (SNAPS_COMPLAINT_PATTERN.test(text)) {
      return 'complaint';
    }
    // `잘` on its own is not praise - `잘 안 돼요` is the opposite - so the
    // collocations are listed rather than the word. `만족`, `잘 봤`, `잘 쓰`
    // were the three most common approvals in the sample that fell through to
    // `other`, which reads to the operator as a comment with nothing in it.
    if (
      /(좋|감사|유용|최고|도움|멋지|만족|유익|잘\s*봤|잘\s*쓰|great|thanks|love|useful)/i.test(
        text
      )
    ) {
      return 'praise';
    }
    return 'other';
  }

  private detectConversionSignals(content: string): SnapsFeedbackConversionSignalId[] {
    const text = content.toLowerCase();
    const signals: SnapsFeedbackConversionSignalId[] = [];
    if (/(링크|url|link|자료|출처|사이트|페이지|어디서\s*봐)/i.test(text)) {
      signals.push('link-request');
    }
    if (/(구매|신청|결제|주문|살\s*수|어떻게\s*사|buy|purchase|order)/i.test(text)) {
      signals.push('purchase-intent');
    }
    if (/(가격|비용|요금|얼마|견적|price|cost|pricing)/i.test(text)) {
      signals.push('pricing');
    }
    if (/(사용법|방법|어떻게|가이드|튜토리얼|how\s*to|guide)/i.test(text)) {
      signals.push('how-to-use');
    }
    if (/(@[\w._-]+|브랜드|회사|서비스|제품|비교)/i.test(text)) {
      signals.push('brand-mention');
    }
    if (SNAPS_COLLABORATION_PATTERN.test(text)) {
      signals.push('collaboration');
    }
    // The same pattern classify() uses, not a copy of it. Both the negation
    // guard (문제없- says the opposite of 문제) and every word added since live
    // in one place now - see SNAPS_COMPLAINT_PATTERN.
    if (SNAPS_COMPLAINT_PATTERN.test(text)) {
      signals.push('complaint-risk');
    }
    return [...new Set(signals)];
  }

  private normalizeConversionSignalIds(value: unknown, content: string) {
    const incoming = Array.isArray(value)
      ? value
          .map((item) => this.normalizeConversionSignalId(item))
          .filter((item): item is SnapsFeedbackConversionSignalId => !!item)
      : [];
    const detected = this.detectConversionSignals(content);
    return [...new Set([...incoming, ...detected])];
  }

  private normalizeConversionSignalId(
    value: unknown
  ): SnapsFeedbackConversionSignalId | undefined {
    const id = String(value || '');
    return conversionSignalDefinitions.some((signal) => signal.id === id)
      ? (id as SnapsFeedbackConversionSignalId)
      : undefined;
  }

  private normalizeSignalPriority(value: unknown) {
    return value === 'high' || value === 'medium' || value === 'low'
      ? value
      : undefined;
  }

  private buildConversionSignals(items: SnapsFeedbackItem[]) {
    const byId = new Map<
      SnapsFeedbackConversionSignalId,
      SnapsFeedbackConversionSignal
    >();
    for (const item of items) {
      for (const id of item.conversionSignals) {
        const definition = this.conversionSignalDefinition(id);
        const current =
          byId.get(id) ||
          ({
            ...definition,
            count: 0,
            examples: [],
          } as SnapsFeedbackConversionSignal);
        current.count += 1;
        if (current.examples.length < 3) {
          current.examples.push(snapsClampText(item.content, 120));
        }
        byId.set(id, current);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const priorityDelta =
        this.priorityWeight(a.priority) - this.priorityWeight(b.priority);
      return priorityDelta || b.count - a.count;
    });
  }

  /**
   * The response text a string quotes, or '' if it quotes none of them.
   *
   * The examples beside a conversion signal read as quotes, and the
   * deterministic builder makes them quotes - `snapsClampText(item.content,
   * 120)` of the item that carried the signal. Letting the model replace them
   * put invented sentences in the same place, next to a count, where an
   * operator reads them as what a customer wrote.
   *
   * Whitespace is normalized on both sides because a model re-wraps a quote it
   * copied; nothing else is, so a paraphrase is not a quote and does not pass.
   *
   * Returns the quote rather than a boolean so the normalized form is what the
   * operator sees.
   */
  private quoteFromItems(candidate: string, items: SnapsFeedbackItem[]) {
    const needle = candidate.replace(/\s+/g, ' ').trim();
    if (!needle) {
      return '';
    }
    const found = items.some((item) =>
      String(item?.content || '')
        .replace(/\s+/g, ' ')
        .trim()
        .includes(needle)
    );
    // The normalized form, not what the model sent: it is the same words, and
    // a quote that reaches the operator with a line break in the middle of a
    // sentence reads like the response was written that way.
    return found ? needle : '';
  }

  private highPrioritySignalCount(items: SnapsFeedbackItem[]) {
    const highPrioritySignals = new Set(
      conversionSignalDefinitions
        .filter((signal) => signal.priority === 'high')
        .map((signal) => signal.id)
    );
    return items.reduce(
      (total, item) =>
        total +
        item.conversionSignals.filter((signal) => highPrioritySignals.has(signal))
          .length,
      0
    );
  }

  private conversionSignalDefinition(id: SnapsFeedbackConversionSignalId) {
    return (
      conversionSignalDefinitions.find((signal) => signal.id === id) ||
      conversionSignalDefinitions[0]
    );
  }

  private priorityWeight(priority: 'high' | 'medium' | 'low') {
    return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
  }

  private normalizeSentiment(value: unknown): SnapsFeedbackSentiment | undefined {
    const sentiment = String(value || '');
    if (sentiment === 'positive') {
      return 'praise';
    }
    if (sentiment === 'negative') {
      return 'complaint';
    }
    return (snapsFeedbackSentiments as readonly string[]).includes(sentiment)
      ? (sentiment as SnapsFeedbackSentiment)
      : undefined;
  }

  private countBy<T extends string>(
    items: SnapsFeedbackItem[],
    pick: (item: SnapsFeedbackItem) => T
  ) {
    // Null-prototype for the same reason as groupMetrics in the report
    // generator: the key can be a platform name that arrived through
    // /snaps/inbox/import. On a plain object `all['__proto__']` reads
    // Object.prototype, so the count became "[object Object]1" and assigning
    // that back to __proto__ is ignored - the platform's count silently
    // vanished from the summary rather than being wrong.
    const all = Object.create(null) as Record<T, number>;
    for (const item of items) {
      const key = pick(item);
      all[key] = (all[key] || 0) + 1;
    }
    return all;
  }

  private dedupe(items: SnapsFeedbackItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = [
        item.platform,
        item.postId || '',
        item.author || '',
        item.content.trim().toLowerCase(),
      ].join('::');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    return typeof value === 'string' && value.trim()
      ? snapsClampText(value.trim().replace(/\s+/g, ' '), maxLength)
      : undefined;
  }

  private async readItems(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId),
          new Error('file does not hold a JSON array'),
          '피드백'
        );
        return [] as SnapsFeedbackItem[];
      }
      return parsed
        .map((item) => this.normalizeStoredItem(organizationId, item))
        .filter((item): item is SnapsFeedbackItem => !!item)
        .slice(0, MAX_FEEDBACK_ITEMS);
    } catch (error) {
      warnUnreadableJsonFile(this.filePath(organizationId), error, '피드백');
      return [] as SnapsFeedbackItem[];
    }
  }

  private async writeItems(organizationId: string, items: SnapsFeedbackItem[]) {
    await ensureSnapsDataDir(this.dataDir);
    // The matching read answers [] for a file it cannot parse, so without this
    // a truncated file would be overwritten here and whatever it still held
    // would be gone. Move it aside first; see snaps/storage.
    const target = this.filePath(organizationId);
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(items, null, 2));
  }

  private filePath(organizationId: string) {
    // Not a plain replace: two different ids can escape to the same string
    // and share one file. See snaps/storage/org-file-key.ts.
    const safeOrg = snapsOrgFileKey(organizationId);
    return path.join(this.dataDir, `${safeOrg}.feedback-inbox.json`);
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
