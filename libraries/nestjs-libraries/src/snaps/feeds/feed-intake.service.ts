import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsBlockedUrlError,
  fetchSnapsPublicUrl,
} from '@gitroom/nestjs-libraries/snaps/utils/public-fetch';

export type SnapsFeedIntakeRequest = {
  feedXml?: unknown;
  feedUrl?: unknown;
  defaultTone?: unknown;
  defaultTopic?: unknown;
  defaultPlatforms?: unknown;
  maxItems?: unknown;
};

export type SnapsFeedItemStatus = 'ready' | 'warning' | 'invalid';

export type SnapsFeedItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  linkUrl?: string;
  imageUrl?: string;
  publishedAt?: string;
  topic?: string;
  tone?: string;
  platforms: SnapsTargetPlatform[];
  tags: string[];
  warnings: string[];
  status: SnapsFeedItemStatus;
};

export type SnapsFeedPreview = {
  product: 'snaps';
  source: 'snaps-rss-feed';
  feedUrl?: string;
  sampleRss: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsFeedItem[];
};

@Injectable()
export class SnapsFeedIntakeService {
  readonly sampleRss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>snaps sample feed</title>',
    '<item>',
    '<title>AI 콘텐츠 운영 체크리스트</title>',
    '<link>https://example.com/blog/ai-content-ops</link>',
    '<description>이번 주 B2B 브랜드가 재사용할 수 있는 콘텐츠 운영 체크리스트입니다.</description>',
    '<pubDate>Tue, 02 Jun 2026 10:00:00 +0900</pubDate>',
    '<category>AI</category><category>자동화</category>',
    '<enclosure url="https://example.com/cover.png" type="image/png" />',
    '</item>',
    '<item>',
    '<title>세일즈 댓글 답변 템플릿</title>',
    '<link>https://example.com/blog/comment-sales</link>',
    '<description>가격과 상담 문의 댓글에 답하는 짧은 템플릿을 정리했습니다.</description>',
    '<category>세일즈</category>',
    '</item>',
    '</channel>',
    '</rss>',
  ].join('\n');

  async preview(body?: SnapsFeedIntakeRequest): Promise<SnapsFeedPreview> {
    const request = body || {};
    const feedUrl = this.cleanOptionalUrl(request.feedUrl);
    const feedXml =
      this.cleanXml(request.feedXml) ||
      (feedUrl ? await this.fetchFeedXml(feedUrl) : '');
    if (!feedXml) {
      throw new BadRequestException('feedXml or feedUrl is required for RSS intake.');
    }

    const defaultTopic = this.cleanText(request.defaultTopic, 240);
    const defaultTone = this.cleanText(request.defaultTone, 240);
    const defaultPlatforms = this.cleanPlatforms(request.defaultPlatforms);
    const maxItems = this.clampNumber(request.maxItems, 20, 1, 100);
    const rawItems = this.extractFeedItems(feedXml).slice(0, maxItems);
    if (!rawItems.length) {
      throw new BadRequestException('RSS feed did not include any item or entry records.');
    }

    const items = rawItems.map((item, index) =>
      this.normalizeItem(item, index + 1, {
        defaultTopic,
        defaultTone,
        defaultPlatforms,
      })
    );

    return {
      product: 'snaps',
      source: 'snaps-rss-feed',
      feedUrl: feedUrl || undefined,
      sampleRss: this.sampleRss,
      totalItems: items.length,
      acceptedItems: items.filter((item) => item.status !== 'invalid').length,
      invalidItems: items.filter((item) => item.status === 'invalid').length,
      readyToSchedule: items.filter((item) => item.status === 'ready').length,
      items,
    };
  }

  toSourceInputs(items: SnapsFeedItem[]): SnapsSourceLibraryInputDto[] {
    return items
      .filter((item) => item.status !== 'invalid')
      .map((item) => ({
        title: item.title,
        sourceText: this.decorateSourceText(item),
        topic: item.topic,
        tone: item.tone,
        sourcePlatform: 'rss-feed',
        tags: ['rss-feed', ...item.platforms, ...item.tags],
      }));
  }

  toVariants(item: SnapsFeedItem): SnapsVariant[] {
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
          source: 'snaps-rss-feed',
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl,
          subject: item.title,
        },
        publishMode: rule.publishMode,
        notes: [
          item.publishedAt ? `publishedAt: ${item.publishedAt}` : '',
          item.linkUrl ? `link: ${item.linkUrl}` : '',
          item.imageUrl ? `image: ${item.imageUrl}` : '',
        ].filter(Boolean),
      };
    });
  }

  private async fetchFeedXml(feedUrl: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchSnapsPublicUrl(feedUrl, {
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadRequestException(`RSS feed request failed with HTTP ${response.status}.`);
      }
      return (await response.text()).slice(0, 500000);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof SnapsBlockedUrlError) {
        throw new BadRequestException(`RSS feed URL is not allowed: ${error.message}`);
      }
      throw new BadRequestException('RSS feed could not be fetched.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeItem(
    rawXml: string,
    itemIndex: number,
    defaults: {
      defaultTopic?: string;
      defaultTone?: string;
      defaultPlatforms: SnapsTargetPlatform[];
    }
  ): SnapsFeedItem {
    const title =
      this.cleanText(this.extractTag(rawXml, 'title'), 180) ||
      `Feed item ${itemIndex}`;
    const linkUrl =
      this.cleanOptionalUrl(this.extractTag(rawXml, 'link')) ||
      this.cleanOptionalUrl(this.extractAttribute(rawXml, 'link', 'href'));
    const description =
      this.cleanText(this.extractTag(rawXml, 'description'), 50000) ||
      this.cleanText(this.extractTag(rawXml, 'summary'), 50000) ||
      this.cleanText(this.extractTag(rawXml, 'content:encoded'), 50000) ||
      this.cleanText(this.extractTag(rawXml, 'content'), 50000);
    const publishedAt = this.cleanDate(
      this.extractTag(rawXml, 'pubDate') ||
        this.extractTag(rawXml, 'published') ||
        this.extractTag(rawXml, 'updated')
    );
    const imageUrl =
      this.cleanOptionalUrl(this.extractAttribute(rawXml, 'media:content', 'url')) ||
      this.cleanOptionalUrl(this.extractAttribute(rawXml, 'media:thumbnail', 'url')) ||
      this.cleanOptionalUrl(this.extractAttribute(rawXml, 'enclosure', 'url')) ||
      this.cleanOptionalUrl(this.extractTag(rawXml, 'image'));
    const tags = this.extractTags(rawXml, 'category');
    const platforms = defaults.defaultPlatforms.length
      ? defaults.defaultPlatforms
      : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]);
    const sourceText = description || title;
    const warnings: string[] = [];

    if (sourceText.length < 5) {
      warnings.push('RSS item description/content is too short.');
    }
    if (!linkUrl) {
      warnings.push('RSS item is missing a link URL.');
    }
    if (!platforms.length) {
      warnings.push('No supported snaps platforms were selected.');
    }

    const status: SnapsFeedItemStatus =
      sourceText.length < 5 || !platforms.length ? 'invalid' : warnings.length ? 'warning' : 'ready';

    return {
      itemIndex,
      title,
      sourceText,
      linkUrl,
      imageUrl,
      publishedAt,
      topic: defaults.defaultTopic || tags[0] || undefined,
      tone: defaults.defaultTone || undefined,
      platforms,
      tags,
      warnings,
      status,
    };
  }

  private extractFeedItems(xml: string) {
    const rssItems = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    if (rssItems.length) {
      return rssItems;
    }
    return xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  }

  private extractTag(xml: string, tag: string) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    return this.decodeXml(this.stripCdata(match?.[1] || ''));
  }

  private extractTags(xml: string, tag: string) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...xml.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi'))];
    return [
      ...new Set(
        matches
          .map((match) => this.cleanText(this.decodeXml(this.stripCdata(match[1] || '')), 80))
          .filter(Boolean)
      ),
    ].slice(0, 20);
  }

  private extractAttribute(xml: string, tag: string, attribute: string) {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(
      new RegExp(`<${escapedTag}\\b[^>]*\\s${escapedAttribute}=["']([^"']+)["'][^>]*>`, 'i')
    );
    return this.decodeXml(match?.[1] || '');
  }

  private decorateSourceText(item: SnapsFeedItem) {
    return [
      item.sourceText,
      item.linkUrl ? `Link: ${item.linkUrl}` : '',
      item.imageUrl ? `Image: ${item.imageUrl}` : '',
    ].filter(Boolean).join('\n\n');
  }

  private decorateVariantContent(item: SnapsFeedItem, maxLength: number) {
    return [
      item.sourceText,
      item.linkUrl ? item.linkUrl : '',
    ].filter(Boolean).join('\n\n').slice(0, maxLength);
  }

  private toHashtags(tags: string[], limit = 5) {
    return tags
      .map((tag) => tag.replace(/^#+/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .slice(0, Math.max(0, limit));
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

  private cleanXml(value: unknown) {
    return typeof value === 'string' ? value.trim().slice(0, 500000) : '';
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    }
    return this.decodeXml(raw)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private stripCdata(value: string) {
    return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  }

  private decodeXml(value: string) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }
}
