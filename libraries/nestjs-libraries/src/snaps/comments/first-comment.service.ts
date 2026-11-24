import { Injectable } from '@nestjs/common';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  buildDefaultSettings,
  snapsPlatformRules,
  snapsTargetPlatforms,
  SnapsTargetPlatform,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsFirstCommentStrategy =
  | 'hashtags'
  | 'question'
  | 'link'
  | 'context';

export type SnapsFirstCommentRequest = {
  sourceText?: unknown;
  topic?: unknown;
  globalComment?: unknown;
  strategy?: unknown;
  targetPlatforms?: unknown;
  variants?: unknown;
  includeUnsupported?: unknown;
};

export type SnapsFirstCommentItem = {
  platform: SnapsTargetPlatform;
  label: string;
  title: string;
  captionPreview: string;
  firstComment: string;
  strategy: SnapsFirstCommentStrategy;
  supported: boolean;
  characterLimit: number;
  hashtagCount: number;
  warnings: string[];
  variant: SnapsVariant;
};

export type SnapsFirstCommentPreview = {
  product: 'snaps';
  source: 'snaps-first-comment-planner';
  strategy: SnapsFirstCommentStrategy;
  totalItems: number;
  supportedItems: number;
  unsupportedItems: number;
  supportedPlatforms: SnapsTargetPlatform[];
  unsupportedPlatforms: SnapsTargetPlatform[];
  items: SnapsFirstCommentItem[];
  warnings: string[];
  recommendations: string[];
};

const firstCommentSupportedPlatforms: SnapsTargetPlatform[] = [
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
];

const firstCommentLimits: Partial<Record<SnapsTargetPlatform, number>> = {
  instagram: 2196,
  linkedin: 1250,
  tiktok: 2200,
  youtube: 2000,
};

@Injectable()
export class SnapsFirstCommentService {
  preview(body?: SnapsFirstCommentRequest): SnapsFirstCommentPreview {
    const request = body || {};
    const strategy = this.cleanStrategy(request.strategy);
    const globalComment = this.cleanText(request.globalComment, 1800);
    const sourceText = this.cleanText(request.sourceText, 4000);
    const topic = this.cleanText(request.topic, 120) || 'snaps campaign';
    const includeUnsupported = request.includeUnsupported === true;
    const variants = this.cleanVariants(request.variants);
    const targetPlatforms = this.cleanTargetPlatforms(request.targetPlatforms);
    const sourceVariants = variants.length
      ? variants
      : this.defaultVariants(targetPlatforms, sourceText, topic);
    const warnings: string[] = [];

    const items = sourceVariants
      .map((variant) =>
        this.toItem(variant, strategy, globalComment, sourceText, topic)
      )
      .filter((item) => includeUnsupported || item.supported)
      .slice(0, 40);

    if (!items.length) {
      warnings.push(
        'First comment planner needs at least one supported Instagram, LinkedIn, TikTok, or YouTube variant.'
      );
    }
    if (!globalComment && strategy === 'hashtags') {
      warnings.push(
        'No global first comment was supplied, so snaps generated hashtag-focused comments from variant metadata.'
      );
    }

    const supportedPlatforms = [
      ...new Set(
        items.filter((item) => item.supported).map((item) => item.platform)
      ),
    ];
    const unsupportedPlatforms = [
      ...new Set(
        items.filter((item) => !item.supported).map((item) => item.platform)
      ),
    ];

    return {
      product: 'snaps',
      source: 'snaps-first-comment-planner',
      strategy,
      totalItems: items.length,
      supportedItems: items.filter((item) => item.supported).length,
      unsupportedItems: items.filter((item) => !item.supported).length,
      supportedPlatforms,
      unsupportedPlatforms,
      items,
      warnings,
      recommendations: this.recommendations(items, strategy),
    };
  }

  toVariants(preview: SnapsFirstCommentPreview): SnapsVariant[] {
    return preview.items
      .filter((item) => item.supported && item.firstComment)
      .map((item) => ({
        ...item.variant,
        content: item.variant.content,
        hashtags: item.variant.hashtags || [],
        publishMode: item.variant.publishMode === 'assist' ? 'assist' : 'schedule',
        settings: {
          ...item.variant.settings,
          __type: item.variant.settings?.__type || item.platform,
          firstComment: item.firstComment,
          snapsFirstComment: true,
          firstCommentStrategy: item.strategy,
        },
        notes: [
          ...(item.variant.notes || []),
          `First comment queued: ${item.firstComment.slice(0, 140)}`,
        ].slice(0, 5),
      }));
  }

  private toItem(
    variant: SnapsVariant,
    strategy: SnapsFirstCommentStrategy,
    globalComment: string,
    sourceText: string,
    topic: string
  ): SnapsFirstCommentItem {
    const supported = firstCommentSupportedPlatforms.includes(variant.platform);
    const characterLimit = firstCommentLimits[variant.platform] || 1200;
    const firstComment = this.cleanComment(
      globalComment ||
        this.generateComment(variant, strategy, sourceText, topic, characterLimit),
      characterLimit
    );
    const hashtagCount = this.hashtags(firstComment).length;
    const warnings: string[] = [];
    if (!supported) {
      warnings.push(
        `${snapsPlatformRules[variant.platform]?.label || variant.platform} is not a first-comment queue target in snaps.`
      );
    }
    if (hashtagCount > 10) {
      warnings.push('First comment has more than 10 hashtags; reduce tag clutter.');
    }
    if (firstComment.length >= characterLimit) {
      warnings.push('First comment was trimmed to the platform safety limit.');
    }

    return {
      platform: variant.platform,
      label: snapsPlatformRules[variant.platform]?.label || variant.platform,
      title: variant.title || `${topic} first comment`,
      captionPreview: this.cleanText(variant.content, 180),
      firstComment,
      strategy,
      supported,
      characterLimit,
      hashtagCount,
      warnings,
      variant,
    };
  }

  private generateComment(
    variant: SnapsVariant,
    strategy: SnapsFirstCommentStrategy,
    sourceText: string,
    topic: string,
    characterLimit: number
  ) {
    const hashtags = this.uniqueHashtags(variant.hashtags).slice(0, 8);
    const link = this.extractUrl(sourceText || variant.content);
    const context = this.extractContext(sourceText || variant.content || topic);

    if (strategy === 'link' && link) {
      return `자료 링크와 예시는 여기에서 확인하세요: ${link}\n\n궁금한 적용 상황은 댓글로 남겨주세요.`;
    }
    if (strategy === 'question') {
      return `이 주제에서 지금 가장 막히는 부분은 무엇인가요?\n\n1) 소재 찾기\n2) 채널별 변환\n3) 꾸준한 예약\n\n번호로 댓글 남겨주시면 다음 콘텐츠에 반영하겠습니다.`;
    }
    if (strategy === 'context') {
      return `${context}\n\n본문에 다 담지 못한 적용 질문은 댓글로 남겨주세요.`;
    }

    const tagLine = hashtags.length
      ? hashtags.join(' ')
      : '#콘텐츠마케팅 #SNS운영 #AI마케팅';
    const comment =
      variant.platform === 'instagram'
        ? `${tagLine}\n\n저장해두고 이번 주 게시 전 체크리스트로 써보세요.`
        : `${tagLine}\n\n필요한 자료나 예시가 있으면 댓글로 남겨주세요.`;

    return comment.slice(0, characterLimit);
  }

  private recommendations(
    items: SnapsFirstCommentItem[],
    strategy: SnapsFirstCommentStrategy
  ) {
    const supportedCount = items.filter((item) => item.supported).length;
    const warningCount = items.reduce(
      (total, item) => total + item.warnings.length,
      0
    );
    return [
      `${supportedCount} first-comment items can be attached to connected schedule queues.`,
      strategy === 'hashtags'
        ? 'Keep discovery hashtags in the first comment when the caption should stay clean.'
        : 'Use the first comment for a focused link, question, or extra context instead of overloading the caption.',
      warningCount
        ? `${warningCount} warning(s) need review before connected scheduling.`
        : 'No first-comment warnings were detected.',
    ];
  }

  private defaultVariants(
    targetPlatforms: SnapsTargetPlatform[],
    sourceText: string,
    topic: string
  ): SnapsVariant[] {
    const content =
      sourceText ||
      `${topic} 캠페인 본문입니다. 저장할 만한 핵심 포인트와 댓글 CTA를 함께 운영합니다.`;
    return targetPlatforms.map((platform) => ({
      platform,
      label: snapsPlatformRules[platform]?.label || platform,
      title: topic,
      content,
      hashtags: snapsPlatformRules[platform]?.defaultHashtags || [],
      settings: buildDefaultSettings(platform),
      publishMode: snapsPlatformRules[platform]?.publishMode || 'schedule',
      notes: [],
    }));
  }

  private cleanVariants(value: unknown): SnapsVariant[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.cleanVariant(item))
      .filter((item): item is SnapsVariant => !!item)
      .slice(0, 40);
  }

  private cleanVariant(value: unknown): SnapsVariant | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const platform = this.cleanPlatform(record.platform);
    if (!platform) {
      return undefined;
    }
    const content = this.cleanText(record.content, 5000);
    if (!content) {
      return undefined;
    }
    return {
      platform,
      label:
        this.cleanText(record.label, 80) ||
        snapsPlatformRules[platform]?.label ||
        platform,
      title: this.cleanText(record.title, 140) || undefined,
      content,
      hashtags: this.cleanStringArray(record.hashtags, 60, 20),
      media: Array.isArray(record.media)
        ? (record.media as SnapsVariant['media'])
        : undefined,
      settings:
        record.settings && typeof record.settings === 'object'
          ? (record.settings as Record<string, unknown>)
          : buildDefaultSettings(platform),
      publishMode:
        record.publishMode === 'assist'
          ? 'assist'
          : snapsPlatformRules[platform]?.publishMode || 'schedule',
      notes: this.cleanStringArray(record.notes, 200, 5),
    };
  }

  private cleanTargetPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value) ? value : firstCommentSupportedPlatforms;
    const platforms = raw
      .map((item) => this.cleanPlatform(item))
      .filter((item): item is SnapsTargetPlatform => !!item);
    return platforms.length ? [...new Set(platforms)] : ['instagram', 'linkedin'];
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = String(value || '').trim().toLowerCase();
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanStrategy(value: unknown): SnapsFirstCommentStrategy {
    const strategy = String(value || '').trim().toLowerCase();
    return ['hashtags', 'question', 'link', 'context'].includes(strategy)
      ? (strategy as SnapsFirstCommentStrategy)
      : 'hashtags';
  }

  private cleanComment(value: string, maxLength: number) {
    return this.cleanText(value, maxLength)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private cleanText(value: unknown, maxLength: number) {
    return String(value || '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private cleanStringArray(value: unknown, maxLength: number, maxItems: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n| ]+/)
        : [];
    return raw
      .map((item) => this.cleanText(item, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  private hashtags(value: string) {
    return value.match(/#[\p{L}\p{N}_-]+/gu) || [];
  }

  private uniqueHashtags(value: unknown) {
    return [
      ...new Set(
        this.cleanStringArray(value, 60, 20)
          .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
          .filter((tag) => tag.length > 1)
      ),
    ];
  }

  private extractUrl(value: string) {
    return value.match(/https?:\/\/[^\s)]+/i)?.[0] || '';
  }

  private extractContext(value: string) {
    const sentence =
      value
        .split(/[.!?\n。！？]/)
        .map((item) => item.trim())
        .find((item) => item.length >= 30) ||
      '추가 자료는 댓글에서 이어가면 본문은 더 가볍고 저장하기 쉬워집니다.';
    return sentence.slice(0, 220);
  }
}
