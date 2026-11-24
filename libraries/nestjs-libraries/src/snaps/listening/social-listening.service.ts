import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsFeedbackImportDto } from '@gitroom/nestjs-libraries/snaps/dto/feedback-inbox.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';

export type SnapsSocialListeningSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed';

export type SnapsSocialListeningIntent =
  | 'lead'
  | 'support'
  | 'complaint'
  | 'collaboration'
  | 'praise'
  | 'competitor'
  | 'spam'
  | 'awareness';

export type SnapsSocialListeningPriority = 'high' | 'medium' | 'low';

export type SnapsSocialListeningMentionInput = {
  platform?: unknown;
  author?: unknown;
  content?: unknown;
  text?: unknown;
  message?: unknown;
  postId?: unknown;
  sourceUrl?: unknown;
  url?: unknown;
  createdAt?: unknown;
  engagement?: unknown;
  likes?: unknown;
  comments?: unknown;
  sentiment?: unknown;
  intent?: unknown;
};

export type SnapsSocialListeningRequest = {
  title?: unknown;
  query?: unknown;
  keywords?: unknown;
  excludeKeywords?: unknown;
  platforms?: unknown;
  targetPlatforms?: unknown;
  importText?: unknown;
  sourceText?: unknown;
  items?: unknown;
  campaign?: unknown;
  tags?: unknown;
  includeNoise?: unknown;
};

export type SnapsSocialListeningListQuery = {
  search?: unknown;
  platform?: unknown;
  tag?: unknown;
};

export type SnapsSocialListeningSignalId =
  | 'purchase-intent'
  | 'pricing'
  | 'demo-request'
  | 'support-risk'
  | 'complaint-risk'
  | 'collaboration'
  | 'competitor-mention'
  | 'content-idea'
  | 'brand-health';

export type SnapsSocialListeningMention = {
  id: string;
  platform: SnapsTargetPlatform;
  author?: string;
  content: string;
  postId?: string;
  sourceUrl?: string;
  createdAt?: string;
  engagement: number;
  matchedKeywords: string[];
  excludedKeywords: string[];
  sentiment: SnapsSocialListeningSentiment;
  intent: SnapsSocialListeningIntent;
  priority: SnapsSocialListeningPriority;
  score: number;
  signals: SnapsSocialListeningSignalId[];
  noise: boolean;
  recommendedAction: string;
};

export type SnapsSocialListeningSignal = {
  id: SnapsSocialListeningSignalId;
  label: string;
  priority: SnapsSocialListeningPriority;
  count: number;
  examples: string[];
  action: string;
};

export type SnapsSocialListeningCluster = {
  id: string;
  label: string;
  count: number;
  priority: SnapsSocialListeningPriority;
  sentiment: SnapsSocialListeningSentiment;
  keywords: string[];
  examples: string[];
  action: string;
};

export type SnapsSocialListeningPreview = {
  product: 'snaps';
  source: 'snaps-social-listening';
  title: string;
  query: string;
  campaign?: string;
  keywords: string[];
  excludeKeywords: string[];
  targetPlatforms: SnapsTargetPlatform[];
  totalItems: number;
  matchedItems: number;
  highIntentItems: number;
  noiseItems: number;
  byPlatform: Record<string, number>;
  bySentiment: Record<SnapsSocialListeningSentiment, number>;
  byIntent: Record<SnapsSocialListeningIntent, number>;
  signals: SnapsSocialListeningSignal[];
  clusters: SnapsSocialListeningCluster[];
  mentions: SnapsSocialListeningMention[];
  warnings: string[];
  recommendations: string[];
};

export type SnapsSocialListeningMonitor = Omit<
  SnapsSocialListeningPreview,
  | 'totalItems'
  | 'matchedItems'
  | 'highIntentItems'
  | 'noiseItems'
  | 'byPlatform'
  | 'bySentiment'
  | 'byIntent'
  | 'signals'
  | 'clusters'
  | 'mentions'
  | 'warnings'
  | 'recommendations'
> & {
  id: string;
  organizationId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRun?: {
    matchedItems: number;
    highIntentItems: number;
    noiseItems: number;
    signals: SnapsSocialListeningSignal[];
    clusters: SnapsSocialListeningCluster[];
  };
};

export type SnapsSocialListeningRunResult = {
  product: 'snaps';
  source: 'snaps-social-listening-run';
  monitor: SnapsSocialListeningMonitor;
  preview: SnapsSocialListeningPreview;
};

const MAX_MONITORS = 120;
const MAX_IMPORT_ITEMS = 500;
const MAX_RESULT_ITEMS = 80;

const signalDefinitions: Array<Omit<SnapsSocialListeningSignal, 'count' | 'examples'>> = [
  {
    id: 'purchase-intent',
    label: '구매/신청 의도',
    priority: 'high',
    action: '상담, 신청, 결제 CTA가 있는 답글이나 DM 후속을 우선 배정합니다.',
  },
  {
    id: 'pricing',
    label: '가격 문의',
    priority: 'high',
    action: '요금 범위와 파일럿 제안을 분리한 응대 초안을 준비합니다.',
  },
  {
    id: 'demo-request',
    label: '데모/자료 요청',
    priority: 'high',
    action: '데모 링크, 샘플 캘린더, 자료 링크를 받은 반응함 답글로 연결합니다.',
  },
  {
    id: 'support-risk',
    label: '사용/지원 질문',
    priority: 'medium',
    action: 'FAQ 답변과 다음 콘텐츠 소재로 동시에 분류합니다.',
  },
  {
    id: 'complaint-risk',
    label: '불만 리스크',
    priority: 'high',
    action: '공개 답변과 비공개 후속 확인을 나눠 처리합니다.',
  },
  {
    id: 'collaboration',
    label: '협업/제휴',
    priority: 'medium',
    action: '협업 범위, 일정, 연락 채널을 확인하는 템플릿을 사용합니다.',
  },
  {
    id: 'competitor-mention',
    label: '경쟁/대안 언급',
    priority: 'medium',
    action: '비교 포지셔닝과 다음 경쟁 리포트 입력값으로 저장합니다.',
  },
  {
    id: 'content-idea',
    label: '콘텐츠 아이디어',
    priority: 'low',
    action: '반복 질문이나 사용 맥락을 아이디어 보드 주제로 승격합니다.',
  },
  {
    id: 'brand-health',
    label: '브랜드 건강도',
    priority: 'medium',
    action: '긍/부정 추이를 보고서와 GTM 메시지 조정에 반영합니다.',
  },
];

@Injectable()
export class SnapsSocialListeningService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  preview(body?: SnapsSocialListeningRequest): SnapsSocialListeningPreview {
    const request = body || {};
    const query = this.cleanText(request.query, 240);
    const sourceText = this.cleanText(request.sourceText, 8000);
    const keywords = this.uniqueStrings([
      ...this.cleanStringArray(request.keywords, 40, 80),
      ...this.extractQueryKeywords(query),
    ]).slice(0, 40);
    const excludeKeywords = this.uniqueStrings(
      this.cleanStringArray(request.excludeKeywords, 40, 80)
    ).slice(0, 40);
    const targetPlatforms = this.cleanPlatforms(
      request.platforms || request.targetPlatforms
    );
    const platforms = targetPlatforms.length
      ? targetPlatforms
      : (['instagram', 'threads', 'x', 'linkedin'] as SnapsTargetPlatform[]);
    const title =
      this.cleanText(request.title, 120) ||
      this.defaultTitle(query, keywords) ||
      'Brand listening monitor';
    const campaign = this.cleanText(request.campaign, 120) || undefined;
    const rawItems = [
      ...this.cleanItems(request.items),
      ...this.parseImportText(request.importText),
      ...this.parsePlainText(sourceText),
    ].slice(0, MAX_IMPORT_ITEMS);
    const includeNoise = request.includeNoise === true;
    const warnings: string[] = [];

    if (!keywords.length) {
      warnings.push('No keywords were supplied, so snaps matched all imported mentions for review.');
    }
    if (!rawItems.length) {
      warnings.push('No mention export or pasted social text was supplied.');
    }

    const normalized = rawItems
      .map((item) => this.normalizeMention(item, platforms, keywords, excludeKeywords))
      .filter((item): item is SnapsSocialListeningMention => !!item);
    const matched = normalized.filter((item) => {
      if (item.noise && !includeNoise) {
        return false;
      }
      return keywords.length ? item.matchedKeywords.length > 0 : true;
    });
    const visibleMentions = matched
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULT_ITEMS);
    const signals = this.buildSignals(matched);
    const clusters = this.buildClusters(matched);

    return {
      product: 'snaps',
      source: 'snaps-social-listening',
      title,
      query,
      campaign,
      keywords,
      excludeKeywords,
      targetPlatforms: platforms,
      totalItems: normalized.length,
      matchedItems: matched.length,
      highIntentItems: matched.filter((item) => item.priority === 'high').length,
      noiseItems: normalized.filter((item) => item.noise).length,
      byPlatform: this.countBy(matched, (item) => item.platform),
      bySentiment: this.sentimentCounts(matched),
      byIntent: this.intentCounts(matched),
      signals,
      clusters,
      mentions: visibleMentions,
      warnings,
      recommendations: this.recommendations(matched, signals, clusters),
    };
  }

  @SnapsSerialized()
  async save(organizationId: string, body?: SnapsSocialListeningRequest) {
    const draft = this.normalizeDraft(body, true);
    if (!draft) {
      throw new BadRequestException('listening monitor query, keywords, or mention text is required.');
    }
    const current = await this.list(organizationId);
    const now = new Date().toISOString();
    const monitor: SnapsSocialListeningMonitor = {
      product: 'snaps',
      source: 'snaps-social-listening',
      id: makeId(14),
      organizationId,
      title: draft.title,
      query: draft.query,
      campaign: draft.campaign,
      keywords: draft.keywords,
      excludeKeywords: draft.excludeKeywords,
      targetPlatforms: draft.targetPlatforms,
      tags: this.cleanStringArray(body?.tags, 20, 80),
      createdAt: now,
      updatedAt: now,
      lastRun: {
        matchedItems: draft.matchedItems,
        highIntentItems: draft.highIntentItems,
        noiseItems: draft.noiseItems,
        signals: draft.signals,
        clusters: draft.clusters,
      },
    };

    await this.write(
      organizationId,
      [monitor, ...current.filter((item) => item.title !== monitor.title)].slice(
        0,
        MAX_MONITORS
      )
    );
    return monitor;
  }

  async list(
    organizationId: string,
    query?: SnapsSocialListeningListQuery
  ): Promise<SnapsSocialListeningMonitor[]> {
    const monitors = await this.readAll(organizationId);
    const search = this.cleanText(query?.search, 160).toLowerCase();
    const platform = this.cleanPlatform(query?.platform);
    const tag = this.cleanText(query?.tag, 80).toLowerCase();

    return monitors.filter((monitor) => {
      if (platform && !monitor.targetPlatforms.includes(platform)) {
        return false;
      }
      if (tag && !monitor.tags.some((item) => item.toLowerCase().includes(tag))) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        monitor.title,
        monitor.query,
        monitor.campaign || '',
        monitor.keywords.join(' '),
        monitor.excludeKeywords.join(' '),
        monitor.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }

  @SnapsSerialized()
  async run(
    organizationId: string,
    monitorId: string,
    body?: SnapsSocialListeningRequest
  ): Promise<SnapsSocialListeningRunResult> {
    const current = await this.readAll(organizationId);
    const found = current.find((item) => item.id === monitorId);
    if (!found) {
      throw new NotFoundException('snaps listening monitor was not found.');
    }

    const preview = this.preview({
      ...found,
      ...body,
      title: found.title,
      query: body?.query ?? found.query,
      keywords: body?.keywords ?? found.keywords,
      excludeKeywords: body?.excludeKeywords ?? found.excludeKeywords,
      targetPlatforms: body?.targetPlatforms ?? found.targetPlatforms,
      platforms: body?.platforms ?? found.targetPlatforms,
      campaign: body?.campaign ?? found.campaign,
    });
    const now = new Date().toISOString();
    const monitor: SnapsSocialListeningMonitor = {
      ...found,
      updatedAt: now,
      lastRunAt: now,
      lastRun: {
        matchedItems: preview.matchedItems,
        highIntentItems: preview.highIntentItems,
        noiseItems: preview.noiseItems,
        signals: preview.signals,
        clusters: preview.clusters,
      },
    };
    await this.write(
      organizationId,
      current.map((item) => (item.id === monitorId ? monitor : item))
    );

    return {
      product: 'snaps',
      source: 'snaps-social-listening-run',
      monitor,
      preview,
    };
  }

  toInboxImport(preview: SnapsSocialListeningPreview): SnapsFeedbackImportDto {
    return {
      items: preview.mentions
        .filter((mention) => mention.priority !== 'low' && mention.intent !== 'spam')
        .map((mention) => ({
          platform: mention.platform,
          content: mention.content,
          postId: mention.postId,
          author: mention.author,
          sourceUrl: mention.sourceUrl,
          createdAt: mention.createdAt,
        })),
    };
  }

  @SnapsSerialized()
  async delete(organizationId: string, monitorId: string) {
    const current = await this.readAll(organizationId);
    const next = current.filter((item) => item.id !== monitorId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== current.length,
      monitors: next.length,
    };
  }

  @SnapsSerialized()
  async importMonitors(organizationId: string, monitors: unknown[] = []) {
    const current = await this.readAll(organizationId);
    const incoming = monitors
      .map((item) => this.normalizeMonitor(organizationId, item))
      .filter((item): item is SnapsSocialListeningMonitor => !!item);
    const merged = this.mergeByKey([...incoming, ...current], (item) =>
      item.id || item.title
    ).slice(0, MAX_MONITORS);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private normalizeDraft(
    value: unknown,
    requireSignal = false
  ): SnapsSocialListeningPreview | undefined {
    if (requireSignal && !this.hasMonitorSignal(value)) {
      return undefined;
    }
    try {
      return this.preview(
        value && typeof value === 'object'
          ? (value as SnapsSocialListeningRequest)
          : undefined
      );
    } catch {
      return undefined;
    }
  }

  private normalizeMonitor(
    organizationId: string,
    value: unknown
  ): SnapsSocialListeningMonitor | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Partial<SnapsSocialListeningMonitor>;
    const draft = this.normalizeDraft(record, true);
    if (!draft) {
      return undefined;
    }
    const createdAt = this.cleanIso(record.createdAt) || new Date().toISOString();
    const updatedAt = this.cleanIso(record.updatedAt) || createdAt;
    const lastRun = this.normalizeLastRun(record.lastRun);

    return {
      product: 'snaps',
      source: 'snaps-social-listening',
      id: this.cleanText(record.id, 120) || makeId(14),
      organizationId,
      title: draft.title,
      query: draft.query,
      campaign: draft.campaign,
      keywords: draft.keywords,
      excludeKeywords: draft.excludeKeywords,
      targetPlatforms: draft.targetPlatforms,
      tags: this.cleanStringArray(record.tags, 20, 80),
      createdAt,
      updatedAt,
      ...(this.cleanIso(record.lastRunAt)
        ? { lastRunAt: this.cleanIso(record.lastRunAt) }
        : {}),
      ...(lastRun ? { lastRun } : {}),
    };
  }

  private normalizeLastRun(value: unknown): SnapsSocialListeningMonitor['lastRun'] | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Partial<SnapsSocialListeningMonitor['lastRun']>;
    return {
      matchedItems: this.cleanNumber(record.matchedItems),
      highIntentItems: this.cleanNumber(record.highIntentItems),
      noiseItems: this.cleanNumber(record.noiseItems),
      signals: Array.isArray(record.signals)
        ? this.normalizeSignals(record.signals)
        : [],
      clusters: Array.isArray(record.clusters)
        ? this.normalizeClusters(record.clusters)
        : [],
    };
  }

  private normalizeMention(
    input: SnapsSocialListeningMentionInput,
    fallbackPlatforms: SnapsTargetPlatform[],
    keywords: string[],
    excludeKeywords: string[]
  ): SnapsSocialListeningMention | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const platform =
      this.cleanPlatform(input.platform) || fallbackPlatforms[0] || 'instagram';
    const content =
      this.cleanText(input.content, 4000) ||
      this.cleanText(input.text, 4000) ||
      this.cleanText(input.message, 4000);
    if (!platform || !content) {
      return undefined;
    }

    const matchedKeywords = this.matchKeywords(content, keywords);
    const excludedKeywords = this.matchKeywords(content, excludeKeywords);
    const normalizedIntent =
      this.cleanIntent(input.intent) || this.detectIntent(content, excludedKeywords);
    const sentiment =
      this.cleanSentiment(input.sentiment) ||
      this.detectSentiment(content, normalizedIntent);
    const noise =
      normalizedIntent === 'spam' ||
      excludedKeywords.length > 0 ||
      this.isSpam(content);
    const signals = this.detectSignals(content, normalizedIntent, sentiment);
    const engagement =
      this.cleanNumber(input.engagement) ||
      this.cleanNumber(input.likes) + this.cleanNumber(input.comments);
    const priority = this.priorityFor(normalizedIntent, sentiment, engagement, signals, noise);
    const score = this.score(priority, engagement, signals, matchedKeywords, noise);

    return {
      id: makeId(14),
      platform,
      author: this.cleanText(input.author, 160) || undefined,
      content,
      postId: this.cleanText(input.postId, 200) || undefined,
      sourceUrl:
        this.cleanOptionalUrl(input.sourceUrl) || this.cleanOptionalUrl(input.url),
      createdAt: this.cleanIso(input.createdAt) || undefined,
      engagement,
      matchedKeywords,
      excludedKeywords,
      sentiment,
      intent: normalizedIntent,
      priority,
      score,
      signals,
      noise,
      recommendedAction: this.recommendedAction(normalizedIntent, priority),
    };
  }

  private cleanItems(value: unknown): SnapsSocialListeningMentionInput[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (item && typeof item === 'object' ? item : undefined))
      .filter((item): item is SnapsSocialListeningMentionInput => !!item);
  }

  private parseImportText(value: unknown): SnapsSocialListeningMentionInput[] {
    const text = typeof value === 'string' ? value.trim().slice(0, 500000) : '';
    if (!text) {
      return [];
    }
    if (text.startsWith('{') || text.startsWith('[')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BadRequestException('Listening import JSON is invalid.');
      }
      return this.jsonRecords(parsed);
    }

    if (text.includes(',') && text.split(/\r?\n/)[0]?.includes(',')) {
      const rows = this.parseCsv(text);
      const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, '').trim()) || [];
      if (headers.length && rows.length > 1) {
        return rows.slice(1).map((row) => this.recordFromCsv(headers, row));
      }
    }

    return this.parsePlainText(text);
  }

  private parsePlainText(text: string): SnapsSocialListeningMentionInput[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_IMPORT_ITEMS)
      .map((content) => ({ content }));
  }

  private jsonRecords(value: unknown): SnapsSocialListeningMentionInput[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => (item && typeof item === 'object' ? item : undefined))
        .filter((item): item is SnapsSocialListeningMentionInput => !!item);
    }
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;
    for (const key of ['mentions', 'items', 'comments', 'messages', 'results', 'data']) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return this.jsonRecords(candidate);
      }
    }
    return [record as SnapsSocialListeningMentionInput];
  }

  private parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      field += char;
    }

    row.push(field.replace(/\r$/, ''));
    rows.push(row);
    return rows.filter((items) => items.some((item) => item.trim()));
  }

  private recordFromCsv(headers: string[], row: string[]): SnapsSocialListeningMentionInput {
    const raw = headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[this.normalizeHeader(header)] = row[index] || '';
      return record;
    }, {});
    const pick = (aliases: string[]) => {
      for (const alias of aliases) {
        const value = raw[this.normalizeHeader(alias)];
        if (typeof value !== 'undefined') {
          return value;
        }
      }
      return undefined;
    };

    return {
      platform: pick(['platform', 'provider', 'network', 'channel']),
      author: pick(['author', 'user', 'username', 'handle', 'screenName']),
      content: pick(['content', 'text', 'message', 'comment', 'caption', 'body']),
      postId: pick(['postId', 'post_id', 'threadId', 'messageId']),
      sourceUrl: pick(['sourceUrl', 'url', 'link', 'permalink']),
      createdAt: pick(['createdAt', 'date', 'publishedAt', 'timestamp']),
      engagement: pick(['engagement', 'interactions', 'score']),
      likes: pick(['likes', 'likeCount']),
      comments: pick(['comments', 'commentCount', 'replies']),
      sentiment: pick(['sentiment']),
      intent: pick(['intent']),
    };
  }

  private buildSignals(items: SnapsSocialListeningMention[]) {
    const byId = new Map<SnapsSocialListeningSignalId, SnapsSocialListeningSignal>();
    for (const item of items) {
      for (const id of item.signals) {
        const definition = this.signalDefinition(id);
        const current =
          byId.get(id) ||
          ({
            ...definition,
            count: 0,
            examples: [],
          } as SnapsSocialListeningSignal);
        current.count += 1;
        if (current.examples.length < 3) {
          current.examples.push(item.content.slice(0, 140));
        }
        byId.set(id, current);
      }
    }
    return Array.from(byId.values()).sort((a, b) => {
      const priorityDelta = this.priorityWeight(a.priority) - this.priorityWeight(b.priority);
      return priorityDelta || b.count - a.count;
    });
  }

  private buildClusters(items: SnapsSocialListeningMention[]): SnapsSocialListeningCluster[] {
    const byIntent = new Map<SnapsSocialListeningIntent, SnapsSocialListeningMention[]>();
    for (const item of items) {
      byIntent.set(item.intent, [...(byIntent.get(item.intent) || []), item]);
    }

    return Array.from(byIntent.entries())
      .map(([intent, mentions]) => {
        const priority: SnapsSocialListeningPriority = mentions.some(
          (item) => item.priority === 'high'
        )
          ? 'high'
          : mentions.some((item) => item.priority === 'medium')
            ? 'medium'
            : 'low';
        const sentiment = this.clusterSentiment(mentions);
        return {
          id: intent,
          label: this.intentLabel(intent),
          count: mentions.length,
          priority,
          sentiment,
          keywords: this.topKeywords(mentions),
          examples: mentions.slice(0, 3).map((item) => item.content.slice(0, 140)),
          action: this.clusterAction(intent),
        };
      })
      .sort((a, b) => {
        const priorityDelta = this.priorityWeight(a.priority) - this.priorityWeight(b.priority);
        return priorityDelta || b.count - a.count;
      });
  }

  private normalizeSignals(value: unknown[]): SnapsSocialListeningSignal[] {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const record = item as Partial<SnapsSocialListeningSignal>;
        const id = this.cleanSignalId(record.id);
        if (!id) {
          return undefined;
        }
        const definition = this.signalDefinition(id);
        return {
          id,
          label: this.cleanText(record.label, 80) || definition.label,
          priority: this.cleanPriority(record.priority) || definition.priority,
          count: this.cleanNumber(record.count),
          examples: this.cleanStringArray(record.examples, 3, 140),
          action: this.cleanText(record.action, 240) || definition.action,
        };
      })
      .filter((item): item is SnapsSocialListeningSignal => !!item);
  }

  private normalizeClusters(value: unknown[]): SnapsSocialListeningCluster[] {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const record = item as Partial<SnapsSocialListeningCluster>;
        const id = this.cleanText(record.id, 80);
        const label = this.cleanText(record.label, 120);
        if (!id || !label) {
          return undefined;
        }
        return {
          id,
          label,
          count: this.cleanNumber(record.count),
          priority: this.cleanPriority(record.priority) || 'low',
          sentiment: this.cleanSentiment(record.sentiment) || 'neutral',
          keywords: this.cleanStringArray(record.keywords, 8, 80),
          examples: this.cleanStringArray(record.examples, 3, 140),
          action: this.cleanText(record.action, 240) || '검토 후 다음 액션으로 연결합니다.',
        };
      })
      .filter((item): item is SnapsSocialListeningCluster => !!item);
  }

  private recommendations(
    items: SnapsSocialListeningMention[],
    signals: SnapsSocialListeningSignal[],
    clusters: SnapsSocialListeningCluster[]
  ) {
    const high = items.filter((item) => item.priority === 'high').length;
    const negative = items.filter((item) => item.sentiment === 'negative').length;
    const leadingCluster = clusters[0];
    return [
      high
        ? `High-intent mention ${high}개를 받은 반응함으로 승격해 답글/DM 후속을 우선 처리하세요.`
        : 'High-intent mention은 아직 없습니다. 키워드를 좁히거나 캠페인 해시태그를 추가하세요.',
      negative
        ? `Negative mention ${negative}개는 공개 답변과 내부 원인 확인을 분리하세요.`
        : '부정 리스크는 낮습니다. 긍정/질문 언급을 콘텐츠 소재로 전환하세요.',
      leadingCluster
        ? `${leadingCluster.label} 클러스터가 가장 큽니다. 액션: ${leadingCluster.action}`
        : '충분한 mention을 가져오면 의도별 클러스터가 생성됩니다.',
      signals[0]
        ? `${signals[0].label} 신호가 우선입니다. ${signals[0].action}`
        : '저장 검색어에 브랜드명, 캠페인 해시태그, 경쟁 대안 키워드를 함께 넣으세요.',
    ];
  }

  private sentimentCounts(items: SnapsSocialListeningMention[]) {
    return {
      positive: 0,
      neutral: 0,
      negative: 0,
      mixed: 0,
      ...this.countBy(items, (item) => item.sentiment),
    } as Record<SnapsSocialListeningSentiment, number>;
  }

  private intentCounts(items: SnapsSocialListeningMention[]) {
    return {
      lead: 0,
      support: 0,
      complaint: 0,
      collaboration: 0,
      praise: 0,
      competitor: 0,
      spam: 0,
      awareness: 0,
      ...this.countBy(items, (item) => item.intent),
    } as Record<SnapsSocialListeningIntent, number>;
  }

  private detectIntent(
    content: string,
    excludedKeywords: string[]
  ): SnapsSocialListeningIntent {
    const text = content.toLowerCase();
    if (this.isSpam(text) || excludedKeywords.length) {
      return 'spam';
    }
    if (/(가격|비용|요금|견적|구매|신청|결제|상담|데모|파일럿|price|pricing|cost|buy|demo|trial|quote)/i.test(text)) {
      return 'lead';
    }
    if (/(불편|문제|오류|실망|별로|최악|싫|안\s*됨|bad|wrong|broken|disappoint)/i.test(text)) {
      return 'complaint';
    }
    if (/(협업|제휴|콜라보|광고 문의|partnership|collab|sponsor)/i.test(text)) {
      return 'collaboration';
    }
    if (/(비교|대안|경쟁|vs\.?|versus|alternative|competitor|rival)/i.test(text)) {
      return 'competitor';
    }
    if (/[?？]|(어떻게|왜|언제|무엇|가능|궁금|사용법|방법|how|why|when|what|guide)/i.test(text)) {
      return 'support';
    }
    if (/(좋|감사|유용|최고|도움|멋지|great|thanks|love|useful)/i.test(text)) {
      return 'praise';
    }
    return 'awareness';
  }

  private detectSentiment(
    content: string,
    intent: SnapsSocialListeningIntent
  ): SnapsSocialListeningSentiment {
    if (intent === 'spam') {
      return 'negative';
    }
    const positive = /(좋|감사|유용|최고|도움|멋지|추천|great|thanks|love|useful|nice)/i.test(content);
    const negative = /(불편|문제|오류|실망|별로|최악|싫|bad|wrong|broken|disappoint)/i.test(content);
    if (positive && negative) {
      return 'mixed';
    }
    if (negative || intent === 'complaint') {
      return 'negative';
    }
    if (positive || intent === 'praise') {
      return 'positive';
    }
    return 'neutral';
  }

  private detectSignals(
    content: string,
    intent: SnapsSocialListeningIntent,
    sentiment: SnapsSocialListeningSentiment
  ): SnapsSocialListeningSignalId[] {
    const text = content.toLowerCase();
    const signals: SnapsSocialListeningSignalId[] = [];
    if (/(구매|신청|결제|주문|상담|buy|purchase|order|trial)/i.test(text)) {
      signals.push('purchase-intent');
    }
    if (/(가격|비용|요금|얼마|견적|price|cost|pricing|quote)/i.test(text)) {
      signals.push('pricing');
    }
    if (/(데모|자료|링크|샘플|가이드|demo|link|sample|guide)/i.test(text)) {
      signals.push('demo-request');
    }
    if (intent === 'support') {
      signals.push('support-risk');
    }
    if (intent === 'complaint' || sentiment === 'negative') {
      signals.push('complaint-risk');
    }
    if (intent === 'collaboration') {
      signals.push('collaboration');
    }
    if (intent === 'competitor') {
      signals.push('competitor-mention');
    }
    if (/(다음|주제|편|콘텐츠|보고싶|궁금|idea|topic|content)/i.test(text)) {
      signals.push('content-idea');
    }
    if (/(브랜드|회사|서비스|제품|@[\w._-]+)/i.test(text) || sentiment !== 'neutral') {
      signals.push('brand-health');
    }
    return [...new Set(signals)];
  }

  private priorityFor(
    intent: SnapsSocialListeningIntent,
    sentiment: SnapsSocialListeningSentiment,
    engagement: number,
    signals: SnapsSocialListeningSignalId[],
    noise: boolean
  ): SnapsSocialListeningPriority {
    if (noise || intent === 'spam') {
      return 'low';
    }
    if (
      intent === 'lead' ||
      intent === 'complaint' ||
      signals.some((signal) =>
        ['purchase-intent', 'pricing', 'demo-request', 'complaint-risk'].includes(signal)
      )
    ) {
      return 'high';
    }
    if (
      intent === 'collaboration' ||
      intent === 'support' ||
      intent === 'competitor' ||
      sentiment === 'mixed' ||
      engagement >= 20
    ) {
      return 'medium';
    }
    return 'low';
  }

  private score(
    priority: SnapsSocialListeningPriority,
    engagement: number,
    signals: SnapsSocialListeningSignalId[],
    matchedKeywords: string[],
    noise: boolean
  ) {
    const base = priority === 'high' ? 80 : priority === 'medium' ? 45 : 20;
    const signalWeight = signals.reduce(
      (total, signal) => total + this.priorityScore(this.signalDefinition(signal).priority),
      0
    );
    const keywordWeight = matchedKeywords.length * 4;
    const engagementWeight = Math.min(20, engagement);
    return Math.max(
      0,
      Math.round(base + signalWeight + keywordWeight + engagementWeight - (noise ? 50 : 0))
    );
  }

  private recommendedAction(
    intent: SnapsSocialListeningIntent,
    priority: SnapsSocialListeningPriority
  ) {
    if (priority === 'high' && intent === 'lead') {
      return '받은 반응함으로 승격하고 가격/데모 답글 템플릿을 적용하세요.';
    }
    if (intent === 'complaint') {
      return '공개 답변 초안과 내부 원인 확인 메모를 분리하세요.';
    }
    if (intent === 'support') {
      return 'FAQ 답변 후 같은 질문을 다음 콘텐츠 소재로 저장하세요.';
    }
    if (intent === 'collaboration') {
      return '협업 범위와 연락 채널을 묻는 저장 답변을 사용하세요.';
    }
    if (intent === 'competitor') {
      return '경쟁 리포트의 포지셔닝 메모로 저장하세요.';
    }
    return '추이를 지켜보고 반복 언급이면 아이디어 보드로 옮기세요.';
  }

  private matchKeywords(content: string, keywords: string[]) {
    const text = this.keywordKey(content);
    return keywords.filter((keyword) => {
      const key = this.keywordKey(keyword);
      return key && text.includes(key);
    });
  }

  private extractQueryKeywords(query: string) {
    return this.uniqueStrings(
      query
        .replace(/\b(AND|OR|NOT)\b/gi, ' ')
        .replace(/[()]/g, ' ')
        .split(/[,\n|]+|\s{2,}/g)
        .flatMap((item) => item.split(/\s+(?:OR|AND|NOT)\s+/i))
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter((item) => item.length >= 2)
    ).slice(0, 20);
  }

  private topKeywords(items: SnapsSocialListeningMention[]) {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const keyword of item.matchedKeywords) {
        counts.set(keyword, (counts.get(keyword) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([keyword]) => keyword)
      .slice(0, 8);
  }

  private clusterSentiment(
    items: SnapsSocialListeningMention[]
  ): SnapsSocialListeningSentiment {
    const counts = this.sentimentCounts(items);
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      'neutral') as SnapsSocialListeningSentiment;
  }

  private clusterAction(intent: SnapsSocialListeningIntent) {
    const actions: Record<SnapsSocialListeningIntent, string> = {
      lead: '받은 반응함으로 승격하고 영업 CTA를 답글 초안에 붙입니다.',
      support: 'FAQ 답글과 튜토리얼 소재를 동시에 만듭니다.',
      complaint: '리스크 답변과 내부 수정 메모를 생성합니다.',
      collaboration: '협업 템플릿으로 응대하고 CRM 메모를 남깁니다.',
      praise: '후기/증거 소재로 저장하고 감사 답글을 준비합니다.',
      competitor: '경쟁 계정 분석과 포지셔닝 리포트 입력으로 넘깁니다.',
      spam: '노이즈 제외 키워드에 추가합니다.',
      awareness: '반복되는 표현을 콘텐츠 아이디어로 모읍니다.',
    };
    return actions[intent];
  }

  private intentLabel(intent: SnapsSocialListeningIntent) {
    const labels: Record<SnapsSocialListeningIntent, string> = {
      lead: '리드/전환',
      support: '질문/지원',
      complaint: '불만/리스크',
      collaboration: '협업/제휴',
      praise: '칭찬/후기',
      competitor: '경쟁/대안',
      spam: '스팸/노이즈',
      awareness: '인지/일반 언급',
    };
    return labels[intent];
  }

  private signalDefinition(id: SnapsSocialListeningSignalId) {
    return signalDefinitions.find((signal) => signal.id === id) || signalDefinitions[0];
  }

  private isSpam(content: string) {
    return /(카지노|바카라|성인|대출|무료\s*머니|crypto pump|airdrop|http:\/\/|bit\.ly)/i.test(
      content
    );
  }

  private hasMonitorSignal(value: unknown) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const input = value as Record<string, unknown>;
    return ['title', 'query', 'keywords', 'importText', 'sourceText', 'items'].some(
      (key) => {
        const entry = input[key];
        return Array.isArray(entry)
          ? entry.length > 0
          : !!this.cleanText(entry, 20);
      }
    );
  }

  private countBy<T extends string>(
    items: SnapsSocialListeningMention[],
    pick: (item: SnapsSocialListeningMention) => T
  ) {
    return items.reduce((all, item) => {
      const key = pick(item);
      all[key] = (all[key] || 0) + 1;
      return all;
    }, {} as Record<T, number>);
  }

  private async readAll(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsSocialListeningMonitor[];
      }
      return parsed
        .map((item) => this.normalizeMonitor(organizationId, item))
        .filter((item): item is SnapsSocialListeningMonitor => !!item)
        .slice(0, MAX_MONITORS);
    } catch {
      return [] as SnapsSocialListeningMonitor[];
    }
  }

  private async write(
    organizationId: string,
    monitors: SnapsSocialListeningMonitor[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(monitors, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.listening-monitors.json`);
  }

  private mergeByKey<T>(items: T[], keyFor: (item: T) => string) {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const item of items) {
      const key = keyFor(item).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n| ]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanPlatform(item))
          .filter((item): item is SnapsTargetPlatform => !!item)
      ),
    ].slice(0, 10);
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const normalized = this.cleanText(value, 80)
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[\s_]+/g, '-');
    const aliases: Record<string, SnapsTargetPlatform> = {
      ig: 'instagram',
      insta: 'instagram',
      instagram: 'instagram',
      thread: 'threads',
      threads: 'threads',
      bluesky: 'bluesky',
      bsky: 'bluesky',
      facebook: 'facebook',
      fb: 'facebook',
      pinterest: 'pinterest',
      pin: 'pinterest',
      youtube: 'youtube',
      tiktok: 'tiktok',
      twitter: 'x',
      x: 'x',
      linkedin: 'linkedin',
      naver: 'naver-blog',
      blog: 'naver-blog',
      cafe: 'naver-cafe',
      kakao: 'kakao-talk',
      xhs: 'xiaohongshu',
      xiaohongshu: 'xiaohongshu',
    };
    const platform = aliases[normalized] || normalized;
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanSentiment(value: unknown): SnapsSocialListeningSentiment | undefined {
    const sentiment = this.cleanText(value, 40).toLowerCase();
    if (sentiment === 'praise') {
      return 'positive';
    }
    if (sentiment === 'complaint') {
      return 'negative';
    }
    return ['positive', 'neutral', 'negative', 'mixed'].includes(sentiment)
      ? (sentiment as SnapsSocialListeningSentiment)
      : undefined;
  }

  private cleanIntent(value: unknown): SnapsSocialListeningIntent | undefined {
    const intent = this.cleanText(value, 40).toLowerCase();
    return [
      'lead',
      'support',
      'complaint',
      'collaboration',
      'praise',
      'competitor',
      'spam',
      'awareness',
    ].includes(intent)
      ? (intent as SnapsSocialListeningIntent)
      : undefined;
  }

  private cleanSignalId(value: unknown): SnapsSocialListeningSignalId | undefined {
    const id = this.cleanText(value, 80);
    return signalDefinitions.some((signal) => signal.id === id)
      ? (id as SnapsSocialListeningSignalId)
      : undefined;
  }

  private cleanPriority(value: unknown): SnapsSocialListeningPriority | undefined {
    const priority = this.cleanText(value, 20);
    return priority === 'high' || priority === 'medium' || priority === 'low'
      ? priority
      : undefined;
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]+/)
        : [];
    return this.uniqueStrings(
      raw.map((item) => this.cleanText(item, maxLength)).filter(Boolean)
    ).slice(0, maxItems);
  }

  private uniqueStrings(values: string[]) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const next = value.trim();
      const key = next.toLowerCase();
      if (!next || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(next);
    }
    return result;
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((item) => this.cleanText(item, maxLength))
        .filter(Boolean)
        .join(' ');
    }

    return raw.trim().replace(/[ \t]+/g, ' ').slice(0, maxLength);
  }

  private cleanNumber(value: unknown) {
    const number =
      typeof value === 'number'
        ? value
        : Number(
            this.cleanText(value, 80)
              .toLowerCase()
              .replace(/,/g, '')
              .replace(/k$/, 'e3')
              .replace(/m$/, 'e6')
          );
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  }

  private cleanIso(value: unknown) {
    const text = this.cleanText(value, 80);
    return text && !Number.isNaN(new Date(text).getTime()) ? new Date(text).toISOString() : '';
  }

  private cleanOptionalUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return undefined;
    }
    try {
      const parsed = new URL(text);
      return ['http:', 'https:'].includes(parsed.protocol)
        ? parsed.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeHeader(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  }

  private keywordKey(value: string) {
    return value.toLowerCase().replace(/^[@#]+/, '').replace(/\s+/g, ' ').trim();
  }

  private defaultTitle(query: string, keywords: string[]) {
    return query || keywords[0] ? `${query || keywords[0]} listening` : '';
  }

  private priorityWeight(priority: SnapsSocialListeningPriority) {
    return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
  }

  private priorityScore(priority: SnapsSocialListeningPriority) {
    return priority === 'high' ? 8 : priority === 'medium' ? 4 : 1;
  }

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
