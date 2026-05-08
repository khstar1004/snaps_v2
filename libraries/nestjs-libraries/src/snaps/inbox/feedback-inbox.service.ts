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
  importedAt: string;
};

type SnapsInboxSummary = {
  total: number;
  byPlatform: Record<string, number>;
  bySentiment: Record<SnapsFeedbackSentiment, number>;
  highlights: string[];
  replySuggestions: Array<{
    target: SnapsFeedbackSentiment;
    reply: string;
  }>;
};

const MAX_FEEDBACK_ITEMS = 1000;

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
            'You are snaps feedback analyst. Return compact JSON only with total, byPlatform, bySentiment, highlights, and replySuggestions. Write Korean output.',
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
    ].filter(Boolean);

    return {
      total: items.length,
      byPlatform,
      bySentiment,
      highlights,
      replySuggestions: [
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
      highlights: this.normalizeStringArray(summary.highlights, fallback.highlights),
      replySuggestions: this.normalizeReplySuggestions(
        summary.replySuggestions,
        fallback.replySuggestions
      ),
    };
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
          .map((item) => String(item || '').trim())
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
