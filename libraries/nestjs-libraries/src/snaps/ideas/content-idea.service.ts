import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';

export type SnapsIdeaStatus =
  | 'inbox'
  | 'planned'
  | 'drafted'
  | 'scheduled'
  | 'archived';

export type SnapsIdeaPriority = 'high' | 'medium' | 'low';

export type SnapsIdeaInput = {
  title?: unknown;
  body?: unknown;
  group?: unknown;
  status?: unknown;
  tags?: unknown;
  mediaUrls?: unknown;
  linkUrl?: unknown;
  sourceUrl?: unknown;
  targetPlatforms?: unknown;
  priority?: unknown;
  note?: unknown;
  source?: unknown;
};

export type SnapsIdeaGenerateRequest = {
  topic?: unknown;
  audience?: unknown;
  goal?: unknown;
  tone?: unknown;
  pillars?: unknown;
  formats?: unknown;
  targetPlatforms?: unknown;
  count?: unknown;
  cta?: unknown;
  sourceText?: unknown;
};

export type SnapsIdeaListQuery = {
  status?: unknown;
  group?: unknown;
  tag?: unknown;
  search?: unknown;
};

export type SnapsIdeaStatusInput = {
  status?: unknown;
  group?: unknown;
  tags?: unknown;
  note?: unknown;
};

export type SnapsIdeaSuggestion = {
  title: string;
  body: string;
  group: string;
  tags: string[];
  targetPlatforms: SnapsTargetPlatform[];
  priority: SnapsIdeaPriority;
  angle: string;
  format: string;
  cta: string;
};

export type SnapsIdeaPreview = {
  product: 'snaps';
  source: 'snaps-idea-board';
  topic: string;
  audience: string;
  goal: string;
  totalIdeas: number;
  ideas: SnapsIdeaSuggestion[];
  warnings: string[];
  samplePrompt: string;
};

export type SnapsIdeaItem = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  group: string;
  status: SnapsIdeaStatus;
  tags: string[];
  mediaUrls: string[];
  linkUrl?: string;
  sourceUrl?: string;
  targetPlatforms: SnapsTargetPlatform[];
  priority: SnapsIdeaPriority;
  note?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  promotedAt?: string;
};

@Injectable()
export class SnapsContentIdeaService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  readonly samplePrompt = [
    '주제: AI 콘텐츠 운영 14일 챌린지',
    '대상: 혼자 SNS를 운영하는 B2B 마케터',
    '목표: 저장, 상담 댓글, 데모 신청',
    '톤: 실무형, 숫자 중심, 과장 없음',
  ].join('\n');

  generate(body?: SnapsIdeaGenerateRequest): SnapsIdeaPreview {
    const request = body || {};
    const topic =
      this.cleanText(request.topic, 160) ||
      this.firstLine(this.cleanText(request.sourceText, 1000)) ||
      'AI 콘텐츠 운영';
    const audience =
      this.cleanText(request.audience, 160) || '콘텐츠를 혼자 운영하는 팀';
    const goal = this.cleanText(request.goal, 160) || '저장과 상담 문의 증가';
    const tone = this.cleanOptionalText(request.tone, 160) || '실무형';
    const cta =
      this.cleanText(request.cta, 220) ||
      '댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.';
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const targetPlatforms = platforms.length
      ? platforms
      : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]);
    const pillars = this.cleanStringArray(request.pillars, 8, 80);
    const formats = this.cleanStringArray(request.formats, 8, 80);
    const count = this.clampNumber(request.count, 6, 1, 20);
    const warnings: string[] = [];
    if (!platforms.length) {
      warnings.push('No target platforms were selected, so default snaps platforms were used.');
    }

    const angles = [
      'blank-page-fix',
      'workflow-teardown',
      'mistake-list',
      'before-after',
      'tool-stack',
      'customer-question',
      'contrarian-take',
      'checklist',
      'behind-the-scenes',
      'proof-post',
    ];

    const ideas = Array.from({ length: count }, (_, index) => {
      const angle = angles[index % angles.length];
      const pillar = pillars[index % Math.max(1, pillars.length)] || topic;
      const format = formats[index % Math.max(1, formats.length)] || this.formatFor(index);
      const priority: SnapsIdeaPriority =
        index < 2 ? 'high' : index < 5 ? 'medium' : 'low';
      return this.buildSuggestion({
        topic,
        audience,
        goal,
        tone,
        cta,
        targetPlatforms,
        pillar,
        format,
        angle,
        priority,
        index: index + 1,
      });
    });

    return {
      product: 'snaps',
      source: 'snaps-idea-board',
      topic,
      audience,
      goal,
      totalIdeas: ideas.length,
      ideas,
      warnings,
      samplePrompt: this.samplePrompt,
    };
  }

  @SnapsSerialized()
  async save(
    organizationId: string,
    body?: SnapsIdeaInput
  ): Promise<SnapsIdeaItem> {
    const current = await this.list(organizationId);
    const now = new Date().toISOString();
    const item = this.normalizeItem(organizationId, {
      ...body,
      id: makeId(14),
      createdAt: now,
      updatedAt: now,
    });
    if (!item) {
      throw new BadRequestException('idea title or body is required.');
    }
    await this.write(organizationId, [item, ...current].slice(0, 1000));
    return item;
  }

  async list(
    organizationId: string,
    query?: SnapsIdeaListQuery
  ): Promise<SnapsIdeaItem[]> {
    const status = this.cleanStatus(query?.status);
    const group = this.cleanText(query?.group, 120).toLowerCase();
    const tag = this.cleanText(query?.tag, 120).toLowerCase();
    const search = this.cleanText(query?.search, 240).toLowerCase();
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsIdeaItem[];
      }
      return parsed
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsIdeaItem => !!item)
        .filter((item) => (status ? item.status === status : true))
        .filter((item) =>
          group ? item.group.toLowerCase() === group : true
        )
        .filter((item) =>
          tag ? item.tags.some((itemTag) => itemTag.toLowerCase() === tag) : true
        )
        .filter((item) =>
          search
            ? [
                item.title,
                item.body,
                item.group,
                item.note || '',
                item.tags.join(' '),
              ]
                .join(' ')
                .toLowerCase()
                .includes(search)
            : true
        );
    } catch {
      return [] as SnapsIdeaItem[];
    }
  }

  async get(organizationId: string, ideaId: string) {
    const item = (await this.list(organizationId)).find(
      (idea) => idea.id === ideaId
    );
    if (!item) {
      throw new NotFoundException('snaps idea was not found.');
    }
    return item;
  }

  @SnapsSerialized()
  async updateStatus(
    organizationId: string,
    ideaId: string,
    body?: SnapsIdeaStatusInput
  ) {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === ideaId);
    if (index < 0) {
      throw new NotFoundException('snaps idea was not found.');
    }
    const status = this.cleanStatus(body?.status);
    const group = this.cleanOptionalText(body?.group, 120);
    const tags =
      body && Object.prototype.hasOwnProperty.call(body, 'tags')
        ? this.cleanStringArray(body.tags, 30, 80)
        : undefined;
    const note = this.cleanOptionalText(body?.note, 1000);
    if (!status && !group && !tags && !note) {
      throw new BadRequestException('idea status, group, tags, or note is required.');
    }

    const next: SnapsIdeaItem = {
      ...items[index],
      status: status || items[index].status,
      group: group || items[index].group,
      tags: tags || items[index].tags,
      note: note || items[index].note,
      updatedAt: new Date().toISOString(),
    };
    items[index] = next;
    await this.write(organizationId, items);
    return {
      updated: true,
      idea: next,
    };
  }

  @SnapsSerialized()
  async markPromoted(organizationId: string, ideaId: string) {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === ideaId);
    if (index < 0) {
      throw new NotFoundException('snaps idea was not found.');
    }
    const now = new Date().toISOString();
    const next: SnapsIdeaItem = {
      ...items[index],
      status: 'drafted',
      promotedAt: now,
      updatedAt: now,
    };
    items[index] = next;
    await this.write(organizationId, items);
    return next;
  }

  @SnapsSerialized()
  async delete(organizationId: string, ideaId: string) {
    const items = await this.list(organizationId);
    const next = items.filter((item) => item.id !== ideaId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== items.length,
      ideas: next.length,
    };
  }

  @SnapsSerialized()
  async importIdeas(organizationId: string, ideas: unknown[] = []) {
    const current = await this.list(organizationId);
    const incoming = ideas
      .map((item) => this.normalizeItem(organizationId, item))
      .filter((item): item is SnapsIdeaItem => !!item);
    const merged = this.mergeByKey([...incoming, ...current], (item) =>
      item.id || `${item.title}:${item.body}`.toLowerCase()
    ).slice(0, 1000);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  toSourceInput(idea: SnapsIdeaItem): SnapsSourceLibraryInputDto {
    return {
      title: idea.title,
      sourceText: [
        idea.title,
        idea.body,
        idea.linkUrl ? `Link: ${idea.linkUrl}` : '',
        idea.sourceUrl ? `Source: ${idea.sourceUrl}` : '',
        idea.note ? `Note: ${idea.note}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      topic: idea.group,
      sourcePlatform: 'idea-board',
      tags: ['idea-board', idea.status, ...idea.targetPlatforms, ...idea.tags],
    };
  }

  private buildSuggestion(input: {
    topic: string;
    audience: string;
    goal: string;
    tone: string;
    cta: string;
    targetPlatforms: SnapsTargetPlatform[];
    pillar: string;
    format: string;
    angle: string;
    priority: SnapsIdeaPriority;
    index: number;
  }): SnapsIdeaSuggestion {
    const angleLabel = this.labelForAngle(input.angle);
    const title = `${input.topic}: ${angleLabel}`;
    const body = [
      `Hook: ${this.hookFor(input.angle, input.topic, input.audience)}`,
      `Audience: ${input.audience}`,
      `Angle: ${angleLabel} / ${input.pillar}`,
      `Format: ${input.format}`,
      `Goal: ${input.goal}`,
      `Tone: ${input.tone}`,
      `CTA: ${input.cta}`,
    ].join('\n');
    return {
      title,
      body,
      group: input.priority === 'high' ? 'This week' : 'Backlog',
      tags: [
        'idea',
        input.pillar,
        input.format,
        input.angle,
        input.priority,
      ].map((tag) => this.cleanTag(tag)),
      targetPlatforms: input.targetPlatforms,
      priority: input.priority,
      angle: input.angle,
      format: input.format,
      cta: input.cta,
    };
  }

  private normalizeItem(
    organizationId: string,
    value: unknown
  ): SnapsIdeaItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const input = value as Partial<SnapsIdeaItem>;
    const title = this.cleanText(input.title, 180);
    const body = cleanSnapsMultilineText(input.body, 5000);
    if (!title && body.length < 5) {
      return undefined;
    }
    const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
    const updatedAt = this.cleanDate(input.updatedAt) || createdAt;
    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      title: title || this.firstLine(body).slice(0, 120) || 'snaps idea',
      body,
      group: this.cleanText(input.group, 120) || 'Unassigned',
      status: this.cleanStatus(input.status) || 'inbox',
      tags: this.cleanStringArray(input.tags, 30, 80),
      mediaUrls: this.cleanUrlArray(input.mediaUrls, 10),
      linkUrl: this.cleanUrl(input.linkUrl),
      sourceUrl: this.cleanUrl(input.sourceUrl),
      targetPlatforms: this.cleanPlatforms(input.targetPlatforms),
      priority: this.cleanPriority(input.priority),
      note: this.cleanOptionalText(input.note, 1000),
      source: this.cleanText(input.source, 120) || 'snaps-idea-board',
      createdAt,
      updatedAt,
      promotedAt: this.cleanDate(input.promotedAt) || undefined,
    };
  }

  private async write(organizationId: string, ideas: SnapsIdeaItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(ideas, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.ideas.json`);
  }

  private cleanStatus(value: unknown): SnapsIdeaStatus | undefined {
    const status = this.cleanText(value, 80).toLowerCase();
    return ['inbox', 'planned', 'drafted', 'scheduled', 'archived'].includes(
      status
    )
      ? (status as SnapsIdeaStatus)
      : undefined;
  }

  private cleanPriority(value: unknown): SnapsIdeaPriority {
    const priority = this.cleanText(value, 80).toLowerCase();
    return ['high', 'medium', 'low'].includes(priority)
      ? (priority as SnapsIdeaPriority)
      : 'medium';
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s|]+/) : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, 80))
          .filter((item): item is SnapsTargetPlatform =>
            snapsTargetPlatforms.includes(item as SnapsTargetPlatform)
          )
      ),
    ].slice(0, 10);
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, maxLength))
          .filter(Boolean)
      ),
    ].slice(0, maxItems);
  }

  private cleanUrlArray(value: unknown, maxItems: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanUrl(item))
          .filter((item): item is string => !!item)
      ),
    ].slice(0, maxItems);
  }

  private cleanUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return undefined;
    }
    try {
      const parsed = new URL(text);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 80);
    if (!text) {
      return '';
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    const text = this.cleanText(value, maxLength);
    return text || undefined;
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
    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private clampNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(numeric)));
  }

  private firstLine(value: string) {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)[0] || '';
  }

  private cleanTag(value: string) {
    return value
      .trim()
      .replace(/^#/, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  private formatFor(index: number) {
    return [
      'text-post',
      'carousel',
      'short-video',
      'thread',
      'case-study',
      'question',
    ][index % 6];
  }

  private labelForAngle(angle: string) {
    const labels: Record<string, string> = {
      'blank-page-fix': 'blank page fix',
      'workflow-teardown': 'workflow teardown',
      'mistake-list': 'mistake list',
      'before-after': 'before and after',
      'tool-stack': 'tool stack',
      'customer-question': 'customer question',
      'contrarian-take': 'contrarian take',
      checklist: 'checklist',
      'behind-the-scenes': 'behind the scenes',
      'proof-post': 'proof post',
    };
    return labels[angle] || angle;
  }

  private hookFor(angle: string, topic: string, audience: string) {
    const hooks: Record<string, string> = {
      'blank-page-fix': `${audience}가 ${topic}을 시작할 때 가장 먼저 막히는 지점`,
      'workflow-teardown': `${topic}을 30분 안에 게시물 5개로 나누는 실제 순서`,
      'mistake-list': `${topic}에서 시간을 잃게 만드는 흔한 실수 3가지`,
      'before-after': `${topic} 적용 전후로 달라지는 주간 운영표`,
      'tool-stack': `${topic}을 반복 가능하게 만드는 최소 도구 스택`,
      'customer-question': `고객이 ${topic}에 대해 실제로 묻는 질문`,
      'contrarian-take': `${topic}은 더 많이 만드는 문제가 아니라 덜 버리는 문제입니다`,
      checklist: `${topic} 게시 전 5분 체크리스트`,
      'behind-the-scenes': `${topic}을 운영하는 내부 작업 화면`,
      'proof-post': `${topic}이 성과로 이어졌다는 작지만 구체적인 증거`,
    };
    return hooks[angle] || `${topic}에 대한 실행 가능한 아이디어`;
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

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
