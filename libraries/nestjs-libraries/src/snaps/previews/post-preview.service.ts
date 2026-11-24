import { Injectable } from '@nestjs/common';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  buildDefaultSettings,
  snapsPlatformRules,
  snapsTargetPlatforms,
  SnapsTargetPlatform,
  fitSnapsContent,
  snapsContentLength,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsPostPreviewDevice = 'desktop' | 'mobile';

export type SnapsPostPreviewRequest = {
  content?: unknown;
  title?: unknown;
  linkUrl?: unknown;
  linkTitle?: unknown;
  linkDescription?: unknown;
  linkImage?: unknown;
  altText?: unknown;
  imageDescription?: unknown;
  device?: unknown;
  targetPlatforms?: unknown;
  variants?: unknown;
  media?: unknown;
};

export type SnapsPostPreviewLinkCard = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  supported: boolean;
  customizable: boolean;
  missing: string[];
};

export type SnapsPostPreviewMediaCard = {
  type: 'image' | 'video' | 'carousel' | 'unknown';
  url?: string;
  altText?: string;
  altTextSuggestion?: string;
  hasAltText: boolean;
};

export type SnapsPostPreviewCard = {
  platform: SnapsTargetPlatform;
  label: string;
  device: SnapsPostPreviewDevice;
  title: string;
  content: string;
  characterCount: number;
  characterLimit: number;
  feedCutoff: number;
  feedPreview: string;
  expandedPreview: string;
  hiddenCharacters: number;
  hardLimitExceeded: boolean;
  hashtagCount: number;
  mentionCount: number;
  urlCount: number;
  lineCount: number;
  linkPreview: SnapsPostPreviewLinkCard;
  mediaPreview: SnapsPostPreviewMediaCard;
  accessibilityScore: number;
  warnings: string[];
  recommendations: string[];
  variant: SnapsVariant;
};

export type SnapsPostPreviewSummary = {
  product: 'snaps';
  source: 'snaps-post-preview-inspector';
  device: SnapsPostPreviewDevice;
  totalCards: number;
  needsRewrite: number;
  averageAccessibilityScore: number;
  cards: SnapsPostPreviewCard[];
  warnings: string[];
  recommendations: string[];
};

const feedCutoffs: Record<SnapsTargetPlatform, number> = {
  threads: 180,
  bluesky: 300,
  instagram: 125,
  facebook: 200,
  pinterest: 220,
  youtube: 100,
  tiktok: 100,
  xiaohongshu: 180,
  'naver-blog': 260,
  'naver-cafe': 220,
  'kakao-talk': 120,
  linkedin: 140,
  x: 280,
};

const hardLimitPlatforms = new Set<SnapsTargetPlatform>(['x', 'bluesky']);
const linkPreviewPlatforms = new Set<SnapsTargetPlatform>([
  'facebook',
  'linkedin',
  'x',
  'pinterest',
]);

@Injectable()
export class SnapsPostPreviewService {
  preview(body?: SnapsPostPreviewRequest): SnapsPostPreviewSummary {
    const request = body || {};
    const device: SnapsPostPreviewDevice =
      request.device === 'mobile' ? 'mobile' : 'desktop';
    const variants = this.cleanVariants(request.variants);
    const targetPlatforms = this.cleanTargetPlatforms(request.targetPlatforms);
    const content = this.cleanText(request.content, 8000);
    const title = this.cleanText(request.title, 160) || 'snaps preview';
    const media = this.cleanMedia(request.media);
    const baseVariants = variants.length
      ? variants
      : this.defaultVariants(targetPlatforms, content, title);

    const cards = baseVariants
      .slice(0, 40)
      .map((variant) => this.toCard(variant, request, media, device));
    const warnings = cards
      .flatMap((card) => card.warnings.map((warning) => `${card.label}: ${warning}`))
      .slice(0, 30);
    if (!cards.length) {
      warnings.push('Post preview needs generated variants or source content.');
    }
    const needsRewrite = cards.filter(
      (card) => card.hardLimitExceeded || card.warnings.length > 0
    ).length;
    const averageAccessibilityScore = Math.round(
      cards.reduce((total, card) => total + card.accessibilityScore, 0) /
        Math.max(1, cards.length)
    );

    return {
      product: 'snaps',
      source: 'snaps-post-preview-inspector',
      device,
      totalCards: cards.length,
      needsRewrite,
      averageAccessibilityScore,
      cards,
      warnings,
      recommendations: this.summaryRecommendations(cards),
    };
  }

  private toCard(
    variant: SnapsVariant,
    request: SnapsPostPreviewRequest,
    fallbackMedia: SnapsPostPreviewMediaCard,
    device: SnapsPostPreviewDevice
  ): SnapsPostPreviewCard {
    const rule = snapsPlatformRules[variant.platform];
    const content = this.cleanText(variant.content, rule.maxLength + 1600);
    const characterLimit = rule.maxLength;
    const characterCount = snapsContentLength(variant.platform, content);
    const feedCutoff = this.adjustCutoff(variant.platform, device);
    const hiddenCharacters = Math.max(0, characterCount - feedCutoff);
    const hardLimitExceeded = characterCount > characterLimit;
    const hashtags = this.hashtags(content, variant.hashtags);
    const urls = this.urls(content);
    const linkPreview = this.linkPreview(variant.platform, content, request);
    const mediaPreview = this.mediaPreview(
      variant,
      request,
      fallbackMedia,
      content
    );
    const lineCount = content.split(/\r?\n/).filter((line) => line.trim()).length;
    const warnings: string[] = [];

    if (hardLimitExceeded) {
      warnings.push(
        `Character count ${characterCount} exceeds the ${characterLimit} character platform limit${
          variant.platform === 'x' ? ' (X counts Korean characters as 2)' : ''
        }.`
      );
    } else if (hiddenCharacters > 0 && !hardLimitPlatforms.has(variant.platform)) {
      warnings.push(
        `${hiddenCharacters} characters fall after the likely feed "see more" cut.`
      );
    }
    if (linkPreview.supported && linkPreview.missing.length) {
      warnings.push(
        `Link preview is missing ${linkPreview.missing.join(', ')} metadata.`
      );
    }
    if (variant.platform === 'instagram' && urls.length) {
      warnings.push('Instagram captions do not generate clickable link previews.');
    }
    if (mediaPreview.url && !mediaPreview.hasAltText) {
      warnings.push('Media is missing alt text for accessibility.');
    }
    if (hashtags.length > Math.min(10, rule.hashtagLimit)) {
      warnings.push('Hashtag count is high for an in-feed preview.');
    }
    if (lineCount > 8) {
      warnings.push('Caption has many line breaks; confirm the mobile fold.');
    }

    const accessibilityScore = this.accessibilityScore(
      warnings,
      hardLimitExceeded,
      mediaPreview
    );

    return {
      platform: variant.platform,
      label: rule.label,
      device,
      title: variant.title || this.cleanText(request.title, 160) || rule.label,
      content,
      characterCount,
      characterLimit,
      feedCutoff,
      feedPreview: this.feedPreview(content, feedCutoff),
      expandedPreview: content.slice(0, characterLimit),
      hiddenCharacters,
      hardLimitExceeded,
      hashtagCount: hashtags.length,
      mentionCount: (content.match(/(^|\s)@[A-Za-z0-9_.가-힣-]+/g) || []).length,
      urlCount: urls.length,
      lineCount,
      linkPreview,
      mediaPreview,
      accessibilityScore,
      warnings,
      recommendations: this.cardRecommendations(
        variant.platform,
        hiddenCharacters,
        hardLimitExceeded,
        mediaPreview,
        linkPreview
      ),
      variant: {
        ...variant,
        content: content.slice(0, characterLimit),
        settings: {
          ...buildDefaultSettings(variant.platform),
          ...variant.settings,
          source: variant.settings?.source || 'snaps-post-preview-inspector',
          feedCutoff,
          accessibilityScore,
          altText: mediaPreview.altText || mediaPreview.altTextSuggestion,
        },
      },
    };
  }

  private linkPreview(
    platform: SnapsTargetPlatform,
    content: string,
    request: SnapsPostPreviewRequest
  ): SnapsPostPreviewLinkCard {
    const url =
      this.cleanText(request.linkUrl, 2000) || this.urls(content)[0] || undefined;
    const supported = linkPreviewPlatforms.has(platform) && !!url;
    const title = this.cleanText(request.linkTitle, 120);
    const description = this.cleanText(request.linkDescription, 240);
    const image = this.cleanText(request.linkImage, 2000);
    const missing: string[] = [];

    if (supported) {
      if (!title && (platform === 'linkedin' || platform === 'x')) {
        missing.push('title');
      }
      if (!description && platform === 'linkedin') {
        missing.push('description');
      }
      if (!image) {
        missing.push('image');
      }
    }

    return {
      url,
      title: title || this.titleFromUrl(url),
      description,
      image,
      supported,
      customizable: platform === 'facebook' || platform === 'linkedin',
      missing,
    };
  }

  private mediaPreview(
    variant: SnapsVariant,
    request: SnapsPostPreviewRequest,
    fallbackMedia: SnapsPostPreviewMediaCard,
    content: string
  ): SnapsPostPreviewMediaCard {
    const variantMedia = Array.isArray(variant.media) ? variant.media[0] : undefined;
    const url =
      this.cleanText((variantMedia as Record<string, unknown> | undefined)?.path, 2000) ||
      this.cleanText((variantMedia as Record<string, unknown> | undefined)?.url, 2000) ||
      fallbackMedia.url;
    const explicitAlt =
      this.cleanText(request.altText, 320) ||
      this.cleanText((variantMedia as Record<string, unknown> | undefined)?.alt, 320) ||
      fallbackMedia.altText;
    const mediaType = this.mediaType(url || fallbackMedia.url);
    const suggestion =
      explicitAlt ||
      this.cleanText(request.imageDescription, 320) ||
      this.altTextSuggestion(variant, content);

    return {
      type: mediaType,
      url,
      altText: explicitAlt,
      altTextSuggestion: suggestion,
      hasAltText: !!explicitAlt || !url,
    };
  }

  private cleanMedia(value: unknown): SnapsPostPreviewMediaCard {
    if (!value || typeof value !== 'object') {
      return {
        type: 'unknown',
        hasAltText: true,
      };
    }
    const input = Array.isArray(value) ? value[0] : value;
    if (!input || typeof input !== 'object') {
      return {
        type: 'unknown',
        hasAltText: true,
      };
    }
    const record = input as Record<string, unknown>;
    const url =
      this.cleanText(record.url, 2000) ||
      this.cleanText(record.path, 2000) ||
      this.cleanText(record.thumbnail, 2000);
    const altText = this.cleanText(record.altText || record.alt, 320);
    return {
      type: this.mediaType(url),
      url,
      altText,
      hasAltText: !!altText || !url,
    };
  }

  private defaultVariants(
    platforms: SnapsTargetPlatform[],
    content: string,
    title: string
  ): SnapsVariant[] {
    const selected: SnapsTargetPlatform[] = platforms.length
      ? platforms
      : ['instagram', 'linkedin', 'x'];
    const source = content || title;
    return selected.map((platform) => {
      const rule = snapsPlatformRules[platform];
      return {
        platform,
        label: rule.label,
        title,
        content: fitSnapsContent(platform, source),
        hashtags: this.hashtags(source).slice(0, rule.hashtagLimit),
        settings: buildDefaultSettings(platform),
        publishMode: rule.publishMode,
        notes: ['post preview generated from composer text'],
      };
    });
  }

  private cleanVariants(value: unknown): SnapsVariant[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.cleanVariant(item))
      .filter((item): item is SnapsVariant => !!item);
  }

  private cleanVariant(value: unknown): SnapsVariant | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const input = value as Record<string, unknown>;
    const platform = this.cleanPlatform(input.platform);
    if (!platform) {
      return undefined;
    }
    const rule = snapsPlatformRules[platform];
    const content =
      this.cleanText(input.content || input.caption || input.text, rule.maxLength + 1600) ||
      this.cleanText(input.title, 240);
    if (!content) {
      return undefined;
    }
    return {
      platform,
      label: rule.label,
      title: this.cleanText(input.title, 160) || `${rule.label} preview`,
      content,
      hashtags: this.hashtags(content, input.hashtags).slice(0, rule.hashtagLimit),
      media: Array.isArray(input.media) ? (input.media as SnapsVariant['media']) : undefined,
      settings:
        input.settings && typeof input.settings === 'object'
          ? (input.settings as SnapsVariant['settings'])
          : buildDefaultSettings(platform),
      publishMode:
        input.publishMode === 'assist' || input.publishMode === 'schedule'
          ? input.publishMode
          : rule.publishMode,
      notes: Array.isArray(input.notes)
        ? input.notes
            .map((note) => this.cleanText(note, 180))
            .filter(Boolean)
            .slice(0, 6)
        : [],
    };
  }

  private cleanTargetPlatforms(value: unknown): SnapsTargetPlatform[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return [
      ...new Set(
        value
          .map((item) => this.cleanPlatform(item))
          .filter((item): item is SnapsTargetPlatform => !!item)
      ),
    ];
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const text = this.cleanText(value, 80)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
    const aliases: Record<string, SnapsTargetPlatform> = {
      twitter: 'x',
      tweet: 'x',
      x_twitter: 'x',
      linkedin_page: 'linkedin',
      'x-twitter': 'x',
      'linkedin-page': 'linkedin',
      'linked-in': 'linkedin',
      'instagram-reels': 'instagram',
      reels: 'instagram',
      'youtube-shorts': 'youtube',
      shorts: 'youtube',
      naver: 'naver-blog',
      blog: 'naver-blog',
      cafe: 'naver-cafe',
      kakaotalk: 'kakao-talk',
    };
    const platform = aliases[text] || text;
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private adjustCutoff(
    platform: SnapsTargetPlatform,
    device: SnapsPostPreviewDevice
  ) {
    const base = feedCutoffs[platform] || 160;
    if (hardLimitPlatforms.has(platform)) {
      return base;
    }
    return device === 'mobile' ? Math.max(80, Math.round(base * 0.82)) : base;
  }

  private feedPreview(content: string, cutoff: number) {
    if (content.length <= cutoff) {
      return content;
    }
    return `${content.slice(0, Math.max(0, cutoff - 8)).trimEnd()}... 더보기`;
  }

  private accessibilityScore(
    warnings: string[],
    hardLimitExceeded: boolean,
    media: SnapsPostPreviewMediaCard
  ) {
    let score = 100 - warnings.length * 8;
    if (hardLimitExceeded) {
      score -= 20;
    }
    if (media.url && !media.hasAltText) {
      score -= 18;
    }
    return Math.max(0, Math.min(100, score));
  }

  private cardRecommendations(
    platform: SnapsTargetPlatform,
    hiddenCharacters: number,
    hardLimitExceeded: boolean,
    media: SnapsPostPreviewMediaCard,
    link: SnapsPostPreviewLinkCard
  ) {
    const recommendations: string[] = [];
    if (hardLimitExceeded) {
      recommendations.push('Trim the post before queueing this platform.');
    } else if (hiddenCharacters > 0 && !hardLimitPlatforms.has(platform)) {
      recommendations.push('Move the strongest hook before the feed cutoff.');
    }
    if (media.url && !media.hasAltText) {
      recommendations.push(`Use suggested alt text: ${media.altTextSuggestion}`);
    }
    if (link.supported && link.missing.length) {
      recommendations.push(
        'Add link title, description, or image metadata before publishing.'
      );
    }
    if (!recommendations.length) {
      recommendations.push('Preview is ready for approval or scheduling.');
    }
    return recommendations.slice(0, 4);
  }

  private summaryRecommendations(cards: SnapsPostPreviewCard[]) {
    const overLimit = cards.filter((card) => card.hardLimitExceeded).length;
    const missingAlt = cards.filter(
      (card) => card.mediaPreview.url && !card.mediaPreview.hasAltText
    ).length;
    const linkWarnings = cards.filter(
      (card) => card.linkPreview.supported && card.linkPreview.missing.length
    ).length;
    return [
      overLimit
        ? `${overLimit} platform previews exceed hard character limits.`
        : 'No hard platform character limits are exceeded.',
      missingAlt
        ? `${missingAlt} media previews need alt text before approval.`
        : 'Media accessibility checks passed or no media was attached.',
      linkWarnings
        ? `${linkWarnings} link cards need title, description, or image metadata.`
        : 'Link preview metadata is ready where supplied.',
    ];
  }

  private hashtags(content: string, explicit?: unknown): string[] {
    const fromExplicit = Array.isArray(explicit)
      ? explicit
          .map((item) => this.cleanText(item, 80))
          .filter(Boolean)
          .map((item) => (item.startsWith('#') ? item : `#${item}`))
      : [];
    const fromContent = content.match(/#[\p{L}\p{N}_가-힣-]+/gu) || [];
    return [...new Set([...fromExplicit, ...fromContent])];
  }

  private urls(content: string): string[] {
    return [...new Set(content.match(/https?:\/\/[^\s)]+/g) || [])].slice(0, 4);
  }

  private mediaType(url?: string): SnapsPostPreviewMediaCard['type'] {
    if (!url) {
      return 'unknown';
    }
    const lower = url.toLowerCase();
    if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(lower)) {
      return 'video';
    }
    if (/\bcarousel\b/.test(lower)) {
      return 'carousel';
    }
    if (/\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/.test(lower)) {
      return 'image';
    }
    return 'unknown';
  }

  private altTextSuggestion(variant: SnapsVariant, content: string) {
    const topic =
      this.cleanText(variant.title, 80) ||
      this.cleanText(content.split(/[.!?\n]/)[0], 80) ||
      snapsPlatformRules[variant.platform].label;
    const hashtags = this.hashtags(content, variant.hashtags)
      .slice(0, 2)
      .map((tag) => tag.replace(/^#/, ''))
      .join(', ');
    return hashtags
      ? `${topic} 내용을 설명하는 캠페인 이미지. 주요 키워드: ${hashtags}.`
      : `${topic} 내용을 설명하는 캠페인 이미지.`;
  }

  private titleFromUrl(url?: string) {
    if (!url) {
      return '';
    }
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private cleanText(value: unknown, maxLength: number): string {
    if (typeof value === 'string') {
      return value.replace(/\u0000/g, '').trim().slice(0, maxLength);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).slice(0, maxLength);
    }
    return '';
  }
}
