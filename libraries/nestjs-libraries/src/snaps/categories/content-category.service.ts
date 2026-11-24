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
  setSnapsZonedTime,
} from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';

export type SnapsContentCategoryShareMode = 'evergreen' | 'share-once';
export type SnapsContentCategoryInsertMode = 'top' | 'bottom';

export type SnapsContentCategoryRequest = {
  sourceText?: unknown;
  title?: unknown;
  campaign?: unknown;
  categories?: unknown;
  categorySequence?: unknown;
  targetPlatforms?: unknown;
  startDate?: unknown;
  days?: unknown;
  postsPerDay?: unknown;
  cta?: unknown;
  tone?: unknown;
  linkUrl?: unknown;
  utmCampaign?: unknown;
};

export type SnapsContentCategoryStatus = 'ready' | 'warning' | 'invalid';

export type SnapsContentCategoryDefinition = {
  categoryIndex: number;
  name: string;
  description: string;
  color: string;
  shareMode: SnapsContentCategoryShareMode;
  insertMode: SnapsContentCategoryInsertMode;
  randomize: boolean;
  weight: number;
  warnings: string[];
  status: SnapsContentCategoryStatus;
};

export type SnapsContentCategoryQueueItem = {
  itemIndex: number;
  queueOrder: number;
  categoryName: string;
  categoryColor: string;
  shareMode: SnapsContentCategoryShareMode;
  insertMode: SnapsContentCategoryInsertMode;
  platform: SnapsTargetPlatform;
  platformLabel: string;
  publishDate: string;
  localTime: string;
  title: string;
  sourceText: string;
  angle: string;
  cta: string;
  linkUrl?: string;
  utmCampaign?: string;
  hashtags: string[];
  warnings: string[];
  status: SnapsContentCategoryStatus;
};

export type SnapsContentCategoryPreview = {
  product: 'snaps';
  source: 'snaps-content-categories';
  title: string;
  campaign: string;
  startDate: string;
  days: number;
  postsPerDay: number;
  sampleCategories: string;
  categories: SnapsContentCategoryDefinition[];
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  categoryMix: Array<{
    name: string;
    count: number;
    shareMode: SnapsContentCategoryShareMode;
    color: string;
  }>;
  items: SnapsContentCategoryQueueItem[];
  warnings: string[];
};

type CategoryDefaults = {
  sourceText: string;
  title: string;
  campaign: string;
  categories: SnapsContentCategoryDefinition[];
  sequence: string[];
  platforms: SnapsTargetPlatform[];
  startDate: Date;
  days: number;
  postsPerDay: number;
  cta: string;
  tone?: string;
  linkUrl?: string;
  utmCampaign?: string;
};

@Injectable()
export class SnapsContentCategoryService {
  readonly sampleCategories = [
    '교육|evergreen|#12b8b8|저장형 체크리스트와 튜토리얼|2',
    '사례|share-once|#f6c85f|고객 사례와 전후 비교|1',
    '프로모션|share-once|#ef6f6c|상담 신청과 데모 CTA|1',
    '커뮤니티|evergreen|#7dd3fc|댓글 질문과 대화 소재|1',
  ].join('\n');

  preview(body?: SnapsContentCategoryRequest): SnapsContentCategoryPreview {
    const request = body || {};
    const defaults = this.defaultsFor(request);
    const warnings: string[] = [];
    const dates = this.calendarDates(defaults.startDate, defaults.days);
    if (!dates.length) {
      dates.push(new Date(defaults.startDate));
      warnings.push('No queue dates were produced, so the start date was used.');
    }

    const items: SnapsContentCategoryQueueItem[] = [];
    for (const [dateIndex, date] of dates.entries()) {
      for (let slot = 0; slot < defaults.postsPerDay; slot += 1) {
        if (items.length >= 90) {
          warnings.push('Category queue was capped at 90 items.');
          break;
        }
        items.push(
          this.buildItem({
            defaults,
            itemIndex: items.length + 1,
            date,
            dateIndex,
            slot,
          })
        );
      }
    }

    const accepted = items.filter((item) => item.status !== 'invalid');
    return {
      product: 'snaps',
      source: 'snaps-content-categories',
      title: defaults.title,
      campaign: defaults.campaign,
      startDate: defaults.startDate.toISOString(),
      days: defaults.days,
      postsPerDay: defaults.postsPerDay,
      sampleCategories: this.sampleCategories,
      categories: defaults.categories,
      totalItems: items.length,
      acceptedItems: accepted.length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      categoryMix: defaults.categories.map((category) => ({
        name: category.name,
        count: items.filter((item) => item.categoryName === category.name).length,
        shareMode: category.shareMode,
        color: category.color,
      })),
      items,
      warnings,
    };
  }

  toSourceInputs(items: SnapsContentCategoryQueueItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status !== 'invalid')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: item.categoryName,
        sourcePlatform: 'content-categories',
        tags: [
          'content-categories',
          item.categoryName,
          item.platform,
          item.shareMode,
          ...item.hashtags.map((tag) => tag.replace(/^#/, '')),
        ],
      }));
  }

  toVariants(item: SnapsContentCategoryQueueItem): SnapsVariant[] {
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
          source: 'snaps-content-categories',
          category: item.categoryName,
          categoryColor: item.categoryColor,
          shareMode: item.shareMode,
          insertMode: item.insertMode,
          queueOrder: item.queueOrder,
          linkUrl: item.linkUrl,
          utmCampaign: item.utmCampaign,
          subject: item.title,
        },
        publishMode: rule.publishMode,
        notes: [
          `category: ${item.categoryName}`,
          `shareMode: ${item.shareMode}`,
          `publishDate: ${item.publishDate}`,
          `angle: ${item.angle}`,
        ],
      },
    ];
  }

  private defaultsFor(request: SnapsContentCategoryRequest): CategoryDefaults {
    const sourceText =
      this.cleanSourceText(request.sourceText) ||
      this.cleanSourceText(request.campaign) ||
      '하나의 원문을 교육, 사례, 프로모션, 커뮤니티 카테고리로 나눠 운영합니다.';
    if (sourceText.length < 5) {
      throw new BadRequestException('sourceText or campaign is required for content categories.');
    }

    const campaign = this.cleanText(request.campaign, 160) || 'snaps category queue';
    const title =
      this.cleanText(request.title, 160) ||
      `${campaign} · category queue`;
    const categories = this.cleanCategories(request.categories);
    const sequence = this.cleanSequence(request.categorySequence, categories);
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const startDate = this.cleanStartDate(request.startDate);
    const days = this.clampNumber(request.days, 14, 1, 31);
    const postsPerDay = this.clampNumber(request.postsPerDay, 1, 1, 4);
    const cta = this.cleanText(request.cta, 180) || '댓글로 필요한 카테고리를 알려주세요.';
    const tone = this.cleanText(request.tone, 240) || undefined;
    const linkUrl = this.cleanUrl(request.linkUrl);
    const utmCampaign = this.slugify(this.cleanText(request.utmCampaign, 120) || campaign);

    return {
      sourceText,
      title,
      campaign,
      categories,
      sequence,
      platforms: platforms.length
        ? platforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      startDate,
      days,
      postsPerDay,
      cta,
      tone,
      linkUrl,
      utmCampaign,
    };
  }

  private buildItem(input: {
    defaults: CategoryDefaults;
    itemIndex: number;
    date: Date;
    dateIndex: number;
    slot: number;
  }): SnapsContentCategoryQueueItem {
    const { defaults, itemIndex, date, dateIndex, slot } = input;
    const sequenceName = defaults.sequence[(itemIndex - 1) % defaults.sequence.length];
    const category =
      defaults.categories.find((entry) => entry.name === sequenceName) ||
      defaults.categories[(itemIndex - 1) % defaults.categories.length];
    const platform = defaults.platforms[(itemIndex - 1) % defaults.platforms.length];
    const publishDate = setSnapsZonedTime(date, 9 + slot * 3, slot % 2 ? 30 : 0);

    const sourceText = this.buildCategorySource(defaults, category, itemIndex);
    const warnings = [...category.warnings];
    if (publishDate.getTime() < Date.now()) {
      warnings.push('publishDate is in the past; queue can be imported but scheduling should be reviewed.');
    }
    if (!snapsPlatformRules[platform]) {
      warnings.push('Unsupported platform for category queue item.');
    }

    const status: SnapsContentCategoryStatus =
      category.status === 'invalid' || !snapsPlatformRules[platform]
        ? 'invalid'
        : warnings.length
          ? 'warning'
          : 'ready';

    const angle = this.categoryAngle(category, defaults.campaign, itemIndex);
    return {
      itemIndex,
      queueOrder:
        category.insertMode === 'top'
          ? itemIndex
          : defaults.categories.length * 100 + itemIndex,
      categoryName: category.name,
      categoryColor: category.color,
      shareMode: category.shareMode,
      insertMode: category.insertMode,
      platform,
      platformLabel: snapsPlatformRules[platform].label,
      publishDate: publishDate.toISOString(),
      localTime: publishDate.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      title: `${defaults.campaign} · ${category.name} ${dateIndex + 1}-${slot + 1}`,
      sourceText,
      angle,
      cta: defaults.cta,
      linkUrl: defaults.linkUrl,
      utmCampaign: defaults.utmCampaign,
      hashtags: this.toHashtags([category.name, defaults.campaign, platform], 5),
      warnings,
      status,
    };
  }

  private cleanCategories(value: unknown): SnapsContentCategoryDefinition[] {
    const lines = this.cleanList(value, 400, 12, this.sampleCategories.split('\n'));
    const categories = lines
      .map((line, index) => this.parseCategoryLine(line, index + 1))
      .filter((category): category is SnapsContentCategoryDefinition => !!category);

    return categories.length
      ? categories
      : this.sampleCategories
          .split('\n')
          .map((line, index) => this.parseCategoryLine(line, index + 1))
          .filter((category): category is SnapsContentCategoryDefinition => !!category);
  }

  private parseCategoryLine(
    line: string,
    categoryIndex: number
  ): SnapsContentCategoryDefinition | undefined {
    const parts = line
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const name = this.cleanText(parts[0], 80);
    if (!name) {
      return undefined;
    }

    const modeToken = (parts[1] || '').toLowerCase();
    const shareMode: SnapsContentCategoryShareMode =
      modeToken.includes('once') || modeToken.includes('draft')
        ? 'share-once'
        : 'evergreen';
    const color = this.cleanColor(parts[2], this.defaultColor(categoryIndex));
    const description =
      this.cleanText(parts[3], 240) ||
      `${name} category posts`;
    const weight = this.clampNumber(parts[4], 1, 1, 6);
    const insertMode: SnapsContentCategoryInsertMode = /top|first|front/i.test(line)
      ? 'top'
      : 'bottom';
    const randomize = /random|shuffle|랜덤/i.test(line);
    const warnings: string[] = [];
    if (name.length < 2) {
      warnings.push('Category name should be at least 2 characters.');
    }

    return {
      categoryIndex,
      name,
      description,
      color,
      shareMode,
      insertMode,
      randomize,
      weight,
      warnings,
      status: warnings.length ? 'warning' : 'ready',
    };
  }

  private cleanSequence(
    value: unknown,
    categories: SnapsContentCategoryDefinition[]
  ) {
    const names = categories.flatMap((category) =>
      Array.from({ length: category.weight }, () => category.name)
    );
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\r?\n|[,;]/)
        : [];
    const requested = raw
      .map((entry) => this.cleanText(entry, 80))
      .filter(Boolean)
      .slice(0, 40);
    const byName = new Map(categories.map((category) => [category.name.toLowerCase(), category.name]));
    const sequence = requested
      .map((entry) => byName.get(entry.toLowerCase()))
      .filter((entry): entry is string => !!entry);
    return sequence.length ? sequence : names;
  }

  private calendarDates(startDate: Date, days: number) {
    return Array.from({ length: days }, (_value, index) =>
      addSnapsZonedDays(startDate, index)
    );
  }

  private buildCategorySource(
    defaults: CategoryDefaults,
    category: SnapsContentCategoryDefinition,
    itemIndex: number
  ) {
    return [
      defaults.sourceText,
      '',
      `Category: ${category.name}`,
      `Category brief: ${category.description}`,
      `Mix role: ${category.shareMode === 'evergreen' ? 'repeatable evergreen post' : 'share-once campaign post'}`,
      defaults.tone ? `Tone: ${defaults.tone}` : '',
      defaults.linkUrl
        ? `Link: ${this.withUtm(defaults.linkUrl, defaults.utmCampaign || defaults.campaign, category.name)}`
        : '',
      `Queue item: ${itemIndex}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private categoryAngle(
    category: SnapsContentCategoryDefinition,
    campaign: string,
    itemIndex: number
  ) {
    const templates = [
      `${campaign}에서 ${category.name} 관점으로 바로 저장할 핵심을 정리`,
      `${category.name} 카테고리의 반복 가능한 한 문장 훅`,
      `${category.description}을 짧은 실행 체크리스트로 전환`,
      `${category.name} 포스트를 댓글/상담 CTA로 연결`,
    ];
    return templates[(itemIndex - 1) % templates.length];
  }

  private decorateSourceText(item: SnapsContentCategoryQueueItem) {
    return [
      item.sourceText,
      '',
      `Category: ${item.categoryName}`,
      `Share mode: ${item.shareMode}`,
      `Queue order: ${item.queueOrder}`,
      `Publish date: ${item.publishDate}`,
      item.linkUrl ? `Link: ${this.withUtm(item.linkUrl, item.utmCampaign || 'snaps', item.categoryName)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private decorateVariantContent(item: SnapsContentCategoryQueueItem, maxLength: number) {
    const link = item.linkUrl
      ? `\n\n${this.withUtm(item.linkUrl, item.utmCampaign || 'snaps', item.categoryName)}`
      : '';
    const tags = item.hashtags.length ? `\n\n${item.hashtags.join(' ')}` : '';
    const content = [
      item.angle,
      '',
      item.sourceText,
      '',
      item.cta,
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    return this.truncate(`${content}${link}${tags}`.trim(), maxLength);
  }

  private withUtm(url: string, campaign: string, category: string) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('utm_source', 'snaps');
      parsed.searchParams.set('utm_medium', 'social');
      parsed.searchParams.set('utm_campaign', this.slugify(campaign));
      parsed.searchParams.set('utm_content', this.slugify(category));
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private cleanPlatforms(value: unknown) {
    const raw = this.cleanList(value, 80, 20, []);
    return raw.filter((entry): entry is SnapsTargetPlatform =>
      snapsTargetPlatforms.includes(entry as SnapsTargetPlatform)
    );
  }

  private cleanList(
    value: unknown,
    maxLength: number,
    limit: number,
    fallback: string[]
  ) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\r?\n|[,;]/)
        : fallback;
    const items = raw
      .map((entry) => this.cleanText(entry, maxLength))
      .filter(Boolean);
    return [...new Set(items)].slice(0, limit);
  }

  private toHashtags(values: unknown, limit = 5) {
    return this.cleanList(values, 40, limit, [])
      .map((tag) => `#${tag.replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '')}`)
      .filter((tag) => tag.length > 1)
      .slice(0, limit);
  }

  private cleanStartDate(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return setSnapsZonedTime(addSnapsZonedDays(new Date(), 1), 9, 0);
  }

  private cleanSourceText(value: unknown) {
    return cleanSnapsMultilineText(value, 50000);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private cleanUrl(value: unknown) {
    const url = this.cleanText(value, 2000);
    if (!url) {
      return undefined;
    }
    try {
      const parsed = new URL(url);
      return parsed.toString();
    } catch {
      return undefined;
    }
  }

  private cleanColor(value: unknown, fallback: string) {
    const color = this.cleanText(value, 16);
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  private defaultColor(index: number) {
    return ['#12b8b8', '#f6c85f', '#ef6f6c', '#7dd3fc', '#a78bfa'][
      (index - 1) % 5
    ];
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(parsed)));
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return slug || 'snaps';
  }

  private truncate(value: string, maxLength: number) {
    if (!maxLength || value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
}
