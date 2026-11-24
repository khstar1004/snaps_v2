import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import {
  nextSnapsZonedOccurrence,
  normalizeSnapsTimezone,
  snapsDefaultTimezone,
} from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';

export type SnapsRepurposeWorkflowMode = 'asap' | 'schedule';
export type SnapsRepurposeContentFilter =
  | 'future-only'
  | 'existing-only'
  | 'all-content';

export type SnapsRepurposeSourceItemStatus =
  | 'ready'
  | 'queued'
  | 'ignored'
  | 'invalid';

export type SnapsRepurposeQueueRequest = {
  sourceItems?: unknown;
  sourceText?: unknown;
  sourcePlatform?: unknown;
  sourceUrl?: unknown;
  targetPlatforms?: unknown;
  workflowMode?: unknown;
  contentFilter?: unknown;
  scheduleSlots?: unknown;
  maxItems?: unknown;
  now?: unknown;
  activatedAt?: unknown;
  timezone?: unknown;
  dedupeExisting?: unknown;
  tags?: unknown;
};

export type SnapsRepurposeScheduleSlot = {
  id: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  nextOccurrenceAt: string;
  occupied: boolean;
};

export type SnapsRepurposeQueueItem = {
  itemIndex: number;
  title: string;
  sourcePlatform: string;
  sourceUrl?: string;
  sourceText: string;
  detectedAt: string;
  contentScope: 'future' | 'existing';
  workflowMode: SnapsRepurposeWorkflowMode;
  contentFilter: SnapsRepurposeContentFilter;
  targetPlatforms: SnapsTargetPlatform[];
  publishDate?: string;
  assignedSlot?: SnapsRepurposeScheduleSlot;
  action:
    | 'publish-asap-after-refresh'
    | 'fill-next-plan-slot'
    | 'manual-review-only'
    | 'ignored-by-filter';
  tags: string[];
  warnings: string[];
  status: SnapsRepurposeSourceItemStatus;
};

export type SnapsRepurposeQueuePreview = {
  product: 'snaps';
  source: 'snaps-repurpose-queue';
  workflowMode: SnapsRepurposeWorkflowMode;
  contentFilter: SnapsRepurposeContentFilter;
  pollIntervalHours: 2;
  checkNowAvailable: true;
  timezone: string;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  ignoredItems: number;
  invalidItems: number;
  readyToSchedule: number;
  scheduleSlots: SnapsRepurposeScheduleSlot[];
  items: SnapsRepurposeQueueItem[];
  warnings: string[];
  recommendations: string[];
};

type NormalizedRepurposeDefaults = {
  sourcePlatform: string;
  sourceUrl?: string;
  workflowMode: SnapsRepurposeWorkflowMode;
  contentFilter: SnapsRepurposeContentFilter;
  targetPlatforms: SnapsTargetPlatform[];
  scheduleSlots: SnapsRepurposeScheduleSlot[];
  now: Date;
  activatedAt: Date;
  timezone: string;
  dedupeExisting: boolean;
  tags: string[];
  maxItems: number;
};

type ParsedSourceItem = {
  title: string;
  sourceText: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  detectedAt?: string;
  tags: string[];
};

@Injectable()
export class SnapsRepurposeQueueService {
  readonly sampleSource = [
    'youtube|2026-06-01T11:00:00+09:00|https://example.com/youtube/ops-demo|AI 운영 데모 영상|라이브 데모에서 원문 정리, 쇼츠, 댓글 응대를 한 번에 보여줬습니다.',
    'tiktok|2026-06-01T12:30:00+09:00|https://example.com/tiktok/hook-test|15초 훅 테스트|조회수가 높은 짧은 훅을 Threads와 LinkedIn용 문장으로 바꿉니다.',
    'blog|2026-05-20T09:00:00+09:00|https://example.com/blog/old-guide|기존 가이드|이미 공개된 글은 일정 기반 워크플로우에서만 재배포합니다.',
  ].join('\n');

  preview(body?: SnapsRepurposeQueueRequest): SnapsRepurposeQueuePreview {
    const request = body || {};
    const defaults = this.defaultsFor(request);
    const parsedItems = this.parseSourceItems(request, defaults).slice(
      0,
      defaults.maxItems
    );

    if (!parsedItems.length) {
      throw new BadRequestException('sourceItems or sourceText is required for repurpose queue.');
    }

    const items = parsedItems.map((item, index) =>
      this.normalizeItem(item, index + 1, defaults)
    );
    const warnings = this.previewWarnings(items, defaults);

    return {
      product: 'snaps',
      source: 'snaps-repurpose-queue',
      workflowMode: defaults.workflowMode,
      contentFilter: defaults.contentFilter,
      pollIntervalHours: 2,
      checkNowAvailable: true,
      timezone: defaults.timezone,
      sampleSource: this.sampleSource,
      totalItems: items.length,
      acceptedItems: items.filter(
        (item) => item.status === 'ready' || item.status === 'queued'
      ).length,
      ignoredItems: items.filter((item) => item.status === 'ignored').length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      scheduleSlots: defaults.scheduleSlots,
      items,
      warnings,
      recommendations: this.recommendations(defaults, items),
    };
  }

  toSourceInputs(items: SnapsRepurposeQueueItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status === 'ready' || item.status === 'queued')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: `${item.sourcePlatform} repurpose`,
        sourcePlatform: 'repurpose-queue',
        tags: ['repurpose-queue', item.workflowMode, item.contentFilter, ...item.tags],
      }));
  }

  toVariants(item: SnapsRepurposeQueueItem): SnapsVariant[] {
    if (item.status !== 'ready' && item.status !== 'queued') {
      return [];
    }

    return item.targetPlatforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      return {
        platform,
        label: rule.label,
        title: item.title,
        content: fitSnapsContent(platform, this.variantContent(item, rule.maxLength)),
        hashtags: this.toHashtags(item.tags, rule.hashtagLimit),
        settings: {
          source: 'snaps-repurpose-queue',
          sourcePlatform: item.sourcePlatform,
          sourceUrl: item.sourceUrl,
          workflowMode: item.workflowMode,
          contentFilter: item.contentFilter,
          assignedSlot: item.assignedSlot?.id,
          publishDate: item.publishDate,
        },
        publishMode: rule.publishMode,
        notes: [
          `workflowMode: ${item.workflowMode}`,
          `contentFilter: ${item.contentFilter}`,
          item.assignedSlot
            ? `slot: ${item.assignedSlot.label} ${item.assignedSlot.startTime}-${item.assignedSlot.endTime}`
            : '',
          item.sourceUrl ? `sourceUrl: ${item.sourceUrl}` : '',
        ].filter(Boolean),
      };
    });
  }

  private defaultsFor(
    request: SnapsRepurposeQueueRequest
  ): NormalizedRepurposeDefaults {
    const now = this.cleanDate(request.now) || new Date();
    const activatedAt = this.cleanDate(request.activatedAt) || now;
    const timezone =
      normalizeSnapsTimezone(request.timezone) || snapsDefaultTimezone();
    const workflowMode = this.workflowMode(request.workflowMode);
    const contentFilter =
      workflowMode === 'asap'
        ? 'future-only'
        : this.contentFilter(request.contentFilter);
    const targetPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const scheduleSlots = this.scheduleSlots(request.scheduleSlots, now, timezone);

    return {
      sourcePlatform:
        this.cleanText(request.sourcePlatform, 80) || 'youtube',
      sourceUrl: this.cleanOptionalUrl(request.sourceUrl) || undefined,
      workflowMode,
      contentFilter,
      targetPlatforms: targetPlatforms.length
        ? targetPlatforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      scheduleSlots,
      now,
      activatedAt,
      timezone,
      dedupeExisting: this.boolean(request.dedupeExisting, true),
      tags: this.cleanTags(request.tags),
      maxItems: this.clampNumber(request.maxItems, 12, 1, 50),
    };
  }

  private parseSourceItems(
    request: SnapsRepurposeQueueRequest,
    defaults: NormalizedRepurposeDefaults
  ): ParsedSourceItem[] {
    if (Array.isArray(request.sourceItems)) {
      return request.sourceItems
        .map((item) => this.parseRecordSourceItem(item, defaults))
        .filter((item): item is ParsedSourceItem => !!item);
    }

    const sourceText = cleanSnapsMultilineText(request.sourceText, 120000);
    if (!sourceText) {
      return [];
    }

    try {
      const parsed = JSON.parse(sourceText);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => this.parseRecordSourceItem(item, defaults))
          .filter((item): item is ParsedSourceItem => !!item);
      }
    } catch {
      // Line parser below handles CSV-ish copy/paste input.
    }

    return sourceText
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => this.parseLineSourceItem(line, index + 1, defaults));
  }

  private parseRecordSourceItem(
    item: unknown,
    defaults: NormalizedRepurposeDefaults
  ): ParsedSourceItem | undefined {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return undefined;
    }
    const record = item as Record<string, unknown>;
    const title =
      this.cleanText(record.title, 180) ||
      this.cleanText(record.name, 180) ||
      'Repurpose source item';
    const sourceText =
      cleanSnapsMultilineText(record.sourceText, 20000) ||
      cleanSnapsMultilineText(record.description, 20000) ||
      cleanSnapsMultilineText(record.caption, 20000) ||
      title;
    return {
      title,
      sourceText,
      sourcePlatform:
        this.cleanText(record.sourcePlatform, 80) ||
        this.cleanText(record.platform, 80) ||
        defaults.sourcePlatform,
      sourceUrl:
        this.cleanOptionalUrl(record.sourceUrl) ||
        this.cleanOptionalUrl(record.url) ||
        defaults.sourceUrl,
      detectedAt:
        this.cleanText(record.detectedAt, 120) ||
        this.cleanText(record.publishedAt, 120) ||
        undefined,
      tags: [...defaults.tags, ...this.cleanTags(record.tags)],
    };
  }

  private parseLineSourceItem(
    line: string,
    index: number,
    defaults: NormalizedRepurposeDefaults
  ): ParsedSourceItem {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length >= 5) {
      return {
        sourcePlatform: parts[0] || defaults.sourcePlatform,
        detectedAt: parts[1],
        sourceUrl: this.cleanOptionalUrl(parts[2]) || defaults.sourceUrl,
        title: parts[3] || `Repurpose item ${index}`,
        sourceText: parts.slice(4).join(' | ') || parts[3] || line,
        tags: defaults.tags,
      };
    }
    return {
      title: this.cleanText(line, 90) || `Repurpose item ${index}`,
      sourceText: line,
      sourcePlatform: defaults.sourcePlatform,
      sourceUrl: defaults.sourceUrl,
      tags: defaults.tags,
    };
  }

  private normalizeItem(
    item: ParsedSourceItem,
    itemIndex: number,
    defaults: NormalizedRepurposeDefaults
  ): SnapsRepurposeQueueItem {
    const detectedAt =
      this.cleanDate(item.detectedAt) ||
      new Date(defaults.now.getTime() + itemIndex * 30 * 60 * 1000);
    const contentScope =
      detectedAt.getTime() >= defaults.activatedAt.getTime()
        ? 'future'
        : 'existing';
    const inFilter = this.inContentFilter(contentScope, defaults.contentFilter);
    const warnings: string[] = [];
    let action: SnapsRepurposeQueueItem['action'] = 'manual-review-only';
    let publishDate: string | undefined;
    let assignedSlot: SnapsRepurposeScheduleSlot | undefined;
    let status: SnapsRepurposeSourceItemStatus = 'ready';

    if (!item.sourceText || item.sourceText.length < 5) {
      warnings.push('Source item text is too short to repurpose.');
      status = 'invalid';
    }
    if (!defaults.targetPlatforms.length) {
      warnings.push('No supported target platforms were selected.');
      status = 'invalid';
    }
    if (defaults.dedupeExisting && contentScope === 'existing') {
      warnings.push('Existing source content should be deduped against previous imports.');
    }
    if (!inFilter && status !== 'invalid') {
      warnings.push('Source item is ignored by the current content filter.');
      status = 'ignored';
      action = 'ignored-by-filter';
    } else if (defaults.workflowMode === 'asap' && status !== 'invalid') {
      action = 'publish-asap-after-refresh';
      publishDate = new Date(detectedAt.getTime() + 2 * 60 * 60 * 1000).toISOString();
      status = warnings.length ? 'queued' : 'ready';
    } else if (status !== 'invalid') {
      assignedSlot = this.pickSlot(defaults.scheduleSlots, itemIndex);
      action = assignedSlot ? 'fill-next-plan-slot' : 'manual-review-only';
      publishDate = assignedSlot?.nextOccurrenceAt;
      if (!assignedSlot) {
        warnings.push('No active posting-plan slot was available.');
      }
      status = warnings.length ? 'queued' : 'ready';
    }

    return {
      itemIndex,
      title: item.title,
      sourcePlatform: item.sourcePlatform || defaults.sourcePlatform,
      sourceUrl: item.sourceUrl,
      sourceText: item.sourceText,
      detectedAt: detectedAt.toISOString(),
      contentScope,
      workflowMode: defaults.workflowMode,
      contentFilter: defaults.contentFilter,
      targetPlatforms: defaults.targetPlatforms,
      publishDate,
      assignedSlot,
      action,
      tags: [
        'repurpose',
        defaults.workflowMode,
        contentScope,
        ...(item.tags.length ? item.tags : [item.sourcePlatform || defaults.sourcePlatform]),
      ],
      warnings,
      status,
    };
  }

  private scheduleSlots(
    value: unknown,
    now: Date,
    timezone: string
  ): SnapsRepurposeScheduleSlot[] {
    const parsed = Array.isArray(value)
      ? value
          .map((item, index) => this.scheduleSlotFromRecord(item, index + 1, now, timezone))
          .filter((item): item is SnapsRepurposeScheduleSlot => !!item)
      : cleanSnapsMultilineText(value, 4000)
          .split(/\r?\n+/)
          .map((line, index) => this.scheduleSlotFromLine(line, index + 1, now, timezone))
          .filter((item): item is SnapsRepurposeScheduleSlot => !!item);
    return parsed.length
      ? parsed.slice(0, 35)
      : this.defaultSlots(now, timezone);
  }

  private scheduleSlotFromRecord(
    value: unknown,
    index: number,
    now: Date,
    timezone: string
  ): SnapsRepurposeScheduleSlot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    return this.makeSlot({
      id: this.cleanText(record.id, 80) || `slot-${index}`,
      label: this.cleanText(record.label, 80) || 'General',
      dayOfWeek: this.cleanDay(record.dayOfWeek ?? record.day),
      startTime: this.cleanLocalTime(record.startTime) || '10:00',
      endTime: this.cleanLocalTime(record.endTime) || '11:00',
      timezone: normalizeSnapsTimezone(record.timezone) || timezone,
      now,
      occupied: this.boolean(record.occupied, false),
    });
  }

  private scheduleSlotFromLine(
    line: string,
    index: number,
    now: Date,
    timezone: string
  ): SnapsRepurposeScheduleSlot | undefined {
    const clean = line.trim();
    if (!clean) {
      return undefined;
    }
    const parts = clean.split('|').map((part) => part.trim());
    return this.makeSlot({
      id: `slot-${index}`,
      label: parts[0] || 'General',
      dayOfWeek: this.cleanDay(parts[1]),
      startTime: this.cleanLocalTime(parts[2]) || '10:00',
      endTime: this.cleanLocalTime(parts[3]) || '11:00',
      timezone,
      now,
      occupied: false,
    });
  }

  private defaultSlots(now: Date, timezone: string) {
    return [
      ['Authority', 1, '09:00', '10:00'],
      ['Education', 2, '10:00', '11:00'],
      ['Shorts', 3, '12:00', '13:00'],
      ['Community', 4, '15:00', '16:00'],
      ['Promotion', 5, '11:00', '12:00'],
    ].map(([label, dayOfWeek, startTime, endTime], index) =>
      this.makeSlot({
        id: `slot-${index + 1}`,
        label: String(label),
        dayOfWeek: Number(dayOfWeek),
        startTime: String(startTime),
        endTime: String(endTime),
        timezone,
        now,
        occupied: false,
      })
    );
  }

  private makeSlot(input: {
    id: string;
    label: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    timezone: string;
    now: Date;
    occupied: boolean;
  }): SnapsRepurposeScheduleSlot {
    return {
      id: input.id,
      label: input.label,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      nextOccurrenceAt: nextSnapsZonedOccurrence(
        input.now,
        input.dayOfWeek,
        input.startTime,
        input.timezone
      ).toISOString(),
      occupied: input.occupied,
    };
  }

  private pickSlot(slots: SnapsRepurposeScheduleSlot[], itemIndex: number) {
    const open = slots.filter((slot) => !slot.occupied);
    if (!open.length) {
      return undefined;
    }
    return open[(itemIndex - 1) % open.length];
  }

  private inContentFilter(
    scope: 'future' | 'existing',
    filter: SnapsRepurposeContentFilter
  ) {
    return filter === 'all-content' || filter === `${scope}-only`;
  }

  private previewWarnings(
    items: SnapsRepurposeQueueItem[],
    defaults: NormalizedRepurposeDefaults
  ) {
    const warnings: string[] = [];
    if (defaults.workflowMode === 'asap') {
      warnings.push('ASAP mode uses future content only and assumes an approximately 2-hour source refresh delay.');
    }
    if (items.some((item) => item.status === 'ignored')) {
      warnings.push('Some source items are ignored by the selected content filter.');
    }
    if (items.some((item) => item.status === 'queued')) {
      warnings.push('Queued items need operator review before connected draft or schedule creation.');
    }
    return warnings;
  }

  private recommendations(
    defaults: NormalizedRepurposeDefaults,
    items: SnapsRepurposeQueueItem[]
  ) {
    const recommendations = [
      'Use Check Now after publishing on the source platform to pull new content into review faster.',
      'Rewrite each target caption for platform-native context instead of reposting the source caption unchanged.',
      'Keep automatic publishing behind operator confirmation for account-safety review.',
    ];
    if (defaults.workflowMode === 'schedule') {
      recommendations.push('Use labeled posting-plan slots so every source item lands in the next matching weekly queue window.');
    }
    if (items.some((item) => item.contentScope === 'existing')) {
      recommendations.push('Deduplicate existing source content before importing it into Source Library.');
    }
    return recommendations;
  }

  private decorateSourceText(item: SnapsRepurposeQueueItem) {
    return [
      item.sourceText,
      `Repurpose source platform: ${item.sourcePlatform}`,
      item.sourceUrl ? `Repurpose source URL: ${item.sourceUrl}` : '',
      `Detected at: ${item.detectedAt}`,
      `Workflow mode: ${item.workflowMode}`,
      `Content filter: ${item.contentFilter}`,
      item.publishDate ? `Publish date: ${item.publishDate}` : '',
      item.assignedSlot
        ? `Posting plan slot: ${item.assignedSlot.label} ${item.assignedSlot.startTime}-${item.assignedSlot.endTime}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private variantContent(item: SnapsRepurposeQueueItem, maxLength: number) {
    const intro =
      item.workflowMode === 'asap'
        ? '새 원본 콘텐츠를 감지해 플랫폼별 초안으로 바꿨습니다.'
        : `다음 ${item.assignedSlot?.label || 'posting plan'} 슬롯에 맞춰 재배포합니다.`;
    const body = [
      intro,
      item.title,
      item.sourceText,
      item.sourceUrl ? `원본: ${item.sourceUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return body.slice(0, maxLength);
  }

  private workflowMode(value: unknown): SnapsRepurposeWorkflowMode {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    return normalized === 'asap' || normalized === 'as-soon-as-possible'
      ? 'asap'
      : 'schedule';
  }

  private contentFilter(value: unknown): SnapsRepurposeContentFilter {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    if (normalized === 'future' || normalized === 'future-only') {
      return 'future-only';
    }
    if (normalized === 'existing' || normalized === 'existing-only') {
      return 'existing-only';
    }
    return 'all-content';
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value.map((item) => this.cleanText(item, 80)).join('|')
      : this.cleanText(value, 1000);
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
      shorts: 'youtube',
      tiktok: 'tiktok',
      xhs: 'xiaohongshu',
      xiaohongshu: 'xiaohongshu',
      blog: 'naver-blog',
      'naver-blog': 'naver-blog',
      cafe: 'naver-cafe',
      'naver-cafe': 'naver-cafe',
      kakao: 'kakao-talk',
      'kakao-talk': 'kakao-talk',
      linkedin: 'linkedin',
      x: 'x',
      twitter: 'x',
    };
    const platforms = raw
      .split(/[|,;]+/g)
      .map((item) => item.trim().toLowerCase().replace(/^@/, '').replace(/[\s_]+/g, '-'))
      .map((platform) => aliases[platform] || platform)
      .filter((platform): platform is SnapsTargetPlatform =>
        snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      );
    return [...new Set(platforms)].slice(0, 10);
  }

  private cleanDay(value: unknown) {
    const normalized = this.cleanText(value, 40).toLowerCase();
    const map: Record<string, number> = {
      sunday: 0,
      sun: 0,
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6,
    };
    const number = Number(normalized);
    if (Number.isFinite(number)) {
      return Math.min(6, Math.max(0, Math.round(number)));
    }
    return map[normalized] ?? 1;
  }

  private cleanLocalTime(value: unknown) {
    const text = this.cleanText(value, 20);
    const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
      return '';
    }
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 120);
    if (!text) {
      return undefined;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private cleanOptionalUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return '';
    }
    try {
      const parsed = new URL(text);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  private cleanTags(value: unknown) {
    const raw = Array.isArray(value)
      ? value.map((item) => this.cleanText(item, 80)).join('|')
      : this.cleanText(value, 1000);
    return [
      ...new Set(
        raw
          .split(/[|,;#\s]+/g)
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter((tag) => tag.length > 1)
      ),
    ].slice(0, 20);
  }

  private toHashtags(tags: string[], limit = 5) {
    return tags
      .map((tag) => tag.replace(/^#+/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .slice(0, Math.max(0, limit));
  }

  private boolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private clampNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
}
