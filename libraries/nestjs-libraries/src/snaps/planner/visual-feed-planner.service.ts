import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  buildDefaultSettings,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsVisualFeedPlannerStatus =
  | 'draft'
  | 'scheduled'
  | 'published';

export type SnapsVisualFeedPlannerViewMode = 'square' | 'vertical';

export type SnapsVisualFeedPlannerRequest = {
  platform?: unknown;
  viewMode?: unknown;
  includeDrafts?: unknown;
  includePublished?: unknown;
  items?: unknown;
  variants?: unknown;
  targetPlatforms?: unknown;
};

export type SnapsVisualFeedPlannerItem = {
  id: string;
  order: number;
  title: string;
  caption: string;
  imageUrl: string;
  thumbnail: string;
  mediaType: 'image' | 'video' | 'carousel' | 'document' | 'unknown';
  status: SnapsVisualFeedPlannerStatus;
  publishDate?: string;
  source?: string;
  alt?: string;
  row: number;
  column: number;
  opacity: number;
  warnings: string[];
};

export type SnapsVisualFeedPlannerPreview = {
  product: 'snaps';
  source: 'snaps-visual-feed-planner';
  platform: SnapsTargetPlatform;
  platformLabel: string;
  viewMode: SnapsVisualFeedPlannerViewMode;
  columns: 3;
  totalItems: number;
  draftItems: number;
  scheduledItems: number;
  publishedItems: number;
  rows: number;
  aestheticScore: number;
  items: SnapsVisualFeedPlannerItem[];
  warnings: string[];
  recommendations: string[];
};

@Injectable()
export class SnapsVisualFeedPlannerService {
  preview(body?: SnapsVisualFeedPlannerRequest): SnapsVisualFeedPlannerPreview {
    const request = body || {};
    const platform = this.cleanPlatform(request.platform) || 'instagram';
    const rule = snapsPlatformRules[platform];
    const viewMode = request.viewMode === 'vertical' ? 'vertical' : 'square';
    const includeDrafts = request.includeDrafts !== false;
    const includePublished = request.includePublished !== false;
    const rawItems = [
      ...this.cleanItems(request.items),
      ...this.itemsFromVariants(request.variants),
    ];
    const filtered = rawItems.filter(
      (item) =>
        (includeDrafts || item.status !== 'draft') &&
        (includePublished || item.status !== 'published')
    );
    if (!filtered.length) {
      throw new BadRequestException('visual planner items are required.');
    }

    const warnings: string[] = [];
    if (platform !== 'instagram') {
      warnings.push(
        `${rule.label} preview uses the Instagram-style 3-column feed layout as a planning proxy.`
      );
    }
    if (rawItems.length > 60) {
      warnings.push('Visual planner preview is capped at 60 upcoming items.');
    }

    const sorted = filtered
      .sort((left, right) => {
        const orderDelta = left.order - right.order;
        if (orderDelta !== 0) {
          return orderDelta;
        }
        return (left.publishDate || '').localeCompare(right.publishDate || '');
      })
      .slice(0, 60);
    const items = sorted.map((item, index) => {
      const row = Math.floor(index / 3) + 1;
      const column = (index % 3) + 1;
      return {
        ...item,
        row,
        column,
        opacity: item.status === 'draft' ? 0.62 : 1,
      };
    });
    const itemWarnings = items.flatMap((item) => item.warnings);
    const draftItems = items.filter((item) => item.status === 'draft').length;
    const scheduledItems = items.filter((item) => item.status === 'scheduled').length;
    const publishedItems = items.filter((item) => item.status === 'published').length;
    const rows = Math.ceil(items.length / 3);

    return {
      product: 'snaps',
      source: 'snaps-visual-feed-planner',
      platform,
      platformLabel: rule.label,
      viewMode,
      columns: 3,
      totalItems: items.length,
      draftItems,
      scheduledItems,
      publishedItems,
      rows,
      aestheticScore: this.aestheticScore(items, warnings, itemWarnings),
      items,
      warnings: [...warnings, ...itemWarnings].slice(0, 20),
      recommendations: this.recommendations(items, viewMode),
    };
  }

  toVariants(
    preview: SnapsVisualFeedPlannerPreview,
    targetPlatforms?: unknown
  ): SnapsVariant[] {
    const platforms = this.cleanPlatforms(targetPlatforms);
    const selectedPlatforms = platforms.length
      ? platforms
      : ([preview.platform] as SnapsTargetPlatform[]);
    const queuedItems = preview.items.filter((item) => item.status !== 'published');

    return queuedItems.flatMap((item) =>
      selectedPlatforms.map((platform) => {
        const rule = snapsPlatformRules[platform];
        return {
          platform,
          label: rule.label,
          title: item.title,
          content: fitSnapsContent(platform, item.caption || item.title),
          hashtags: this.hashtags(item, rule.hashtagLimit),
          media: item.imageUrl
            ? [
                {
                  id: item.id,
                  path: item.imageUrl,
                  thumbnail: item.thumbnail || item.imageUrl,
                  alt: item.alt || item.title,
                },
              ]
            : undefined,
          settings: {
            ...buildDefaultSettings(platform),
            source: 'snaps-visual-feed-planner',
            gridRow: item.row,
            gridColumn: item.column,
            feedStatus: item.status,
          },
          publishMode: rule.publishMode,
          notes: [
            `visual planner ${preview.viewMode}`,
            `grid ${item.row}/${item.column}`,
            item.publishDate ? `planned ${item.publishDate}` : '',
          ].filter(Boolean),
        };
      })
    );
  }

  private cleanItems(value: unknown): SnapsVisualFeedPlannerItem[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item, index) => this.cleanItem(item, index))
      .filter((item): item is SnapsVisualFeedPlannerItem => !!item);
  }

  private cleanItem(
    value: unknown,
    index: number
  ): SnapsVisualFeedPlannerItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const input = value as Record<string, unknown>;
    const title =
      this.cleanText(input.title, 140) ||
      this.cleanText(input.caption, 140) ||
      `Feed item ${index + 1}`;
    const caption = this.cleanText(input.caption || input.content, 2000) || title;
    const mediaType = this.cleanMediaType(input.mediaType || input.type);
    const imageUrl =
      this.cleanText(input.thumbnail, 2000) ||
      this.cleanText(input.imageUrl, 2000) ||
      this.cleanText(input.url, 2000);
    const warnings: string[] = [];
    if (!imageUrl) {
      warnings.push(`${title} is missing a visual thumbnail; placeholder was used.`);
    }
    if (mediaType === 'document') {
      warnings.push(`${title} is a document; confirm the cover image before publishing.`);
    }
    const thumbnail = imageUrl || this.placeholderImage(title, mediaType, index);
    return {
      id: this.cleanText(input.id, 160) || `visual-feed-${index + 1}`,
      order: this.cleanNumber(input.order, index),
      title,
      caption,
      imageUrl: thumbnail,
      thumbnail,
      mediaType,
      status: this.cleanStatus(input.status),
      publishDate: this.cleanDate(input.publishDate),
      source: this.cleanOptionalText(input.source, 120),
      alt: this.cleanOptionalText(input.alt || input.altText, 500),
      row: 1,
      column: 1,
      opacity: 1,
      warnings,
    };
  }

  private itemsFromVariants(value: unknown): SnapsVisualFeedPlannerItem[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((variant, index) => {
        if (!variant || typeof variant !== 'object') {
          return undefined;
        }
        const input = variant as Partial<SnapsVariant>;
        const media = Array.isArray(input.media) ? input.media[0] : undefined;
        return this.cleanItem(
          {
            id: `variant-${index + 1}`,
            title: input.title || input.label || input.platform,
            caption: input.content,
            thumbnail: media?.thumbnail || media?.path,
            imageUrl: media?.path,
            mediaType: media?.path?.includes('video') ? 'video' : 'image',
            status: 'draft',
            source: 'transform-variant',
            alt: media?.alt,
            order: index + 100,
          },
          index + 100
        );
      })
      .filter((item): item is SnapsVisualFeedPlannerItem => !!item);
  }

  private recommendations(
    items: SnapsVisualFeedPlannerItem[],
    viewMode: SnapsVisualFeedPlannerViewMode
  ) {
    const recommendations: string[] = [];
    const draftItems = items.filter((item) => item.status === 'draft').length;
    const videos = items.filter((item) => item.mediaType === 'video').length;
    const placeholders = items.filter((item) =>
      item.warnings.some((warning) => warning.includes('placeholder'))
    ).length;
    if (draftItems) {
      recommendations.push('Draft cells are dimmed so the operator can separate planned ideas from committed scheduled posts.');
    }
    if (videos && viewMode === 'square') {
      recommendations.push('Switch to vertical view before scheduling Reels or Shorts covers.');
    }
    if (placeholders) {
      recommendations.push('Replace placeholder cells with final media-library thumbnails before client review.');
    }
    if (items.length >= 9) {
      recommendations.push('Review the top three rows together; that is the first profile impression after a campaign batch goes live.');
    }
    return recommendations.length
      ? recommendations
      : ['Grid balance looks ready for approval or draft queue handoff.'];
  }

  private aestheticScore(
    items: SnapsVisualFeedPlannerItem[],
    warnings: string[],
    itemWarnings: string[]
  ) {
    const mediaTypes = new Set(items.map((item) => item.mediaType));
    const statusTypes = new Set(items.map((item) => item.status));
    const penalty = warnings.length * 4 + itemWarnings.length * 6;
    const varietyBonus = Math.min(12, mediaTypes.size * 4 + statusTypes.size * 2);
    return Math.max(0, Math.min(100, 76 + varietyBonus - penalty));
  }

  private placeholderImage(title: string, mediaType: string, index: number) {
    const palette = ['#12b8b8', '#f6c85f', '#ef6f6c', '#7dd3fc', '#9ca3af'];
    const color = palette[index % palette.length];
    const safeTitle = this.escapeXml(title.slice(0, 42));
    const safeType = this.escapeXml(mediaType.toUpperCase());
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">',
      '<rect width="1080" height="1080" fill="#101418"/>',
      `<rect x="64" y="64" width="952" height="952" rx="42" fill="${color}" opacity="0.18"/>`,
      `<text x="92" y="146" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="${color}">${safeType}</text>`,
      `<text x="92" y="520" font-family="Arial, sans-serif" font-size="58" font-weight="800" fill="#f8fafc">${safeTitle}</text>`,
      '<text x="92" y="930" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#94a3b8">snaps visual planner</text>',
      '</svg>',
    ].join('');
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  }

  private hashtags(item: SnapsVisualFeedPlannerItem, limit = 5) {
    return [
      ...new Set(
        [item.mediaType, item.status, 'feed']
          .map((tag) => `#${tag.replace(/[^a-zA-Z0-9가-힣_-]/g, '')}`)
          .filter((tag) => tag.length > 1)
      ),
    ].slice(0, limit || 5);
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
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
    const platform = this.cleanText(value, 80);
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanStatus(value: unknown): SnapsVisualFeedPlannerStatus {
    const status = this.cleanText(value, 80).toLowerCase();
    return ['draft', 'scheduled', 'published'].includes(status)
      ? (status as SnapsVisualFeedPlannerStatus)
      : 'draft';
  }

  private cleanMediaType(value: unknown): SnapsVisualFeedPlannerItem['mediaType'] {
    const mediaType = this.cleanText(value, 80).toLowerCase();
    return ['image', 'video', 'carousel', 'document'].includes(mediaType)
      ? (mediaType as SnapsVisualFeedPlannerItem['mediaType'])
      : 'unknown';
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 80);
    if (!text) {
      return undefined;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  private cleanNumber(value: unknown, fallback: number) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
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
      raw = value.map((item) => this.cleanText(item, maxLength)).join(' ');
    }
    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
