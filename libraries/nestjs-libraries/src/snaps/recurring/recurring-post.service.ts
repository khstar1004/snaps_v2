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
  addSnapsZonedDays,
  formatSnapsZonedTime,
  setSnapsZonedTime,
} from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';

export type SnapsRecurringCadence =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom-days';

export type SnapsRecurringVariationMode = 'same' | 'angle-rotation';

export type SnapsRecurringPostRequest = {
  sourceText?: unknown;
  title?: unknown;
  topic?: unknown;
  tone?: unknown;
  cadence?: unknown;
  intervalDays?: unknown;
  repeatCount?: unknown;
  startDate?: unknown;
  localTime?: unknown;
  targetPlatforms?: unknown;
  tags?: unknown;
  cta?: unknown;
  variationMode?: unknown;
};

export type SnapsRecurringPostScheduleRequest = SnapsRecurringPostRequest & {
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
  integrations?: unknown;
  publishDate?: unknown;
};

export type SnapsRecurringPostItemStatus = 'ready' | 'warning' | 'invalid';

export type SnapsRecurringPostItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  topic?: string;
  tone?: string;
  cadence: SnapsRecurringCadence;
  intervalDays: number;
  publishDate: string;
  localTime: string;
  variation: string;
  cta: string;
  platforms: SnapsTargetPlatform[];
  tags: string[];
  warnings: string[];
  status: SnapsRecurringPostItemStatus;
};

export type SnapsRecurringPostPreview = {
  product: 'snaps';
  source: 'snaps-recurring-posts';
  title: string;
  cadence: SnapsRecurringCadence;
  intervalDays: number;
  repeatCount: number;
  variationMode: SnapsRecurringVariationMode;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsRecurringPostItem[];
  warnings: string[];
};

type RecurringDefaults = {
  sourceText: string;
  title: string;
  topic?: string;
  tone?: string;
  cadence: SnapsRecurringCadence;
  intervalDays: number;
  repeatCount: number;
  startDate: Date;
  localTime: string;
  platforms: SnapsTargetPlatform[];
  tags: string[];
  cta: string;
  variationMode: SnapsRecurringVariationMode;
};

@Injectable()
export class SnapsRecurringPostService {
  readonly sampleSource = [
    '반복 게시 템플릿: 2주 파일럿 모집',
    '문제: 콘텐츠 운영자는 매주 같은 CTA를 새로 쓰느라 시간을 잃습니다.',
    '해결: 핵심 제안을 유지하되 훅과 증거를 바꿔 반복 게시합니다.',
    'CTA: 댓글로 "파일럿"이라고 남기면 샘플 캘린더를 보냅니다.',
  ].join('\n');

  preview(body?: SnapsRecurringPostRequest): SnapsRecurringPostPreview {
    const defaults = this.defaultsFor(body || {});
    const warnings: string[] = [];
    const items = Array.from({ length: defaults.repeatCount }, (_, index) =>
      this.buildItem(defaults, index + 1)
    );

    if (defaults.cadence === 'custom-days' && defaults.intervalDays < 1) {
      warnings.push('Custom cadence needs an intervalDays value of at least 1.');
    }

    return {
      product: 'snaps',
      source: 'snaps-recurring-posts',
      title: defaults.title,
      cadence: defaults.cadence,
      intervalDays: defaults.intervalDays,
      repeatCount: defaults.repeatCount,
      variationMode: defaults.variationMode,
      sampleSource: this.sampleSource,
      totalItems: items.length,
      acceptedItems: items.filter((item) => item.status !== 'invalid').length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      items,
      warnings,
    };
  }

  toSourceInputs(items: SnapsRecurringPostItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status !== 'invalid')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: item.topic || item.variation,
        tone: item.tone,
        sourcePlatform: 'recurring-posts',
        tags: [
          'recurring-posts',
          item.cadence,
          item.variation,
          ...item.platforms,
          ...item.tags,
        ],
      }));
  }

  toVariants(item: SnapsRecurringPostItem): SnapsVariant[] {
    if (item.status === 'invalid') {
      return [];
    }

    return item.platforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      return {
        platform,
        label: rule.label,
        title: item.title,
        content: fitSnapsContent(platform, this.decorateVariantContent(item, rule.maxLength)),
        hashtags: this.toHashtags(item.tags, rule.hashtagLimit),
        settings: {
          source: 'snaps-recurring-posts',
          subject: item.title,
          recurringIndex: item.itemIndex,
          recurringCadence: item.cadence,
          intervalDays: item.intervalDays,
          publishDate: item.publishDate,
        },
        publishMode: rule.publishMode,
        notes: [
          `publishDate: ${item.publishDate}`,
          `variation: ${item.variation}`,
          `cadence: ${item.cadence}`,
          `cta: ${item.cta}`,
        ],
      };
    });
  }

  private defaultsFor(request: SnapsRecurringPostRequest): RecurringDefaults {
    const sourceText = this.cleanSourceText(request.sourceText);
    if (sourceText.length < 10) {
      throw new BadRequestException('sourceText is required for recurring posts.');
    }

    const title =
      this.cleanText(request.title, 160) ||
      this.firstLine(sourceText).slice(0, 90) ||
      'Recurring post';
    const topic = this.cleanText(request.topic, 240) || undefined;
    const tone = this.cleanText(request.tone, 240) || undefined;
    const cadence = this.cleanCadence(request.cadence);
    const intervalDays =
      cadence === 'custom-days'
        ? this.clampNumber(request.intervalDays, 7, 1, 90)
        : this.intervalDaysForCadence(cadence);
    const repeatCount = this.clampNumber(request.repeatCount, 4, 2, 30);
    const startDate = this.cleanStartDate(request.startDate, request.localTime);
    const localTime = this.cleanLocalTime(request.localTime) || this.timeOf(startDate);
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const tags = this.cleanTags(request.tags);
    const cta =
      this.cleanText(request.cta, 220) ||
      '필요하면 저장하고 다음 실행에 써보세요.';
    const variationMode = this.cleanVariationMode(request.variationMode);

    return {
      sourceText,
      title,
      topic,
      tone,
      cadence,
      intervalDays,
      repeatCount,
      startDate,
      localTime,
      platforms: platforms.length
        ? platforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      tags,
      cta,
      variationMode,
    };
  }

  private buildItem(
    defaults: RecurringDefaults,
    itemIndex: number
  ): SnapsRecurringPostItem {
    const publishDate = addSnapsZonedDays(
      defaults.startDate,
      defaults.intervalDays * (itemIndex - 1)
    );
    const variation =
      defaults.variationMode === 'same'
        ? 'same-message'
        : this.variationFor(itemIndex);
    const sourceText = this.recurringCopy(defaults, itemIndex, variation);
    const warnings: string[] = [];

    if (!defaults.platforms.length) {
      warnings.push('No supported snaps platforms were selected.');
    }
    if (publishDate.getTime() < Date.now()) {
      warnings.push('publishDate is in the past; scheduling should be reviewed.');
    }
    if (
      defaults.platforms.some((platform) => platform === 'youtube' || platform === 'tiktok')
    ) {
      warnings.push('Short-video recurring posts should be reviewed for media/API limits.');
    }

    const status: SnapsRecurringPostItemStatus =
      sourceText.length < 10 || !defaults.platforms.length
        ? 'invalid'
        : warnings.length
          ? 'warning'
          : 'ready';

    return {
      itemIndex,
      title: `${defaults.title} · R${itemIndex}`,
      sourceText,
      topic: defaults.topic,
      tone: defaults.tone,
      cadence: defaults.cadence,
      intervalDays: defaults.intervalDays,
      publishDate: publishDate.toISOString(),
      localTime: defaults.localTime,
      variation,
      cta: defaults.cta,
      platforms: defaults.platforms,
      tags: ['recurring', defaults.cadence, ...defaults.tags],
      warnings,
      status,
    };
  }

  private recurringCopy(
    defaults: RecurringDefaults,
    itemIndex: number,
    variation: string
  ) {
    const angleOpeners: Record<string, string> = {
      'problem-reminder': '이번 반복 게시에서는 문제를 다시 선명하게 보여줍니다.',
      'proof-refresh': '이번 반복 게시에서는 증거와 반응을 앞에 둡니다.',
      'checklist-version': '이번 반복 게시에서는 실행 순서를 체크리스트로 바꿉니다.',
      'objection-answer': '이번 반복 게시에서는 망설이는 이유를 먼저 답합니다.',
      'last-call': '이번 반복 게시에서는 마감성과 행동 요청을 강화합니다.',
      'same-message': '핵심 제안을 유지해 같은 메시지를 정해진 주기로 반복합니다.',
    };

    return [
      `${defaults.title} 반복 게시 ${itemIndex}`,
      angleOpeners[variation] || angleOpeners['same-message'],
      defaults.tone ? `톤: ${defaults.tone}` : '',
      '',
      defaults.sourceText,
      '',
      defaults.cta,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private decorateSourceText(item: SnapsRecurringPostItem) {
    return [
      item.sourceText,
      `Recurring cadence: ${item.cadence}`,
      `Recurring interval days: ${item.intervalDays}`,
      `Publish date: ${item.publishDate}`,
      `Variation: ${item.variation}`,
      `CTA: ${item.cta}`,
    ].join('\n\n');
  }

  private decorateVariantContent(item: SnapsRecurringPostItem, maxLength: number) {
    return item.sourceText.slice(0, maxLength);
  }

  private intervalDaysForCadence(cadence: SnapsRecurringCadence) {
    if (cadence === 'daily') {
      return 1;
    }
    if (cadence === 'biweekly') {
      return 14;
    }
    if (cadence === 'monthly') {
      return 30;
    }
    return 7;
  }

  private variationFor(index: number) {
    const variations = [
      'problem-reminder',
      'proof-refresh',
      'checklist-version',
      'objection-answer',
      'last-call',
    ];
    return variations[(index - 1) % variations.length];
  }

  private cleanCadence(value: unknown): SnapsRecurringCadence {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    if (normalized === 'daily' || normalized === 'day') {
      return 'daily';
    }
    if (normalized === 'biweekly' || normalized === 'bi-weekly' || normalized === '2-week') {
      return 'biweekly';
    }
    if (normalized === 'monthly' || normalized === 'month') {
      return 'monthly';
    }
    if (normalized === 'custom' || normalized === 'custom-days') {
      return 'custom-days';
    }
    return 'weekly';
  }

  private cleanVariationMode(value: unknown): SnapsRecurringVariationMode {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    return normalized === 'same' || normalized === 'same-message'
      ? 'same'
      : 'angle-rotation';
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

  private cleanStartDate(value: unknown, localTime: unknown) {
    const text = this.cleanText(value, 120);
    const date = text ? new Date(text) : this.defaultStartDate(localTime);
    if (Number.isNaN(date.getTime())) {
      return this.defaultStartDate(localTime);
    }
    const time = this.cleanLocalTime(localTime);
    if (time) {
      const [hours, minutes] = time.split(':').map((part) => Number(part));
      return setSnapsZonedTime(date, hours, minutes);
    }
    return date;
  }

  private defaultStartDate(localTime: unknown) {
    const time = this.cleanLocalTime(localTime) || '10:00';
    const [hours, minutes] = time.split(':').map((part) => Number(part));
    return setSnapsZonedTime(addSnapsZonedDays(new Date(), 1), hours, minutes);
  }

  private cleanLocalTime(value: unknown) {
    const text = this.cleanText(value, 20);
    const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
      return '';
    }
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private timeOf(date: Date) {
    return formatSnapsZonedTime(date);
  }

  private cleanSourceText(value: unknown) {
    return cleanSnapsMultilineText(value, 12000);
  }

  private firstLine(value: string) {
    return value
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .find(Boolean) || '';
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
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
}
