import { Injectable } from '@nestjs/common';
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

@Injectable()
export class SnapsFeedbackInboxService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  constructor(private readonly ollama: OllamaClient) {}

  async importItems(organizationId: string, body?: SnapsFeedbackImportDto) {
    const stored = await this.readItems(organizationId);
    const nextItems = (Array.isArray(body?.items) ? body.items : [])
      .map((item) => this.normalizeItem(organizationId, item))
      .filter((item): item is SnapsFeedbackItem => !!item)
      .slice(0, MAX_FEEDBACK_ITEMS);
    const merged = this.dedupe([...nextItems, ...stored]).slice(0, MAX_FEEDBACK_ITEMS);
    await this.writeItems(organizationId, merged);

    return {
      imported: nextItems.length,
      total: merged.length,
      items: nextItems,
    };
  }

  async importStoredItems(organizationId: string, items: unknown[] = []) {
    const stored = await this.readItems(organizationId);
    const incoming = items
      .map((item) => this.normalizeStoredItem(organizationId, item))
      .filter((item): item is SnapsFeedbackItem => !!item)
      .slice(0, MAX_FEEDBACK_ITEMS);
    const merged = this.dedupe([...incoming, ...stored]).slice(0, MAX_FEEDBACK_ITEMS);
    await this.writeItems(organizationId, merged);

    return {
      imported: incoming.length,
      total: merged.length,
    };
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
    const items = await this.readItems(organizationId);
    const next = items.filter((item) => item.id !== itemId);
    await this.writeItems(organizationId, next);
    return {
      deleted: next.length !== items.length,
      total: next.length,
    };
  }

  async clearItems(organizationId: string) {
    const items = await this.readItems(organizationId);
    await this.writeItems(organizationId, []);
    return {
      deleted: items.length,
      total: 0,
    };
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
      return this.normalizeSummary(generated, fallback);
    } catch {
      return fallback;
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
    const content = this.cleanOptionalText(item.content, 5000) || '';
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
    const content = this.cleanOptionalText(item.content, 5000) || '';
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
    fallback: SnapsInboxSummary
  ): SnapsInboxSummary {
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const summary = value as Partial<SnapsInboxSummary>;
    return {
      total: Math.max(
        this.normalizeNumber(summary.total, fallback.total),
        fallback.total
      ),
      byPlatform: this.normalizeNumberRecord(summary.byPlatform, fallback.byPlatform),
      bySentiment: this.normalizeSentimentRecord(
        summary.bySentiment,
        fallback.bySentiment
      ),
      conversionSignals: this.normalizeConversionSignals(
        summary.conversionSignals,
        fallback.conversionSignals
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
    fallback: SnapsFeedbackConversionSignal[]
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
      const count = Math.max(
        this.normalizeNumber(signal.count, existing?.count || 0),
        existing?.count || 0
      );
      const examples = this.normalizeStringArray(
        signal.examples,
        existing?.examples || []
      ).slice(0, 3);
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

    return Object.entries(value).reduce(
      (all, [key, count]) => ({
        ...all,
        [key]: Math.max(this.normalizeNumber(count, all[key] || 0), all[key] || 0),
      }),
      { ...fallback }
    );
  }

  private normalizeSentimentRecord(
    value: unknown,
    fallback: Record<SnapsFeedbackSentiment, number>
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    const normalized = { ...fallback };
    for (const [key, count] of Object.entries(value)) {
      const sentiment = this.normalizeSentiment(key);
      if (sentiment) {
        normalized[sentiment] = Math.max(
          this.normalizeNumber(count, normalized[sentiment] || 0),
          normalized[sentiment] || 0
        );
      }
    }
    return normalized;
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

  private classify(content: string): SnapsFeedbackSentiment {
    const text = content.toLowerCase();
    if (/(광고|바카라|카지노|loan|crypto pump|free money|http:\/\/|https:\/\/)/i.test(text)) {
      return 'spam';
    }
    if (/(협업|제휴|광고 문의|콜라보|partnership|collab|sponsor)/i.test(text)) {
      return 'collaboration';
    }
    if (/[?？]|(어떻게|왜|언제|무엇|가능한가|궁금|how|why|when|what)/i.test(text)) {
      return 'question';
    }
    if (/(별로|싫|문제|불편|실망|최악|틀렸|bad|wrong|disappoint)/i.test(text)) {
      return 'complaint';
    }
    if (/(좋|감사|유용|최고|도움|멋지|great|thanks|love|useful)/i.test(text)) {
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
    if (/(협업|제휴|광고 문의|콜라보|partnership|collab|sponsor)/i.test(text)) {
      signals.push('collaboration');
    }
    if (/(별로|싫|문제|불편|실망|최악|틀렸|bad|wrong|disappoint)/i.test(text)) {
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
          current.examples.push(item.content.slice(0, 120));
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
    return items.reduce((all, item) => {
      const key = pick(item);
      all[key] = (all[key] || 0) + 1;
      return all;
    }, {} as Record<T, number>);
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
      ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
      : undefined;
  }

  private async readItems(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsFeedbackItem[];
      }
      return parsed
        .map((item) => this.normalizeStoredItem(organizationId, item))
        .filter((item): item is SnapsFeedbackItem => !!item)
        .slice(0, MAX_FEEDBACK_ITEMS);
    } catch {
      return [] as SnapsFeedbackItem[];
    }
  }

  private async writeItems(organizationId: string, items: SnapsFeedbackItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(items, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.feedback-inbox.json`);
  }

  private async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
  }
}
