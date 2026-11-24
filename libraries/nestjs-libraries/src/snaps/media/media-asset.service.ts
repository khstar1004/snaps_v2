import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';

export type SnapsMediaAssetType =
  | 'image'
  | 'video'
  | 'gif'
  | 'carousel'
  | 'document'
  | 'unknown';

export type SnapsMediaAssetInput = {
  title?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  mediaType?: unknown;
  altText?: unknown;
  caption?: unknown;
  campaign?: unknown;
  tags?: unknown;
  targetPlatforms?: unknown;
  width?: unknown;
  height?: unknown;
  durationSeconds?: unknown;
  source?: unknown;
};

export type SnapsMediaAssetListQuery = {
  search?: unknown;
  mediaType?: unknown;
  platform?: unknown;
  tag?: unknown;
  campaign?: unknown;
};

export type SnapsMediaAssetAttachRequest = {
  caption?: unknown;
  topic?: unknown;
  targetPlatforms?: unknown;
};

export type SnapsMediaAssetScheduleRequest = SnapsMediaAssetAttachRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: unknown;
};

export type SnapsMediaPlatformFit = {
  platform: SnapsTargetPlatform;
  label: string;
  status: 'ready' | 'needs-review' | 'assist-only';
  recommendation: string;
  warnings: string[];
};

export type SnapsMediaAssetDraft = {
  product: 'snaps';
  source: 'snaps-media-library';
  title: string;
  url: string;
  thumbnail: string;
  mediaType: SnapsMediaAssetType;
  altText: string;
  caption: string;
  campaign: string;
  tags: string[];
  targetPlatforms: SnapsTargetPlatform[];
  width?: number;
  height?: number;
  durationSeconds?: number;
  platformFit: SnapsMediaPlatformFit[];
  warnings: string[];
};

export type SnapsMediaAssetItem = SnapsMediaAssetDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

export type SnapsMediaAssetAttachResult = {
  product: 'snaps';
  source: 'snaps-media-library-attach';
  asset: SnapsMediaAssetItem;
  transform: {
    provider: 'rule-fallback';
    model: 'media-library';
    variants: SnapsVariant[];
    warnings: string[];
    ragExamplesUsed: [];
  };
  checklist: string[];
  warnings: string[];
};

const mediaAssetTypes: SnapsMediaAssetType[] = [
  'image',
  'video',
  'gif',
  'carousel',
  'document',
  'unknown',
];

@Injectable()
export class SnapsMediaAssetService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  preview(body?: SnapsMediaAssetInput): SnapsMediaAssetDraft {
    const request = body || {};
    const url = this.cleanUrl(request.url);
    if (!url) {
      throw new BadRequestException('media asset url is required.');
    }

    const title =
      this.cleanText(request.title, 140) ||
      this.titleFromUrl(url) ||
      'snaps media asset';
    const mediaType = this.cleanMediaType(request.mediaType) || this.inferMediaType(url);
    const targetPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const platforms = targetPlatforms.length
      ? targetPlatforms
      : (['instagram', 'threads', 'linkedin'] as SnapsTargetPlatform[]);
    const tags = this.cleanStringArray(request.tags, 24, 60);
    const width = this.cleanPositiveNumber(request.width);
    const height = this.cleanPositiveNumber(request.height);
    const durationSeconds = this.cleanPositiveNumber(request.durationSeconds);
    const caption =
      cleanSnapsMultilineText(request.caption, 1200) ||
      `${title} 관련 미디어를 활용한 게시물입니다.`;
    const altText =
      this.cleanText(request.altText, 240) ||
      `${title} media asset for ${platforms
        .map((platform) => snapsPlatformRules[platform].label)
        .join(', ')}`;
    const thumbnail = this.cleanUrl(request.thumbnail) || (mediaType === 'image' ? url : '');
    const warnings: string[] = [];
    if (!targetPlatforms.length) {
      warnings.push('No target platforms were supplied, so common snaps platforms were used.');
    }
    if (!width || !height) {
      warnings.push('Width and height were not supplied, so platform fit is advisory.');
    }
    if ((mediaType === 'video' || mediaType === 'gif') && !durationSeconds) {
      warnings.push('Duration was not supplied, so short-form limits need manual review.');
    }

    const platformFit = this.buildPlatformFit({
      mediaType,
      targetPlatforms: platforms,
      width,
      height,
      durationSeconds,
    });

    return {
      product: 'snaps',
      source: 'snaps-media-library',
      title,
      url,
      thumbnail,
      mediaType,
      altText,
      caption,
      campaign: this.cleanText(request.campaign, 120),
      tags,
      targetPlatforms: platforms,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(durationSeconds ? { durationSeconds } : {}),
      platformFit,
      warnings: [...warnings, ...platformFit.flatMap((fit) => fit.warnings)],
    };
  }

  @SnapsSerialized()
  async save(organizationId: string, body?: SnapsMediaAssetInput) {
    const current = await this.list(organizationId);
    const draft = this.preview(body);
    const now = new Date().toISOString();
    const item: SnapsMediaAssetItem = {
      ...draft,
      id: makeId(14),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(
      organizationId,
      [item, ...current.filter((asset) => asset.url !== item.url)].slice(0, 300)
    );
    return item;
  }

  async list(
    organizationId: string,
    query?: SnapsMediaAssetListQuery
  ): Promise<SnapsMediaAssetItem[]> {
    const items = await this.readAll(organizationId);
    const search = this.cleanText(query?.search, 120).toLowerCase();
    const mediaType = this.cleanMediaType(query?.mediaType);
    const platform = this.cleanPlatform(query?.platform);
    const tag = this.cleanText(query?.tag, 80).toLowerCase();
    const campaign = this.cleanText(query?.campaign, 120).toLowerCase();

    return items.filter((item) => {
      if (mediaType && item.mediaType !== mediaType) {
        return false;
      }
      if (platform && !item.targetPlatforms.includes(platform)) {
        return false;
      }
      if (tag && !item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag))) {
        return false;
      }
      if (campaign && !item.campaign.toLowerCase().includes(campaign)) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        item.title,
        item.altText,
        item.caption,
        item.campaign,
        item.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  async get(organizationId: string, assetId: string) {
    const asset = (await this.readAll(organizationId)).find(
      (item) => item.id === assetId
    );
    if (!asset) {
      throw new NotFoundException('snaps media asset was not found.');
    }
    return asset;
  }

  @SnapsSerialized()
  async attach(
    organizationId: string,
    assetId: string,
    body?: SnapsMediaAssetAttachRequest
  ): Promise<SnapsMediaAssetAttachResult> {
    const current = await this.readAll(organizationId);
    const asset = current.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundException('snaps media asset was not found.');
    }

    const attachedAsset = {
      ...asset,
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.write(
      organizationId,
      current.map((item) => (item.id === assetId ? attachedAsset : item))
    );

    const requestedPlatforms = this.cleanPlatforms(body?.targetPlatforms);
    const platforms = requestedPlatforms.length
      ? requestedPlatforms
      : asset.targetPlatforms.length
        ? asset.targetPlatforms
        : (['instagram'] as SnapsTargetPlatform[]);
    const caption = cleanSnapsMultilineText(body?.caption, 1200) || asset.caption;
    const topic =
      this.cleanText(body?.topic, 120) || asset.campaign || asset.title;
    const variants = this.toVariants(attachedAsset, {
      caption,
      topic,
      targetPlatforms: platforms,
    });
    const fitWarnings = this.buildPlatformFit({
      mediaType: asset.mediaType,
      targetPlatforms: platforms,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
    }).flatMap((fit) => fit.warnings);
    const warnings = [...new Set([...asset.warnings, ...fitWarnings])];

    return {
      product: 'snaps',
      source: 'snaps-media-library-attach',
      asset: attachedAsset,
      transform: {
        provider: 'rule-fallback',
        model: 'media-library',
        variants,
        warnings,
        ragExamplesUsed: [],
      },
      checklist: [
        `Asset: ${asset.title}`,
        `Type: ${asset.mediaType}`,
        `Alt text: ${asset.altText}`,
        `Campaign: ${asset.campaign || topic}`,
        `Platforms: ${platforms.map((platform) => snapsPlatformRules[platform].label).join(', ')}`,
      ],
      warnings,
    };
  }

  toVariants(
    asset: SnapsMediaAssetItem,
    request: SnapsMediaAssetAttachRequest = {}
  ): SnapsVariant[] {
    const platforms = this.cleanPlatforms(request.targetPlatforms).length
      ? this.cleanPlatforms(request.targetPlatforms)
      : asset.targetPlatforms;
    const caption = cleanSnapsMultilineText(request.caption, 1200) || asset.caption;
    const topic = this.cleanText(request.topic, 120) || asset.campaign || asset.title;
    const hashtags = this.tagsToHashtags(asset.tags);
    const media = [
      {
        id: asset.id,
        path: asset.url,
        thumbnail: asset.thumbnail || undefined,
        alt: asset.altText,
      },
    ];

    return platforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      const fit = this.buildPlatformFit({
        mediaType: asset.mediaType,
        targetPlatforms: [platform],
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.durationSeconds,
      })[0];
      return {
        platform,
        label: `${rule.label} media post`,
        title: this.buildVariantTitle(platform, asset, topic),
        content: this.buildVariantContent(platform, asset, caption, topic),
        hashtags: this.limitHashtags(platform, hashtags),
        media,
        settings: {
          source: 'snaps-media-library',
          mediaType: asset.mediaType,
          campaign: asset.campaign,
          altText: asset.altText,
          platformFit: fit?.status || 'needs-review',
        },
        publishMode: rule.publishMode,
        notes: [
          fit?.recommendation || '',
          ...(fit?.warnings || []),
          asset.altText ? `Alt: ${asset.altText}` : '',
        ].filter(Boolean),
      };
    });
  }

  @SnapsSerialized()
  async delete(organizationId: string, assetId: string) {
    const current = await this.readAll(organizationId);
    const next = current.filter((asset) => asset.id !== assetId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== current.length,
      mediaAssets: next.length,
    };
  }

  @SnapsSerialized()
  async importAssets(organizationId: string, assets: unknown[] = []) {
    const current = await this.readAll(organizationId);
    const incoming = assets
      .map((asset) => this.normalizeItem(organizationId, asset))
      .filter((asset): asset is SnapsMediaAssetItem => !!asset);
    const merged = this.mergeByUrlOrId([...incoming, ...current]).slice(0, 300);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private buildVariantTitle(
    platform: SnapsTargetPlatform,
    asset: SnapsMediaAssetItem,
    topic: string
  ) {
    const base = topic || asset.title;
    if (platform === 'youtube') {
      return base.slice(0, 70);
    }
    if (platform === 'naver-blog' || platform === 'naver-cafe') {
      return `${base} - ${asset.title}`.slice(0, 90);
    }
    return asset.title;
  }

  private buildVariantContent(
    platform: SnapsTargetPlatform,
    asset: SnapsMediaAssetItem,
    caption: string,
    topic: string
  ) {
    const base = caption || asset.caption || asset.title;
    if (platform === 'threads') {
      return `${base}\n\n이 미디어에서 가장 먼저 보이는 포인트는 ${asset.altText}`;
    }
    if (platform === 'instagram') {
      return `${base}\n\n저장해두면 ${topic} 콘텐츠를 만들 때 바로 다시 쓸 수 있습니다.`;
    }
    if (platform === 'youtube') {
      return `${topic}\n\n${base}\n\nShorts metadata asset: ${asset.title}`;
    }
    if (platform === 'tiktok') {
      return `${base}\n\n첫 2초 훅과 화면 자막이 같은 메시지를 말하게 조정하세요.`;
    }
    if (platform === 'linkedin') {
      return `${base}\n\nAsset context: ${asset.altText}\nCampaign: ${asset.campaign || topic}`;
    }
    if (platform === 'x') {
      return `${base}\n\n${asset.url}`.slice(0, 260);
    }
    if (platform === 'kakao-talk') {
      return `${asset.title}\n${base}\n${asset.url}`;
    }
    return `${base}\n\n미디어: ${asset.url}`;
  }

  private buildPlatformFit(input: {
    mediaType: SnapsMediaAssetType;
    targetPlatforms: SnapsTargetPlatform[];
    width?: number;
    height?: number;
    durationSeconds?: number;
  }) {
    const ratio =
      input.width && input.height ? Number((input.width / input.height).toFixed(2)) : 0;

    return input.targetPlatforms.map((platform): SnapsMediaPlatformFit => {
      const rule = snapsPlatformRules[platform];
      const warnings: string[] = [];
      let status: SnapsMediaPlatformFit['status'] =
        rule.publishMode === 'assist' ? 'assist-only' : 'ready';
      let recommendation = `${rule.label}에 첨부 가능한 미디어 자산입니다.`;

      if (platform === 'youtube' && input.mediaType !== 'video') {
        status = 'needs-review';
        warnings.push('YouTube Shorts generally needs a video asset.');
      }
      if ((platform === 'tiktok' || platform === 'instagram') && input.mediaType === 'document') {
        status = 'needs-review';
        warnings.push(`${rule.label} needs an image, carousel, GIF, or video asset.`);
      }
      if (
        (platform === 'instagram' || platform === 'tiktok' || platform === 'youtube') &&
        ratio &&
        ratio > 1.25
      ) {
        status = 'needs-review';
        warnings.push(`${rule.label} usually performs better with square or vertical media.`);
      }
      if (
        input.durationSeconds &&
        (platform === 'youtube' || platform === 'tiktok' || platform === 'instagram') &&
        input.durationSeconds > 180
      ) {
        status = 'needs-review';
        warnings.push(`${rule.label} short-form asset is longer than 180 seconds.`);
      }
      if (platform === 'naver-blog') {
        recommendation = '블로그 본문 이미지 또는 첨부 링크로 수동 배치하세요.';
      } else if (platform === 'xiaohongshu') {
        recommendation = '저장형 노트 커버와 첫 이미지가 같은 메시지를 보여야 합니다.';
      } else if (platform === 'kakao-talk') {
        recommendation = '카카오 공유 카드 제목/설명과 함께 수동 발송하세요.';
      }

      return {
        platform,
        label: rule.label,
        status,
        recommendation,
        warnings,
      };
    });
  }

  private tagsToHashtags(tags: string[]) {
    return tags
      .map((tag) => tag.replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '').trim())
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .slice(0, 10);
  }

  private limitHashtags(platform: SnapsTargetPlatform, hashtags: string[]) {
    const rule = snapsPlatformRules[platform];
    return hashtags.slice(0, rule.hashtagLimit || 6);
  }

  private async readAll(organizationId: string): Promise<SnapsMediaAssetItem[]> {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsMediaAssetItem => !!item);
    } catch {
      return [];
    }
  }

  private normalizeItem(
    organizationId: string,
    value: unknown
  ): SnapsMediaAssetItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Partial<SnapsMediaAssetItem>;
    try {
      const draft = this.preview(record);
      const now = new Date().toISOString();
      return {
        ...draft,
        id: this.cleanText(record.id, 80) || makeId(14),
        organizationId,
        createdAt: this.cleanIso(record.createdAt) || now,
        updatedAt: this.cleanIso(record.updatedAt) || now,
        ...(this.cleanIso(record.lastUsedAt)
          ? { lastUsedAt: this.cleanIso(record.lastUsedAt) }
          : {}),
      };
    } catch {
      return undefined;
    }
  }

  private async write(organizationId: string, assets: SnapsMediaAssetItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(assets, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.media-assets.json`);
  }

  private async atomicWrite(filePath: string, data: string) {
    await writeSnapsFileAtomic(filePath, data);
  }

  private mergeByUrlOrId(items: SnapsMediaAssetItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.id || item.url;
      if (seen.has(key) || seen.has(item.url)) {
        return false;
      }
      seen.add(key);
      seen.add(item.url);
      return true;
    });
  }

  private inferMediaType(url: string): SnapsMediaAssetType {
    const clean = url.split('?')[0].toLowerCase();
    if (/\.(png|jpe?g|webp|avif|svg)$/.test(clean)) {
      return 'image';
    }
    if (/\.(mp4|mov|webm|m4v)$/.test(clean)) {
      return 'video';
    }
    if (/\.gif$/.test(clean)) {
      return 'gif';
    }
    if (/\.(pdf|docx?|pptx?)$/.test(clean)) {
      return 'document';
    }
    return 'unknown';
  }

  private titleFromUrl(url: string) {
    try {
      const parsed = new URL(url);
      const part = parsed.pathname.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(part)
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim()
        .slice(0, 120);
    } catch {
      return '';
    }
  }

  private cleanMediaType(value: unknown): SnapsMediaAssetType | undefined {
    const mediaType = this.cleanText(value, 40) as SnapsMediaAssetType;
    return mediaAssetTypes.includes(mediaType) ? mediaType : undefined;
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]/)
        : [];
    return [
      ...new Set(
        values
          .map((item) => this.cleanPlatform(item))
          .filter((item): item is SnapsTargetPlatform => !!item)
      ),
    ].slice(0, 10);
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanText(value, 80) as SnapsTargetPlatform;
    return snapsTargetPlatforms.includes(platform) ? platform : undefined;
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]/)
        : [];
    return [
      ...new Set(
        values
          .map((item) => this.cleanText(item, maxLength))
          .filter(Boolean)
      ),
    ].slice(0, maxItems);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }
    return '';
  }

  private cleanUrl(value: unknown) {
    const url = this.cleanText(value, 2000);
    if (!url) {
      return '';
    }
    if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) {
      return url;
    }
    return '';
  }

  private cleanPositiveNumber(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return undefined;
    }
    return Math.round(numeric);
  }

  private cleanIso(value: unknown) {
    const text = this.cleanText(value, 80);
    return text && !Number.isNaN(new Date(text).getTime()) ? text : '';
  }
}
