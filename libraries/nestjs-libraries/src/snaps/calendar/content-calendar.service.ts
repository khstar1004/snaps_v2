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
  getSnapsZonedParts,
  setSnapsZonedTime,
} from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';

export type SnapsContentCalendarCadence =
  | 'daily'
  | 'weekdays'
  | 'three-per-week'
  | 'weekly-sprint';

export type SnapsContentCalendarFormat =
  | 'text'
  | 'image'
  | 'carousel'
  | 'short-video'
  | 'story';

export type SnapsContentCalendarRequest = {
  sourceText?: unknown;
  title?: unknown;
  campaign?: unknown;
  audience?: unknown;
  tone?: unknown;
  startDate?: unknown;
  days?: unknown;
  postsPerDay?: unknown;
  cadence?: unknown;
  targetPlatforms?: unknown;
  contentPillars?: unknown;
  goals?: unknown;
  formats?: unknown;
  cta?: unknown;
};

export type SnapsContentCalendarItemStatus = 'ready' | 'warning' | 'invalid';

export type SnapsContentCalendarItem = {
  itemIndex: number;
  dayIndex: number;
  publishDate: string;
  localTime: string;
  title: string;
  sourceText: string;
  platform: SnapsTargetPlatform;
  platformLabel: string;
  pillar: string;
  goal: string;
  format: SnapsContentCalendarFormat;
  angle: string;
  hook: string;
  cta: string;
  hashtags: string[];
  warnings: string[];
  status: SnapsContentCalendarItemStatus;
};

export type SnapsContentCalendarPreview = {
  product: 'snaps';
  source: 'snaps-content-calendar';
  title: string;
  campaign: string;
  cadence: SnapsContentCalendarCadence;
  startDate: string;
  days: number;
  postsPerDay: number;
  sampleBrief: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsContentCalendarItem[];
  warnings: string[];
};

type ContentCalendarDefaults = {
  sourceText: string;
  title: string;
  campaign: string;
  audience: string;
  tone?: string;
  cadence: SnapsContentCalendarCadence;
  startDate: Date;
  days: number;
  postsPerDay: number;
  platforms: SnapsTargetPlatform[];
  pillars: string[];
  goals: string[];
  formats: SnapsContentCalendarFormat[];
  cta: string;
};

@Injectable()
export class SnapsContentCalendarService {
  readonly sampleBrief = [
    '캠페인: AI 콘텐츠 운영 30일 챌린지',
    '대상: 콘텐츠를 혼자 운영하는 B2B 마케터',
    '핵심 메시지: 하나의 원문을 플랫폼별 게시물, 쇼츠, 카드뉴스로 재사용한다.',
    '이번 달 목표: 저장, 상담 문의, 데모 신청을 늘린다.',
  ].join('\n');

  preview(body?: SnapsContentCalendarRequest): SnapsContentCalendarPreview {
    const request = body || {};
    const defaults = this.defaultsFor(request);
    const warnings: string[] = [];
    const dates = this.calendarDates(defaults.startDate, defaults.days, defaults.cadence);

    if (!dates.length) {
      warnings.push('Cadence produced no dates, so the start date was used.');
      dates.push(new Date(defaults.startDate));
    }

    const items: SnapsContentCalendarItem[] = [];
    for (const [dateIndex, date] of dates.entries()) {
      for (let slot = 0; slot < defaults.postsPerDay; slot += 1) {
        if (items.length >= 60) {
          warnings.push('Calendar plan was capped at 60 items.');
          break;
        }
        items.push(
          this.buildItem({
            defaults,
            date,
            dateIndex,
            slot,
            itemIndex: items.length + 1,
          })
        );
      }
    }

    return {
      product: 'snaps',
      source: 'snaps-content-calendar',
      title: defaults.title,
      campaign: defaults.campaign,
      cadence: defaults.cadence,
      startDate: defaults.startDate.toISOString(),
      days: defaults.days,
      postsPerDay: defaults.postsPerDay,
      sampleBrief: this.sampleBrief,
      totalItems: items.length,
      acceptedItems: items.filter((item) => item.status !== 'invalid').length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      items,
      warnings,
    };
  }

  toSourceInputs(items: SnapsContentCalendarItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status !== 'invalid')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: item.pillar,
        sourcePlatform: 'content-calendar',
        tags: [
          'content-calendar',
          item.platform,
          item.format,
          item.pillar,
          item.goal,
          ...item.hashtags.map((tag) => tag.replace(/^#/, '')),
        ],
      }));
  }

  toVariants(item: SnapsContentCalendarItem): SnapsVariant[] {
    if (item.status === 'invalid') {
      return [];
    }

    const rule = snapsPlatformRules[item.platform];
    return [
      {
        platform: item.platform,
        label: rule.label,
        title: item.title,
        content: fitSnapsContent(item.platform, this.decorateVariantContent(item, rule.maxLength)),
        hashtags: this.toHashtags(item.hashtags, rule.hashtagLimit),
        settings: {
          source: 'snaps-content-calendar',
          contentCalendarSlot: item.itemIndex,
          format: item.format,
          pillar: item.pillar,
          goal: item.goal,
          subject: item.title,
        },
        publishMode: rule.publishMode,
        notes: [
          `publishDate: ${item.publishDate}`,
          `angle: ${item.angle}`,
          `hook: ${item.hook}`,
          `cta: ${item.cta}`,
        ],
      },
    ];
  }

  private defaultsFor(request: SnapsContentCalendarRequest): ContentCalendarDefaults {
    const sourceText =
      this.cleanSourceText(request.sourceText) ||
      this.cleanSourceText(request.campaign) ||
      this.sampleBrief;
    if (sourceText.length < 5) {
      throw new BadRequestException('sourceText or campaign is required for content calendar planning.');
    }

    const campaign = this.cleanText(request.campaign, 160) || 'snaps content calendar';
    const title =
      this.cleanText(request.title, 160) ||
      `${campaign} · content calendar`;
    const audience =
      this.cleanText(request.audience, 160) ||
      'small brand operators';
    const tone = this.cleanText(request.tone, 240) || undefined;
    const cadence = this.cleanCadence(request.cadence);
    const startDate = this.cleanStartDate(request.startDate);
    const days = this.clampNumber(request.days, 14, 1, 31);
    const postsPerDay = this.clampNumber(request.postsPerDay, 1, 1, 3);
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const pillars = this.cleanList(request.contentPillars, 80, 8, [
      '교육',
      '문제 인식',
      '사례',
      '전환',
    ]);
    const goals = this.cleanList(request.goals, 80, 8, [
      'reach',
      'save',
      'comment',
      'lead',
    ]);
    const formats = this.cleanFormats(request.formats);
    const cta = this.cleanText(request.cta, 180) || '댓글로 필요한 주제를 알려주세요.';

    return {
      sourceText,
      title,
      campaign,
      audience,
      tone,
      cadence,
      startDate,
      days,
      postsPerDay,
      platforms: platforms.length
        ? platforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      pillars,
      goals,
      formats,
      cta,
    };
  }

  private buildItem(input: {
    defaults: ContentCalendarDefaults;
    date: Date;
    dateIndex: number;
    slot: number;
    itemIndex: number;
  }): SnapsContentCalendarItem {
    const { defaults, date, dateIndex, slot, itemIndex } = input;
    const platform = defaults.platforms[(itemIndex - 1) % defaults.platforms.length];
    const rule = snapsPlatformRules[platform];
    const pillar = defaults.pillars[(itemIndex - 1) % defaults.pillars.length];
    const goal = defaults.goals[(dateIndex + slot) % defaults.goals.length];
    const format = defaults.formats[(itemIndex - 1) % defaults.formats.length];
    const angle = this.angleFor(itemIndex, pillar, goal);
    const hook = this.hookFor(platform, angle, defaults.audience);
    const publishDate = this.publishDateFor(date, slot);
    const hashtags = this.toHashtags(
      [defaults.campaign, pillar, goal, format].filter(Boolean),
      rule.hashtagLimit
    );
    const cta = this.ctaFor(goal, defaults.cta);
    const sourceText = this.calendarCopy({
      defaults,
      platform,
      pillar,
      goal,
      format,
      angle,
      hook,
      cta,
    });
    const warnings: string[] = [];

    if (new Date(publishDate).getTime() < Date.now()) {
      warnings.push('publishDate is in the past; scheduling should be reviewed.');
    }
    if (format === 'short-video' && !['instagram', 'youtube', 'tiktok'].includes(platform)) {
      warnings.push('short-video format should be handed to a video-first platform or reviewed manually.');
    }
    if (rule.publishMode === 'assist') {
      warnings.push(`${rule.label} is an assist-only channel and may need manual publishing.`);
    }

    return {
      itemIndex,
      dayIndex: dateIndex + 1,
      publishDate,
      localTime: this.localTimeFor(publishDate),
      title: `${defaults.campaign} · ${pillar} · ${rule.label}`,
      sourceText,
      platform,
      platformLabel: rule.label,
      pillar,
      goal,
      format,
      angle,
      hook,
      cta,
      hashtags,
      warnings,
      status: sourceText.length < 5 ? 'invalid' : warnings.length ? 'warning' : 'ready',
    };
  }

  private calendarDates(
    startDate: Date,
    days: number,
    cadence: SnapsContentCalendarCadence
  ) {
    const dates: Date[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = addSnapsZonedDays(startDate, offset);
      if (this.shouldPostOnDate(date, offset, cadence)) {
        dates.push(date);
      }
    }
    return dates;
  }

  private shouldPostOnDate(
    date: Date,
    offset: number,
    cadence: SnapsContentCalendarCadence
  ) {
    const day = getSnapsZonedParts(date).weekday;
    if (cadence === 'daily') {
      return true;
    }
    if (cadence === 'weekdays') {
      return day !== 0 && day !== 6;
    }
    if (cadence === 'three-per-week') {
      return day === 1 || day === 3 || day === 5;
    }
    return offset < 5;
  }

  private publishDateFor(date: Date, slot: number) {
    return setSnapsZonedTime(date, 9 + slot * 3, slot % 2 === 0 ? 30 : 0).toISOString();
  }

  private localTimeFor(publishDate: string) {
    return formatSnapsZonedTime(new Date(publishDate));
  }

  private angleFor(index: number, pillar: string, goal: string) {
    const angles = [
      `${pillar} 체크리스트`,
      `${pillar}에서 자주 놓치는 문제`,
      `${pillar} 전후 비교`,
      `${pillar} 실행 순서`,
      `${pillar} 고객 질문 답변`,
      `${pillar} 미니 사례`,
    ];
    return `${angles[(index - 1) % angles.length]} · ${goal}`;
  }

  private hookFor(platform: SnapsTargetPlatform, angle: string, audience: string) {
    if (platform === 'linkedin') {
      return `${audience} 팀이 이번 주에 점검할 ${angle}`;
    }
    if (platform === 'instagram' || platform === 'tiktok' || platform === 'youtube') {
      return `첫 3초에 보여줄 것: ${angle}`;
    }
    return `${angle}를 바로 써먹는 방법`;
  }

  private ctaFor(goal: string, fallback: string) {
    if (goal.includes('lead') || goal.includes('demo')) {
      return '상담이나 데모가 필요하면 링크를 확인하세요.';
    }
    if (goal.includes('comment')) {
      return '댓글로 다음에 다룰 질문을 남겨주세요.';
    }
    if (goal.includes('save')) {
      return '나중에 다시 보려면 저장해두세요.';
    }
    return fallback;
  }

  private calendarCopy(input: {
    defaults: ContentCalendarDefaults;
    platform: SnapsTargetPlatform;
    pillar: string;
    goal: string;
    format: SnapsContentCalendarFormat;
    angle: string;
    hook: string;
    cta: string;
  }) {
    const lines = [
      input.hook,
      '',
      `캠페인: ${input.defaults.campaign}`,
      `대상: ${input.defaults.audience}`,
      `콘텐츠 기둥: ${input.pillar}`,
      `목표: ${input.goal}`,
      `형식: ${input.format}`,
      input.defaults.tone ? `톤: ${input.defaults.tone}` : '',
      '',
      '핵심 전개:',
      `1. ${input.angle}를 한 문장으로 문제화합니다.`,
      '2. 원문에서 바로 실행 가능한 포인트를 2-3개만 고릅니다.',
      '3. 플랫폼 문법에 맞게 CTA를 짧게 둡니다.',
      '',
      '원문 근거:',
      input.defaults.sourceText,
      '',
      `CTA: ${input.cta}`,
    ].filter(Boolean);

    return lines.join('\n');
  }

  private decorateSourceText(item: SnapsContentCalendarItem) {
    return [
      item.sourceText,
      '',
      `Calendar slot: ${item.itemIndex}`,
      `Platform: ${item.platformLabel}`,
      `Publish date: ${item.publishDate}`,
      `Pillar: ${item.pillar}`,
      `Goal: ${item.goal}`,
      `Format: ${item.format}`,
    ].join('\n');
  }

  private decorateVariantContent(item: SnapsContentCalendarItem, maxLength: number) {
    const evidenceText = item.sourceText.includes('원문 근거:')
      ? item.sourceText.split('원문 근거:').slice(1).join('원문 근거:')
      : item.sourceText;
    const bodyText = evidenceText.split('CTA:')[0].trim();
    const text = [
      item.hook,
      '',
      bodyText,
      '',
      item.cta,
    ]
      .filter(Boolean)
      .join('\n');
    return text.slice(0, Math.max(0, maxLength));
  }

  private cleanCadence(value: unknown): SnapsContentCalendarCadence {
    return value === 'weekdays' ||
      value === 'three-per-week' ||
      value === 'weekly-sprint'
      ? value
      : 'daily';
  }

  private cleanFormats(value: unknown): SnapsContentCalendarFormat[] {
    const allowed: SnapsContentCalendarFormat[] = [
      'text',
      'image',
      'carousel',
      'short-video',
      'story',
    ];
    const values = this.cleanList(value, 80, 8, ['text', 'carousel', 'short-video'])
      .map((item) => item.toLowerCase())
      .filter((item): item is SnapsContentCalendarFormat =>
        allowed.includes(item as SnapsContentCalendarFormat)
      );
    return values.length ? [...new Set(values)] : ['text'];
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const values = this.toStringList(value, 40)
      .map((item) => item.toLowerCase())
      .filter((item): item is SnapsTargetPlatform =>
        snapsTargetPlatforms.includes(item as SnapsTargetPlatform)
      );
    return [...new Set(values)];
  }

  private cleanList(
    value: unknown,
    maxLength: number,
    maxItems: number,
    fallback: string[]
  ) {
    const cleaned = this.toStringList(value, maxLength).slice(0, maxItems);
    return cleaned.length ? cleaned : fallback;
  }

  private toStringList(value: unknown, maxLength = 120) {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\n,|]+/)
        : [];
    return values
      .map((item) => this.cleanText(item, maxLength))
      .filter(Boolean);
  }

  private cleanStartDate(value: unknown) {
    const raw = this.cleanText(value, 120);
    const parsed = raw ? new Date(raw) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const date = Number.isNaN(parsed.getTime())
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : parsed;
    return raw ? date : setSnapsZonedTime(date, 9, 0);
  }

  private toHashtags(values: string[], limit: number) {
    const tags = values
      .map((tag) => this.cleanText(tag, 40))
      .filter(Boolean)
      .map((tag) => `#${tag.replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '')}`)
      .filter((tag) => tag.length > 1);
    return [...new Set(tags)].slice(0, Math.max(0, limit));
  }

  private cleanSourceText(value: unknown) {
    return cleanSnapsMultilineText(value, 50000);
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

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(numeric)));
  }
}
