import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsEvergreenCadence = 'weekly' | 'biweekly' | 'monthly';

export type SnapsEvergreenRecycleRequest = {
  sourceText?: unknown;
  title?: unknown;
  topic?: unknown;
  tone?: unknown;
  category?: unknown;
  cadence?: unknown;
  repeatCount?: unknown;
  startDate?: unknown;
  topPostUrl?: unknown;
  targetPlatforms?: unknown;
  tags?: unknown;
  performanceNote?: unknown;
};

export type SnapsEvergreenRecycleItemStatus = 'ready' | 'warning' | 'invalid';

export type SnapsEvergreenRecycleItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  angle: string;
  category: string;
  cadence: SnapsEvergreenCadence;
  publishDate?: string;
  topPostUrl?: string;
  topic?: string;
  tone?: string;
  platforms: SnapsTargetPlatform[];
  tags: string[];
  warnings: string[];
  status: SnapsEvergreenRecycleItemStatus;
};

export type SnapsEvergreenRecyclePreview = {
  product: 'snaps';
  source: 'snaps-evergreen-recycle';
  title: string;
  category: string;
  cadence: SnapsEvergreenCadence;
  repeatCount: number;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsEvergreenRecycleItem[];
  warnings: string[];
};

type EvergreenDefaults = {
  title: string;
  topic?: string;
  tone?: string;
  category: string;
  cadence: SnapsEvergreenCadence;
  repeatCount: number;
  startDate?: string;
  topPostUrl?: string;
  platforms: SnapsTargetPlatform[];
  tags: string[];
  performanceNote?: string;
};

@Injectable()
export class SnapsEvergreenRecycleService {
  readonly sampleSource = [
    'AI 콘텐츠 운영 체크리스트',
    '성과가 좋았던 게시물은 한 번 쓰고 끝내지 말고 다른 각도로 재활용합니다.',
    '1. 문제 인식형: 왜 이 체크리스트가 필요한지 보여줍니다.',
    '2. 실행 방법형: 바로 따라 할 순서를 정리합니다.',
    '3. 증거형: 지난 성과나 고객 반응을 붙입니다.',
  ].join('\n');

  preview(body?: SnapsEvergreenRecycleRequest): SnapsEvergreenRecyclePreview {
    const request = body || {};
    const sourceText = this.cleanSourceText(request.sourceText);
    if (sourceText.length < 10) {
      throw new BadRequestException('sourceText is required for evergreen recycling.');
    }

    const defaults = this.defaultsFor(request, sourceText);
    const points = this.extractPoints(sourceText, defaults.repeatCount);
    const warnings: string[] = [];
    if (points.length < defaults.repeatCount) {
      warnings.push('Source text had fewer distinct points than requested recycle items.');
    }

    const seed = points.length ? points : [sourceText.slice(0, 180)];
    const items = Array.from({ length: defaults.repeatCount }, (_, index) =>
      this.buildItem({
        defaults,
        itemIndex: index + 1,
        point: seed[index % seed.length],
        sourceText,
      })
    );

    return {
      product: 'snaps',
      source: 'snaps-evergreen-recycle',
      title: defaults.title,
      category: defaults.category,
      cadence: defaults.cadence,
      repeatCount: defaults.repeatCount,
      sampleSource: this.sampleSource,
      totalItems: items.length,
      acceptedItems: items.filter((item) => item.status !== 'invalid').length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      items,
      warnings,
    };
  }

  toSourceInputs(items: SnapsEvergreenRecycleItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status !== 'invalid')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: item.topic || item.category,
        tone: item.tone,
        sourcePlatform: 'evergreen-recycle',
        tags: [
          'evergreen-recycle',
          item.cadence,
          item.category,
          ...item.platforms,
          ...item.tags,
        ],
      }));
  }

  toVariants(item: SnapsEvergreenRecycleItem): SnapsVariant[] {
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
        hashtags: this.toHashtags([item.category, ...item.tags], rule.hashtagLimit),
        settings: {
          source: 'snaps-evergreen-recycle',
          subject: item.title,
          category: item.category,
          cadence: item.cadence,
          recycleIndex: item.itemIndex,
          topPostUrl: item.topPostUrl,
        },
        publishMode: rule.publishMode,
        notes: [
          `angle: ${item.angle}`,
          `cadence: ${item.cadence}`,
          item.publishDate ? `publishDate: ${item.publishDate}` : '',
          item.topPostUrl ? `topPost: ${item.topPostUrl}` : '',
        ].filter(Boolean),
      };
    });
  }

  private defaultsFor(
    request: SnapsEvergreenRecycleRequest,
    sourceText: string
  ): EvergreenDefaults {
    const title =
      this.cleanText(request.title, 160) ||
      this.firstLine(sourceText).slice(0, 90) ||
      'Evergreen recycle';
    const topic = this.cleanText(request.topic, 240) || undefined;
    const tone = this.cleanText(request.tone, 240) || undefined;
    const category = this.cleanText(request.category, 80) || topic || 'evergreen';
    const cadence = this.cleanCadence(request.cadence);
    const repeatCount = this.clampNumber(request.repeatCount, 4, 2, 12);
    const startDate = this.cleanDate(request.startDate);
    const topPostUrl = this.cleanOptionalUrl(request.topPostUrl) || undefined;
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const tags = this.cleanTags(request.tags);
    const performanceNote = this.cleanText(request.performanceNote, 500) || undefined;

    return {
      title,
      topic,
      tone,
      category,
      cadence,
      repeatCount,
      startDate,
      topPostUrl,
      platforms: platforms.length
        ? platforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      tags,
      performanceNote,
    };
  }

  private buildItem(input: {
    defaults: EvergreenDefaults;
    itemIndex: number;
    point: string;
    sourceText: string;
  }): SnapsEvergreenRecycleItem {
    const angle = this.angleFor(input.itemIndex);
    const publishDate = this.publishDateFor(
      input.defaults.startDate,
      input.defaults.cadence,
      input.itemIndex
    );
    const sourceText = this.recycleCopy(
      input.defaults.title,
      input.point,
      angle,
      input.defaults.performanceNote
    );
    const warnings: string[] = [];

    if (!input.defaults.platforms.length) {
      warnings.push('No supported snaps platforms were selected.');
    }
    if (publishDate) {
      const parsed = new Date(publishDate);
      if (Number.isNaN(parsed.getTime())) {
        warnings.push('publishDate is not a valid date.');
      } else if (parsed.getTime() < Date.now()) {
        warnings.push('publishDate is in the past; scheduling should be reviewed.');
      }
    }

    const status: SnapsEvergreenRecycleItemStatus =
      sourceText.length < 10 || !input.defaults.platforms.length
        ? 'invalid'
        : warnings.length
          ? 'warning'
          : 'ready';

    return {
      itemIndex: input.itemIndex,
      title: `${input.defaults.title} · ${angle}`,
      sourceText,
      angle,
      category: input.defaults.category,
      cadence: input.defaults.cadence,
      publishDate,
      topPostUrl: input.defaults.topPostUrl,
      topic: input.defaults.topic,
      tone: input.defaults.tone,
      platforms: input.defaults.platforms,
      tags: ['evergreen', input.defaults.category, ...input.defaults.tags],
      warnings,
      status,
    };
  }

  private recycleCopy(
    title: string,
    point: string,
    angle: string,
    performanceNote?: string
  ) {
    const angleOpeners: Record<string, string> = {
      '문제 재조명': '처음 반응이 좋았던 이유를 문제 중심으로 다시 꺼냅니다.',
      '실행 체크리스트': '이번에는 바로 실행할 수 있는 순서로 정리합니다.',
      '증거/성과': '성과나 반응을 붙여 신뢰도를 높입니다.',
      '반대 관점': '같은 메시지를 반대 관점에서 다시 보여줍니다.',
      'FAQ 답변': '댓글에서 나올 질문에 먼저 답합니다.',
      '짧은 CTA': '핵심 메시지를 압축해 상담이나 저장 행동으로 연결합니다.',
    };

    return [
      `${title}을 재활용합니다.`,
      angleOpeners[angle] || `${angle} 각도로 다시 씁니다.`,
      '',
      point,
      performanceNote ? `성과 근거: ${performanceNote}` : '',
      '',
      '이 내용이 여전히 필요하다면 저장해두고 다음 실행에 써보세요.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private decorateSourceText(item: SnapsEvergreenRecycleItem) {
    return [
      item.sourceText,
      `Recycle angle: ${item.angle}`,
      `Category: ${item.category}`,
      `Cadence: ${item.cadence}`,
      item.publishDate ? `Publish date: ${item.publishDate}` : '',
      item.topPostUrl ? `Top post: ${item.topPostUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private decorateVariantContent(item: SnapsEvergreenRecycleItem, maxLength: number) {
    return [
      item.sourceText,
      item.topPostUrl ? item.topPostUrl : '',
    ].filter(Boolean).join('\n\n').slice(0, maxLength);
  }

  private extractPoints(sourceText: string, limit: number) {
    const lines = sourceText
      .replace(/\r/g, '\n')
      .split(/\n+|[.!?。！？]\s+/g)
      .map((line) =>
        line
          .replace(/^\s*[-*•\d.)]+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((line) => line.length >= 8);
    return [...new Set(lines)].slice(0, Math.max(1, limit));
  }

  private publishDateFor(
    startDate: string | undefined,
    cadence: SnapsEvergreenCadence,
    itemIndex: number
  ) {
    if (!startDate) {
      return undefined;
    }
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    const gapDays = cadence === 'monthly' ? 30 : cadence === 'biweekly' ? 14 : 7;
    date.setDate(date.getDate() + gapDays * (itemIndex - 1));
    return date.toISOString();
  }

  private angleFor(index: number) {
    const angles = [
      '문제 재조명',
      '실행 체크리스트',
      '증거/성과',
      '반대 관점',
      'FAQ 답변',
      '짧은 CTA',
    ];
    return angles[(index - 1) % angles.length];
  }

  private cleanCadence(value: unknown): SnapsEvergreenCadence {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    if (normalized === 'monthly' || normalized === 'month') {
      return 'monthly';
    }
    if (normalized === 'biweekly' || normalized === 'bi-weekly' || normalized === '2-week') {
      return 'biweekly';
    }
    return 'weekly';
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

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 120);
    if (!text) {
      return undefined;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private cleanOptionalUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return '';
    }
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  private firstLine(sourceText: string) {
    return sourceText.split(/\n+/).map((line) => line.trim()).find(Boolean) || '';
  }

  private cleanSourceText(value: unknown, maxLength = 50000) {
    return typeof value === 'string'
      ? value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength)
      : '';
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    }
    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }
}
