import { BadRequestException, Injectable } from '@nestjs/common';
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
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';

export type SnapsFeedbackItem = SnapsFeedbackInputDto & {
  id: string;
  organizationId: string;
  sentiment: SnapsFeedbackSentiment;
  conversionSignals: SnapsFeedbackConversionSignalId[];
  status: SnapsFeedbackStatus;
  readAt?: string;
  resolvedAt?: string;
  importedAt: string;
};

export type SnapsFeedbackStatus = 'unread' | 'unresolved' | 'resolved';

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

export type SnapsInboxAssignmentPriority = 'urgent' | 'high' | 'normal' | 'low';

export type SnapsInboxAssignmentRole =
  | 'support'
  | 'sales'
  | 'community'
  | 'moderation'
  | 'partnership';

export type SnapsInboxAssignmentRequest = {
  items?: SnapsFeedbackInputDto[];
  status?: unknown;
  search?: unknown;
  defaultSlaMinutes?: unknown;
};

export type SnapsInboxAssignmentCase = {
  id: string;
  itemId: string;
  platform: SnapsTargetPlatform;
  author?: string;
  postId?: string;
  excerpt: string;
  sentiment: SnapsFeedbackSentiment;
  conversionSignals: SnapsFeedbackConversionSignalId[];
  priority: SnapsInboxAssignmentPriority;
  assigneeRole: SnapsInboxAssignmentRole;
  assigneeLabel: string;
  status: 'new' | 'open' | 'watch';
  slaMinutes: number;
  dueAt: string;
  tags: string[];
  replyTemplateId?: string;
  replyTemplateTitle?: string;
  noteMatches: Array<{
    id: string;
    note: string;
    tags: string[];
  }>;
  action: string;
  rationale: string[];
};

export type SnapsInboxAssignmentPreview = {
  product: 'snaps';
  source: 'snaps-inbox-assignments';
  generatedAt: string;
  total: number;
  lanes: Record<SnapsInboxAssignmentPriority, number>;
  teamLoad: Array<{
    role: SnapsInboxAssignmentRole;
    label: string;
    count: number;
    urgent: number;
    high: number;
  }>;
  cases: SnapsInboxAssignmentCase[];
  nextActions: string[];
  automations: string[];
  warnings: string[];
};

export type SnapsReplyTemplateInput = {
  id?: unknown;
  title?: unknown;
  sentiment?: unknown;
  platform?: unknown;
  body?: unknown;
  cta?: unknown;
  tags?: unknown;
};

export type SnapsReplyTemplate = {
  id: string;
  organizationId: string;
  title: string;
  sentiment?: SnapsFeedbackSentiment;
  platform?: SnapsTargetPlatform;
  body: string;
  cta?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type SnapsInboxNoteInput = {
  id?: unknown;
  platform?: unknown;
  author?: unknown;
  postId?: unknown;
  sourceUrl?: unknown;
  note?: unknown;
  tags?: unknown;
};

export type SnapsInboxNote = {
  id: string;
  organizationId: string;
  platform?: SnapsTargetPlatform;
  author?: string;
  postId?: string;
  sourceUrl?: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const MAX_FEEDBACK_ITEMS = 1000;
const MAX_REPLY_TEMPLATES = 120;
const MAX_INBOX_NOTES = 500;
const snapsFeedbackStatuses: SnapsFeedbackStatus[] = [
  'unread',
  'unresolved',
  'resolved',
];

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

  @SnapsSerialized()
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

  @SnapsSerialized()
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
      status?: unknown;
      search?: unknown;
    } = {}
  ) {
    const status = this.normalizeFeedbackStatus(filters.status);
    const search = this.cleanOptionalText(filters.search, 240)?.toLowerCase();
    const items = await this.readItems(organizationId);
    return items.filter((item) => {
      return (
        (!filters.platform || item.platform === filters.platform) &&
        (!filters.sentiment || item.sentiment === filters.sentiment) &&
        (!status || item.status === status) &&
        (!search ||
          [item.author, item.postId, item.content, item.sourceUrl]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(search))
      );
    });
  }

  @SnapsSerialized()
  async updateItemStatus(
    organizationId: string,
    itemId: string,
    input: {
      status?: unknown;
    } = {}
  ) {
    const status = this.normalizeFeedbackStatus(input.status);
    if (!status) {
      throw new BadRequestException('status is required.');
    }

    const id = this.cleanOptionalText(itemId, 160) || '';
    const items = await this.readItems(organizationId);
    const now = new Date().toISOString();
    let updatedItem: SnapsFeedbackItem | undefined;
    const next = items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      updatedItem = {
        ...item,
        status,
        readAt:
          status === 'unread'
            ? undefined
            : item.readAt || now,
        resolvedAt: status === 'resolved' ? now : undefined,
      };
      return updatedItem;
    });
    await this.writeItems(organizationId, next);

    return {
      updated: !!updatedItem,
      item: updatedItem,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async deleteItem(organizationId: string, itemId: string) {
    const items = await this.readItems(organizationId);
    const next = items.filter((item) => item.id !== itemId);
    await this.writeItems(organizationId, next);
    return {
      deleted: next.length !== items.length,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async clearItems(organizationId: string) {
    const items = await this.readItems(organizationId);
    await this.writeItems(organizationId, []);
    return {
      deleted: items.length,
      total: 0,
    };
  }

  async listReplyTemplates(
    organizationId: string,
    filters: {
      platform?: unknown;
      sentiment?: unknown;
    } = {}
  ) {
    const platform = this.normalizePlatform(filters.platform);
    const sentiment = this.normalizeSentiment(filters.sentiment);
    const templates = await this.readReplyTemplates(organizationId);
    return templates.filter((template) => {
      return (
        (!platform || template.platform === platform) &&
        (!sentiment || template.sentiment === sentiment)
      );
    });
  }

  @SnapsSerialized()
  async saveReplyTemplate(
    organizationId: string,
    input: SnapsReplyTemplateInput = {}
  ) {
    const body = this.cleanTemplateText(input.body, 2000);
    if (!body) {
      throw new BadRequestException('body is required.');
    }

    const stored = await this.readReplyTemplates(organizationId);
    const id = this.cleanOptionalText(input.id, 160) || makeId(14);
    const existing = stored.find((template) => template.id === id);
    const now = new Date().toISOString();
    const template: SnapsReplyTemplate = {
      id,
      organizationId,
      title:
        this.cleanOptionalText(input.title, 120) ||
        this.defaultTemplateTitle(body),
      sentiment: this.normalizeSentiment(input.sentiment),
      platform: this.normalizePlatform(input.platform),
      body,
      cta: this.cleanTemplateText(input.cta, 280),
      tags: this.normalizeStringArray(input.tags, []).slice(0, 10),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const next = this.dedupeReplyTemplates([
      template,
      ...stored.filter((item) => item.id !== id),
    ]).slice(0, MAX_REPLY_TEMPLATES);
    await this.writeReplyTemplates(organizationId, next);

    return {
      saved: true,
      template,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async deleteReplyTemplate(organizationId: string, templateId: string) {
    const id = this.cleanOptionalText(templateId, 160) || '';
    const templates = await this.readReplyTemplates(organizationId);
    const next = templates.filter((template) => template.id !== id);
    await this.writeReplyTemplates(organizationId, next);
    return {
      deleted: next.length !== templates.length,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async importReplyTemplates(organizationId: string, templates: unknown[] = []) {
    const stored = await this.readReplyTemplates(organizationId);
    const incoming = templates
      .map((template) => this.normalizeReplyTemplate(organizationId, template))
      .filter((template): template is SnapsReplyTemplate => !!template)
      .slice(0, MAX_REPLY_TEMPLATES);
    const merged = this.dedupeReplyTemplates([...incoming, ...stored]).slice(
      0,
      MAX_REPLY_TEMPLATES
    );
    await this.writeReplyTemplates(organizationId, merged);

    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  async listInboxNotes(
    organizationId: string,
    filters: {
      platform?: unknown;
      author?: unknown;
      postId?: unknown;
    } = {}
  ) {
    const platform = this.normalizePlatform(filters.platform);
    const author = this.cleanOptionalText(filters.author, 200)?.toLowerCase();
    const postId = this.cleanOptionalText(filters.postId, 200);
    const notes = await this.readInboxNotes(organizationId);
    return notes.filter((note) => {
      return (
        (!platform || note.platform === platform) &&
        (!author || (note.author || '').toLowerCase().includes(author)) &&
        (!postId || note.postId === postId)
      );
    });
  }

  @SnapsSerialized()
  async saveInboxNote(organizationId: string, input: SnapsInboxNoteInput = {}) {
    const noteText = this.cleanTemplateText(input.note, 2000);
    if (!noteText) {
      throw new BadRequestException('note is required.');
    }

    const author = this.cleanOptionalText(input.author, 200);
    const postId = this.cleanOptionalText(input.postId, 200);
    if (!author && !postId) {
      throw new BadRequestException('author or postId is required.');
    }

    const stored = await this.readInboxNotes(organizationId);
    const id = this.cleanOptionalText(input.id, 160) || makeId(14);
    const existing = stored.find((item) => item.id === id);
    const now = new Date().toISOString();
    const note: SnapsInboxNote = {
      id,
      organizationId,
      platform: this.normalizePlatform(input.platform),
      author,
      postId,
      sourceUrl: this.cleanOptionalText(input.sourceUrl, 2000),
      note: noteText,
      tags: this.normalizeStringArray(input.tags, []).slice(0, 10),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const next = this.dedupeInboxNotes([
      note,
      ...stored.filter((item) => item.id !== id),
    ]).slice(0, MAX_INBOX_NOTES);
    await this.writeInboxNotes(organizationId, next);

    return {
      saved: true,
      note,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async deleteInboxNote(organizationId: string, noteId: string) {
    const id = this.cleanOptionalText(noteId, 160) || '';
    const notes = await this.readInboxNotes(organizationId);
    const next = notes.filter((note) => note.id !== id);
    await this.writeInboxNotes(organizationId, next);
    return {
      deleted: next.length !== notes.length,
      total: next.length,
    };
  }

  @SnapsSerialized()
  async importInboxNotes(organizationId: string, notes: unknown[] = []) {
    const stored = await this.readInboxNotes(organizationId);
    const incoming = notes
      .map((note) => this.normalizeInboxNote(organizationId, note))
      .filter((note): note is SnapsInboxNote => !!note)
      .slice(0, MAX_INBOX_NOTES);
    const merged = this.dedupeInboxNotes([...incoming, ...stored]).slice(
      0,
      MAX_INBOX_NOTES
    );
    await this.writeInboxNotes(organizationId, merged);

    return {
      imported: incoming.length,
      total: merged.length,
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

  async previewAssignments(
    organizationId: string,
    body: SnapsInboxAssignmentRequest = {}
  ): Promise<SnapsInboxAssignmentPreview> {
    const inlineItems = Array.isArray(body?.items) ? body.items : [];
    const requestedStatus = this.normalizeFeedbackStatus(body?.status);
    const search = this.cleanOptionalText(body?.search, 240);
    const defaultSlaMinutes = Math.max(
      30,
      Math.min(7 * 24 * 60, this.normalizeNumber(body?.defaultSlaMinutes, 240))
    );

    const items = inlineItems.length
      ? inlineItems
          .map((item) => this.normalizeItem(organizationId, item))
          .filter((item): item is SnapsFeedbackItem => !!item)
      : (
          await this.listItems(organizationId, {
            status: requestedStatus,
            search,
          })
        ).filter((item) => requestedStatus || item.status !== 'resolved');

    const [templates, notes] = await Promise.all([
      this.readReplyTemplates(organizationId),
      this.readInboxNotes(organizationId),
    ]);
    const generatedAt = new Date();
    const cases = items
      .map((item) =>
        this.buildAssignmentCase(
          item,
          generatedAt,
          templates,
          notes,
          defaultSlaMinutes
        )
      )
      .sort((a, b) => {
        const priorityDelta =
          this.assignmentPriorityRank(a.priority) -
          this.assignmentPriorityRank(b.priority);
        return priorityDelta || a.dueAt.localeCompare(b.dueAt);
      })
      .slice(0, 80);

    const lanes = this.assignmentLanes(cases);
    const warnings = [
      cases.length ? '' : '배정할 미해결 받은 반응이 없습니다.',
      cases.some((item) => item.assigneeRole === 'moderation')
        ? '스팸/부적절 후보는 공개 숨김 또는 삭제 전에 운영자 확인이 필요합니다.'
        : '',
      cases.some((item) => !item.replyTemplateId)
        ? '일부 케이스는 매칭되는 저장 답변이 없어 수동 초안 작성이 필요합니다.'
        : '',
    ].filter(Boolean);

    return {
      product: 'snaps',
      source: 'snaps-inbox-assignments',
      generatedAt: generatedAt.toISOString(),
      total: cases.length,
      lanes,
      teamLoad: this.assignmentTeamLoad(cases),
      cases,
      nextActions: this.assignmentNextActions(cases),
      automations: this.assignmentAutomations(cases),
      warnings,
    };
  }

  private normalizeItem(
    organizationId: string,
    item: SnapsFeedbackInputDto
  ): SnapsFeedbackItem | undefined {
    if (!item || typeof item !== 'object') {
      return undefined;
    }

    const platform = this.cleanOptionalText(item.platform, 80) || '';
    const content = cleanSnapsMultilineText(item.content, 5000);
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
      status: 'unread',
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
    const content = cleanSnapsMultilineText(item.content, 5000);
    if (
      !content ||
      !(snapsTargetPlatforms as readonly string[]).includes(platform)
    ) {
      return undefined;
    }

    const sentiment = this.normalizeSentiment(item.sentiment);
    const status = this.normalizeFeedbackStatus(item.status) || 'unread';
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
      status,
      readAt:
        status === 'unread' ? undefined : this.cleanOptionalText(item.readAt, 80),
      resolvedAt:
        status === 'resolved'
          ? this.cleanOptionalText(item.resolvedAt, 80)
          : undefined,
      importedAt:
        this.cleanOptionalText(item.importedAt, 80) || new Date().toISOString(),
    };
  }

  private normalizeReplyTemplate(
    organizationId: string,
    value: unknown
  ): SnapsReplyTemplate | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as SnapsReplyTemplateInput & Partial<SnapsReplyTemplate>;
    const body = this.cleanTemplateText(input.body, 2000);
    if (!body) {
      return undefined;
    }
    const now = new Date().toISOString();

    return {
      id: this.cleanOptionalText(input.id, 160) || makeId(14),
      organizationId,
      title:
        this.cleanOptionalText(input.title, 120) ||
        this.defaultTemplateTitle(body),
      sentiment: this.normalizeSentiment(input.sentiment),
      platform: this.normalizePlatform(input.platform),
      body,
      cta: this.cleanTemplateText(input.cta, 280),
      tags: this.normalizeStringArray(input.tags, []).slice(0, 10),
      createdAt: this.cleanOptionalText(input.createdAt, 80) || now,
      updatedAt: this.cleanOptionalText(input.updatedAt, 80) || now,
    };
  }

  private normalizeInboxNote(
    organizationId: string,
    value: unknown
  ): SnapsInboxNote | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as SnapsInboxNoteInput & Partial<SnapsInboxNote>;
    const noteText = this.cleanTemplateText(input.note, 2000);
    const author = this.cleanOptionalText(input.author, 200);
    const postId = this.cleanOptionalText(input.postId, 200);
    if (!noteText || (!author && !postId)) {
      return undefined;
    }

    const now = new Date().toISOString();
    return {
      id: this.cleanOptionalText(input.id, 160) || makeId(14),
      organizationId,
      platform: this.normalizePlatform(input.platform),
      author,
      postId,
      sourceUrl: this.cleanOptionalText(input.sourceUrl, 2000),
      note: noteText,
      tags: this.normalizeStringArray(input.tags, []).slice(0, 10),
      createdAt: this.cleanOptionalText(input.createdAt, 80) || now,
      updatedAt: this.cleanOptionalText(input.updatedAt, 80) || now,
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

  private buildAssignmentCase(
    item: SnapsFeedbackItem,
    now: Date,
    templates: SnapsReplyTemplate[],
    notes: SnapsInboxNote[],
    defaultSlaMinutes: number
  ): SnapsInboxAssignmentCase {
    const priority = this.assignmentPriority(item);
    const assigneeRole = this.assignmentRole(item);
    const slaMinutes = this.assignmentSlaMinutes(
      priority,
      assigneeRole,
      defaultSlaMinutes
    );
    const template = this.assignmentReplyTemplate(item, templates);
    const noteMatches = this.assignmentNoteMatches(item, notes);
    const dueAt = new Date(now.getTime() + slaMinutes * 60 * 1000).toISOString();
    const tags = [
      assigneeRole,
      priority,
      item.platform,
      item.sentiment,
      ...item.conversionSignals,
    ]
      .filter(Boolean)
      .map((tag) => String(tag))
      .filter((tag, index, all) => all.indexOf(tag) === index)
      .slice(0, 12);

    return {
      id: `case-${item.id}`,
      itemId: item.id,
      platform: item.platform,
      author: item.author,
      postId: item.postId,
      excerpt: item.content.slice(0, 180),
      sentiment: item.sentiment,
      conversionSignals: item.conversionSignals,
      priority,
      assigneeRole,
      assigneeLabel: this.assignmentRoleLabel(assigneeRole),
      status:
        item.status === 'unread'
          ? 'new'
          : priority === 'low'
            ? 'watch'
            : 'open',
      slaMinutes,
      dueAt,
      tags,
      replyTemplateId: template?.id,
      replyTemplateTitle: template?.title,
      noteMatches,
      action: this.assignmentAction(item, assigneeRole),
      rationale: this.assignmentRationale(item, priority, assigneeRole, noteMatches),
    };
  }

  private assignmentPriority(
    item: SnapsFeedbackItem
  ): SnapsInboxAssignmentPriority {
    let score = item.status === 'unread' ? 12 : 6;
    if (item.sentiment === 'complaint') {
      score += 36;
    }
    if (item.sentiment === 'spam') {
      score += 24;
    }
    if (item.sentiment === 'collaboration') {
      score += 14;
    }
    if (item.sentiment === 'question') {
      score += 12;
    }
    for (const signal of item.conversionSignals) {
      const priority = this.conversionSignalDefinition(signal).priority;
      score += priority === 'high' ? 28 : priority === 'medium' ? 14 : 4;
    }
    if (this.feedbackAgeHours(item) <= 6) {
      score += 8;
    }

    if (score >= 68) {
      return 'urgent';
    }
    if (score >= 46) {
      return 'high';
    }
    if (score >= 20) {
      return 'normal';
    }
    return 'low';
  }

  private assignmentRole(item: SnapsFeedbackItem): SnapsInboxAssignmentRole {
    const signals = new Set(item.conversionSignals);
    if (item.sentiment === 'spam') {
      return 'moderation';
    }
    if (signals.has('pricing') || signals.has('purchase-intent')) {
      return 'sales';
    }
    if (item.sentiment === 'collaboration' || signals.has('collaboration')) {
      return 'partnership';
    }
    if (
      item.sentiment === 'complaint' ||
      signals.has('complaint-risk') ||
      signals.has('how-to-use') ||
      item.sentiment === 'question'
    ) {
      return 'support';
    }
    return 'community';
  }

  private assignmentSlaMinutes(
    priority: SnapsInboxAssignmentPriority,
    role: SnapsInboxAssignmentRole,
    defaultSlaMinutes: number
  ) {
    if (role === 'moderation') {
      return priority === 'urgent' ? 60 : 24 * 60;
    }
    if (priority === 'urgent') {
      return 30;
    }
    if (priority === 'high') {
      return role === 'sales' ? 60 : 120;
    }
    if (priority === 'low') {
      return 24 * 60;
    }
    return defaultSlaMinutes;
  }

  private assignmentReplyTemplate(
    item: SnapsFeedbackItem,
    templates: SnapsReplyTemplate[]
  ) {
    return (
      templates.find(
        (template) =>
          template.platform === item.platform && template.sentiment === item.sentiment
      ) ||
      templates.find((template) => template.sentiment === item.sentiment) ||
      templates.find((template) => template.platform === item.platform)
    );
  }

  private assignmentNoteMatches(
    item: SnapsFeedbackItem,
    notes: SnapsInboxNote[]
  ) {
    const author = (item.author || '').toLowerCase();
    return notes
      .filter((note) => {
        return (
          (!!item.postId && note.postId === item.postId) ||
          (!!author && (note.author || '').toLowerCase() === author)
        );
      })
      .slice(0, 3)
      .map((note) => ({
        id: note.id,
        note: note.note.slice(0, 180),
        tags: note.tags,
      }));
  }

  private assignmentAction(
    item: SnapsFeedbackItem,
    role: SnapsInboxAssignmentRole
  ) {
    if (role === 'moderation') {
      return '스팸/부적절 여부를 확인하고 숨김 또는 삭제 후보로 분리합니다.';
    }
    if (role === 'sales') {
      return '가격/구매 의도에 맞춰 자료 링크, 상담 CTA, 후속 DM 초안을 준비합니다.';
    }
    if (role === 'partnership') {
      return '협업 범위, 일정, 연락 채널을 확인하는 파트너십 응대를 준비합니다.';
    }
    if (role === 'support') {
      return item.sentiment === 'complaint'
        ? '원인 확인, 공개 답변, 비공개 후속 조치를 나눠 응대합니다.'
        : '사용법/링크/맥락 질문에 짧은 답변과 관련 자료를 붙입니다.';
    }
    return '칭찬/일반 반응은 관계 강화 답글이나 다음 콘텐츠 소재로 표시합니다.';
  }

  private assignmentRationale(
    item: SnapsFeedbackItem,
    priority: SnapsInboxAssignmentPriority,
    role: SnapsInboxAssignmentRole,
    noteMatches: SnapsInboxAssignmentCase['noteMatches']
  ) {
    return [
      `${this.assignmentPriorityLabel(priority)} 우선순위`,
      `${this.assignmentRoleLabel(role)} 담당`,
      item.conversionSignals.length
        ? `감지 신호: ${item.conversionSignals.join(', ')}`
        : '',
      noteMatches.length ? `기존 고객 메모 ${noteMatches.length}건 연결` : '',
    ].filter(Boolean);
  }

  private assignmentLanes(cases: SnapsInboxAssignmentCase[]) {
    return cases.reduce(
      (all, item) => {
        all[item.priority] += 1;
        return all;
      },
      {
        urgent: 0,
        high: 0,
        normal: 0,
        low: 0,
      } as Record<SnapsInboxAssignmentPriority, number>
    );
  }

  private assignmentTeamLoad(cases: SnapsInboxAssignmentCase[]) {
    const roles: SnapsInboxAssignmentRole[] = [
      'support',
      'sales',
      'community',
      'moderation',
      'partnership',
    ];
    return roles.map((role) => {
      const assigned = cases.filter((item) => item.assigneeRole === role);
      return {
        role,
        label: this.assignmentRoleLabel(role),
        count: assigned.length,
        urgent: assigned.filter((item) => item.priority === 'urgent').length,
        high: assigned.filter((item) => item.priority === 'high').length,
      };
    });
  }

  private assignmentNextActions(cases: SnapsInboxAssignmentCase[]) {
    const lanes = this.assignmentLanes(cases);
    const sales = cases.filter((item) => item.assigneeRole === 'sales').length;
    const support = cases.filter((item) => item.assigneeRole === 'support').length;
    const missingTemplates = cases.filter((item) => !item.replyTemplateId).length;

    return [
      lanes.urgent
        ? `긴급 케이스 ${lanes.urgent}건은 30-60분 안에 공개 답변 또는 DM 후속 조치를 정합니다.`
        : '',
      sales
        ? `영업 라우팅 ${sales}건은 가격표, 데모 링크, 상담 CTA가 들어간 저장 답변으로 처리합니다.`
        : '',
      support
        ? `지원 라우팅 ${support}건은 사용법/불만 원인을 분리해 미해결 큐에서 처리합니다.`
        : '',
      missingTemplates
        ? `저장 답변 미매칭 ${missingTemplates}건은 새 템플릿으로 만들어 반복 질문을 줄입니다.`
        : '',
      cases.length
        ? '처리한 케이스는 읽음/해결 상태로 전환하고, 재방문 리드는 고객 메모로 남깁니다.'
        : '새 댓글이나 리스닝 신호를 받은 반응함으로 가져온 뒤 다시 배정합니다.',
    ].filter(Boolean);
  }

  private assignmentAutomations(cases: SnapsInboxAssignmentCase[]) {
    return [
      '저장 답변이 매칭된 케이스는 답글 초안으로 바로 이동할 수 있습니다.',
      '가격/구매 신호는 영업 CTA와 sales attribution 링크를 함께 붙이는 후보입니다.',
      cases.some((item) => item.assigneeRole === 'moderation')
        ? '스팸 후보는 공개 숨김/삭제 전에 운영자가 확인합니다.'
        : '해결 처리된 항목은 다음 라우팅에서 자동 제외됩니다.',
    ];
  }

  private assignmentPriorityRank(priority: SnapsInboxAssignmentPriority) {
    return priority === 'urgent'
      ? 0
      : priority === 'high'
        ? 1
        : priority === 'normal'
          ? 2
          : 3;
  }

  private assignmentPriorityLabel(priority: SnapsInboxAssignmentPriority) {
    return priority === 'urgent'
      ? '긴급'
      : priority === 'high'
        ? '높음'
        : priority === 'normal'
          ? '보통'
          : '낮음';
  }

  private assignmentRoleLabel(role: SnapsInboxAssignmentRole) {
    return role === 'support'
      ? '고객지원'
      : role === 'sales'
        ? '영업'
        : role === 'community'
          ? '커뮤니티'
          : role === 'moderation'
            ? '모더레이션'
            : '파트너십';
  }

  private feedbackAgeHours(item: SnapsFeedbackItem) {
    const sourceDate = Date.parse(item.createdAt || item.importedAt || '');
    if (!Number.isFinite(sourceDate)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, (Date.now() - sourceDate) / (60 * 60 * 1000));
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

  private normalizePlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanOptionalText(value, 80) || '';
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private normalizeFeedbackStatus(
    value: unknown
  ): SnapsFeedbackStatus | undefined {
    const status = this.cleanOptionalText(value, 80) || '';
    return snapsFeedbackStatuses.includes(status as SnapsFeedbackStatus)
      ? (status as SnapsFeedbackStatus)
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
        item.content.replace(/\s+/g, ' ').trim().toLowerCase(),
      ].join('::');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private dedupeReplyTemplates(items: SnapsReplyTemplate[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.id || [item.title, item.body].join('::').toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private dedupeInboxNotes(items: SnapsInboxNote[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key =
        item.id ||
        [
          item.platform || '',
          item.author || '',
          item.postId || '',
          item.note.trim().toLowerCase(),
        ].join('::');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private defaultTemplateTitle(body: string) {
    return body.split('\n')[0].slice(0, 60) || '저장 답변';
  }

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    return typeof value === 'string' && value.trim()
      ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
      : undefined;
  }

  private cleanTemplateText(value: unknown, maxLength = 1000) {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }
    return value
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, maxLength);
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

  private async readReplyTemplates(organizationId: string) {
    try {
      const file = await fs.readFile(
        this.replyTemplatesFilePath(organizationId),
        'utf8'
      );
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsReplyTemplate[];
      }
      return parsed
        .map((template) => this.normalizeReplyTemplate(organizationId, template))
        .filter((template): template is SnapsReplyTemplate => !!template)
        .slice(0, MAX_REPLY_TEMPLATES);
    } catch {
      return [] as SnapsReplyTemplate[];
    }
  }

  private async writeReplyTemplates(
    organizationId: string,
    templates: SnapsReplyTemplate[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.replyTemplatesFilePath(organizationId),
      JSON.stringify(templates, null, 2)
    );
  }

  private async readInboxNotes(organizationId: string) {
    try {
      const file = await fs.readFile(this.inboxNotesFilePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsInboxNote[];
      }
      return parsed
        .map((note) => this.normalizeInboxNote(organizationId, note))
        .filter((note): note is SnapsInboxNote => !!note)
        .slice(0, MAX_INBOX_NOTES);
    } catch {
      return [] as SnapsInboxNote[];
    }
  }

  private async writeInboxNotes(
    organizationId: string,
    notes: SnapsInboxNote[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.inboxNotesFilePath(organizationId),
      JSON.stringify(notes, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.feedback-inbox.json`);
  }

  private replyTemplatesFilePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.reply-templates.json`);
  }

  private inboxNotesFilePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.inbox-notes.json`);
  }

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
