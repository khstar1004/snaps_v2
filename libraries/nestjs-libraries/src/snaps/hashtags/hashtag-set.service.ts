import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  buildDefaultSettings,
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';

export type SnapsHashtagSetPlacement = 'caption' | 'first-comment';
export type SnapsHashtagSetStrategy = 'balanced' | 'reach' | 'community' | 'campaign';

export type SnapsHashtagSetInput = {
  title?: unknown;
  description?: unknown;
  topic?: unknown;
  sourceText?: unknown;
  hashtagText?: unknown;
  hashtags?: unknown;
  mentions?: unknown;
  reusableText?: unknown;
  tags?: unknown;
  strategy?: unknown;
  placement?: unknown;
  targetPlatforms?: unknown;
  variants?: unknown;
  source?: unknown;
};

export type SnapsHashtagSetListQuery = {
  search?: unknown;
  platform?: unknown;
  tag?: unknown;
  placement?: unknown;
};

export type SnapsHashtagSetApplyRequest = {
  sourceText?: unknown;
  topic?: unknown;
  targetPlatforms?: unknown;
  variants?: unknown;
  placement?: unknown;
  includeReusableText?: unknown;
};

export type SnapsHashtagSetPlatformPlan = {
  platform: SnapsTargetPlatform;
  label: string;
  hashtagLimit: number;
  selectedHashtags: string[];
  overLimit: number;
  placementSupported: boolean;
  status: 'ready' | 'warning';
  warnings: string[];
};

export type SnapsHashtagSetDraft = {
  product: 'snaps';
  source: 'snaps-hashtag-set';
  title: string;
  description: string;
  topic: string;
  strategy: SnapsHashtagSetStrategy;
  placement: SnapsHashtagSetPlacement;
  reusableText: string;
  hashtags: string[];
  mentions: string[];
  tags: string[];
  targetPlatforms: SnapsTargetPlatform[];
  platformPlans: SnapsHashtagSetPlatformPlan[];
  warnings: string[];
  recommendations: string[];
};

export type SnapsHashtagSetItem = SnapsHashtagSetDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

export type SnapsHashtagSetApplication = {
  product: 'snaps';
  source: 'snaps-hashtag-set-application';
  set: SnapsHashtagSetItem;
  placement: SnapsHashtagSetPlacement;
  transform: {
    provider: 'rule-fallback';
    model: 'hashtag-set';
    variants: SnapsVariant[];
    warnings: string[];
    ragExamplesUsed: [];
  };
  checklist: string[];
  warnings: string[];
};

const firstCommentCapablePlatforms: SnapsTargetPlatform[] = [
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
];

const stopWords = new Set([
  '그리고',
  '하지만',
  '있는',
  '없는',
  '이번',
  '우리',
  '콘텐츠',
  '게시물',
  '합니다',
  'with',
  'from',
  'that',
  'this',
  'your',
  'into',
  'about',
  'https',
  'http',
]);

@Injectable()
export class SnapsHashtagSetService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  preview(body?: SnapsHashtagSetInput): SnapsHashtagSetDraft {
    const request = body || {};
    const variants = this.cleanVariants(request.variants);
    const requestedPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const variantPlatforms = this.uniquePlatforms(variants.map((variant) => variant.platform));
    const targetPlatforms = requestedPlatforms.length
      ? requestedPlatforms
      : variantPlatforms.length
        ? variantPlatforms
        : (['instagram', 'threads', 'linkedin'] as SnapsTargetPlatform[]);
    const sourceText = this.cleanText(request.sourceText, 4000);
    const topic =
      this.cleanText(request.topic, 120) ||
      this.firstVariantTitle(variants) ||
      this.extractTopic(sourceText) ||
      'snaps campaign';
    const title =
      this.cleanText(request.title, 120) ||
      `${topic.replace(/^#+/, '')} hashtag set`;
    const description =
      this.cleanText(request.description, 500) ||
      `Reusable hashtags for ${topic}`;
    const strategy = this.cleanStrategy(request.strategy);
    const placement = this.cleanPlacement(request.placement);
    const explicitHashtags = [
      ...this.cleanHashtags(request.hashtags, 40),
      ...this.cleanHashtags(request.hashtagText, 40),
      ...this.extractHashtags(sourceText),
      ...variants.flatMap((variant) => variant.hashtags || []),
    ];
    const generatedHashtags = this.generateHashtags({
      topic,
      sourceText,
      description,
      strategy,
      targetPlatforms,
      variants,
    });
    const hashtags = this.uniqueHashtags([...explicitHashtags, ...generatedHashtags]).slice(
      0,
      30
    );
    const mentions = this.cleanMentions(request.mentions, 10);
    const reusableText =
      this.cleanReusableText(request.reusableText, 500) ||
      this.extractReusableText(request.hashtagText);
    const tags = this.cleanStringArray(request.tags, 24, 60);
    const warnings: string[] = [];

    if (!explicitHashtags.length) {
      warnings.push('No explicit hashtag group was supplied, so snaps generated one from the topic and platform defaults.');
    }
    if (placement === 'first-comment' && !targetPlatforms.some((platform) => firstCommentCapablePlatforms.includes(platform))) {
      warnings.push('Selected platforms do not support first-comment queue handoff, so captions will need manual review.');
    }

    const platformPlans = targetPlatforms.map((platform) =>
      this.platformPlan(platform, hashtags, placement)
    );

    return {
      product: 'snaps',
      source: 'snaps-hashtag-set',
      title,
      description,
      topic,
      strategy,
      placement,
      reusableText,
      hashtags,
      mentions,
      tags,
      targetPlatforms,
      platformPlans,
      warnings,
      recommendations: this.recommendations(platformPlans, placement, strategy),
    };
  }

  @SnapsSerialized()
  async save(organizationId: string, body?: SnapsHashtagSetInput) {
    const current = await this.list(organizationId);
    const draft = this.normalizeDraft(body, true);
    if (!draft) {
      throw new BadRequestException('hashtag set title, topic, source text, or hashtags are required.');
    }
    const now = new Date().toISOString();
    const item: SnapsHashtagSetItem = {
      ...draft,
      id: makeId(14),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(
      organizationId,
      [item, ...current.filter((set) => set.title !== item.title)].slice(0, 200)
    );
    return item;
  }

  async list(
    organizationId: string,
    query?: SnapsHashtagSetListQuery
  ): Promise<SnapsHashtagSetItem[]> {
    const items = await this.readAll(organizationId);
    const search = this.cleanText(query?.search, 120).toLowerCase();
    const platform = this.cleanPlatform(query?.platform);
    const tag = this.cleanText(query?.tag, 80).replace(/^#/, '').toLowerCase();
    const placement = this.cleanPlacement(query?.placement, false);

    return items.filter((item) => {
      if (platform && !item.targetPlatforms.includes(platform)) {
        return false;
      }
      if (placement && item.placement !== placement) {
        return false;
      }
      if (
        tag &&
        !item.hashtags.some((hash) => hash.replace(/^#/, '').toLowerCase().includes(tag)) &&
        !item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag))
      ) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        item.title,
        item.description,
        item.topic,
        item.reusableText,
        item.hashtags.join(' '),
        item.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }

  async get(organizationId: string, setId: string) {
    const set = (await this.readAll(organizationId)).find((item) => item.id === setId);
    if (!set) {
      throw new NotFoundException('snaps hashtag set was not found.');
    }
    return set;
  }

  @SnapsSerialized()
  async apply(
    organizationId: string,
    setId: string,
    body?: SnapsHashtagSetApplyRequest
  ): Promise<SnapsHashtagSetApplication> {
    const current = await this.readAll(organizationId);
    const found = current.find((item) => item.id === setId);
    if (!found) {
      throw new NotFoundException('snaps hashtag set was not found.');
    }

    const now = new Date().toISOString();
    const set: SnapsHashtagSetItem = {
      ...found,
      lastUsedAt: now,
      updatedAt: now,
    };
    await this.write(
      organizationId,
      current.map((item) => (item.id === setId ? set : item))
    );

    const placement = this.cleanPlacement(body?.placement) || set.placement;
    const requestedPlatforms = this.cleanPlatforms(body?.targetPlatforms);
    const targetPlatforms = requestedPlatforms.length
      ? requestedPlatforms
      : set.targetPlatforms.length
        ? set.targetPlatforms
        : (['instagram'] as SnapsTargetPlatform[]);
    const sourceText =
      this.cleanText(body?.sourceText, 4000) ||
      set.reusableText ||
      set.description ||
      set.topic;
    const topic = this.cleanText(body?.topic, 120) || set.topic || set.title;
    const variants = this.cleanVariants(body?.variants);
    const sourceVariants = variants.length
      ? variants
      : this.defaultVariants(targetPlatforms, sourceText, topic, set);
    const includeReusableText = body?.includeReusableText !== false;
    const appliedVariants = sourceVariants.map((variant) =>
      this.applyToVariant(variant, set, placement, includeReusableText)
    );
    const warnings = [
      ...set.warnings,
      ...appliedVariants.flatMap((variant) => variant.notes || [])
        .filter((note) => note.includes('Hashtag warning:')),
    ];

    return {
      product: 'snaps',
      source: 'snaps-hashtag-set-application',
      set,
      placement,
      transform: {
        provider: 'rule-fallback',
        model: 'hashtag-set',
        variants: appliedVariants,
        warnings,
        ragExamplesUsed: [],
      },
      checklist: [
        `Set: ${set.title}`,
        `Placement: ${placement}`,
        `Hashtags: ${set.hashtags.slice(0, 8).join(' ')}`,
        `Platforms: ${targetPlatforms.map((platform) => snapsPlatformRules[platform].label).join(', ')}`,
      ],
      warnings,
    };
  }

  @SnapsSerialized()
  async delete(organizationId: string, setId: string) {
    const current = await this.readAll(organizationId);
    const next = current.filter((item) => item.id !== setId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== current.length,
      hashtagSets: next.length,
    };
  }

  @SnapsSerialized()
  async importSets(organizationId: string, sets: unknown[] = []) {
    const current = await this.readAll(organizationId);
    const incoming = sets
      .map((item) => this.normalizeItem(organizationId, item))
      .filter((item): item is SnapsHashtagSetItem => !!item);
    const merged = this.mergeByKey([...incoming, ...current], (item) =>
      item.id || item.title.toLowerCase()
    ).slice(0, 200);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private normalizeDraft(
    value: unknown,
    requireSignal = false
  ): SnapsHashtagSetDraft | undefined {
    if (requireSignal && !this.hasHashtagSetSignal(value)) {
      return undefined;
    }
    try {
      return this.preview(
        value && typeof value === 'object'
          ? (value as SnapsHashtagSetInput)
          : undefined
      );
    } catch {
      return undefined;
    }
  }

  private normalizeItem(
    organizationId: string,
    value: unknown
  ): SnapsHashtagSetItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Partial<SnapsHashtagSetItem>;
    const draft = this.normalizeDraft(record, true);
    if (!draft) {
      return undefined;
    }
    const createdAt = this.cleanIso(record.createdAt) || new Date().toISOString();
    return {
      ...draft,
      id: this.cleanText(record.id, 100) || makeId(14),
      organizationId,
      createdAt,
      updatedAt: this.cleanIso(record.updatedAt) || createdAt,
      ...(this.cleanIso(record.lastUsedAt)
        ? { lastUsedAt: this.cleanIso(record.lastUsedAt) }
        : {}),
    };
  }

  private applyToVariant(
    variant: SnapsVariant,
    set: SnapsHashtagSetItem,
    placement: SnapsHashtagSetPlacement,
    includeReusableText: boolean
  ): SnapsVariant {
    const selectedHashtags = this.limitForPlatform(variant.platform, set.hashtags);
    const platformPlan = this.platformPlan(variant.platform, set.hashtags, placement);
    const block = this.buildReusableBlock(set, selectedHashtags, includeReusableText);
    const existingFirstComment = this.cleanText(variant.settings?.firstComment, 2200);
    const notes = [
      ...(variant.notes || []),
      `Hashtag set applied: ${set.title} (${selectedHashtags.length} tags)`,
      ...platformPlan.warnings.map((warning) => `Hashtag warning: ${warning}`),
    ].slice(0, 8);

    if (placement === 'first-comment' && firstCommentCapablePlatforms.includes(variant.platform)) {
      return {
        ...variant,
        hashtags: this.uniqueHashtags([...(variant.hashtags || []), ...selectedHashtags]).slice(
          0,
          this.hashtagLimit(variant.platform)
        ),
        settings: {
          ...variant.settings,
          __type: variant.settings?.__type || variant.platform,
          firstComment: this.mergeBlocks(existingFirstComment, block, 2200),
          snapsHashtagSet: true,
          hashtagSetId: set.id,
          hashtagSetTitle: set.title,
          hashtagPlacement: placement,
        },
        notes,
      };
    }

    return {
      ...variant,
      content: this.appendToCaption(variant.content, block, variant.platform),
      hashtags: this.uniqueHashtags([...(variant.hashtags || []), ...selectedHashtags]).slice(
        0,
        this.hashtagLimit(variant.platform)
      ),
      settings: {
        ...variant.settings,
        __type: variant.settings?.__type || variant.platform,
        snapsHashtagSet: true,
        hashtagSetId: set.id,
        hashtagSetTitle: set.title,
        hashtagPlacement: 'caption',
      },
      notes,
    };
  }

  private buildReusableBlock(
    set: SnapsHashtagSetItem,
    selectedHashtags: string[],
    includeReusableText: boolean
  ) {
    return [
      includeReusableText ? set.reusableText : '',
      set.mentions.join(' '),
      selectedHashtags.join(' '),
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  private defaultVariants(
    platforms: SnapsTargetPlatform[],
    sourceText: string,
    topic: string,
    set: SnapsHashtagSetItem
  ): SnapsVariant[] {
    const content =
      sourceText ||
      `${topic} 캠페인 본문입니다. 저장한 해시태그 세트를 붙여 플랫폼별로 재사용합니다.`;
    return platforms.map((platform) => ({
      platform,
      label: snapsPlatformRules[platform]?.label || platform,
      title: topic || set.title,
      content,
      hashtags: this.limitForPlatform(platform, set.hashtags),
      settings: buildDefaultSettings(platform),
      publishMode: snapsPlatformRules[platform]?.publishMode || 'schedule',
      notes: [],
    }));
  }

  private platformPlan(
    platform: SnapsTargetPlatform,
    hashtags: string[],
    placement: SnapsHashtagSetPlacement
  ): SnapsHashtagSetPlatformPlan {
    const limit = this.hashtagLimit(platform);
    const selectedHashtags = this.limitForPlatform(platform, hashtags);
    const overLimit = Math.max(0, hashtags.length - selectedHashtags.length);
    const placementSupported =
      placement === 'caption' || firstCommentCapablePlatforms.includes(platform);
    const warnings: string[] = [];

    if (overLimit > 0) {
      warnings.push(`${snapsPlatformRules[platform].label} uses ${limit} hashtag(s); ${overLimit} tag(s) were held back.`);
    }
    if (!placementSupported) {
      warnings.push(`${snapsPlatformRules[platform].label} does not support connected first-comment handoff in snaps.`);
    }

    return {
      platform,
      label: snapsPlatformRules[platform]?.label || platform,
      hashtagLimit: limit,
      selectedHashtags,
      overLimit,
      placementSupported,
      status: warnings.length ? 'warning' : 'ready',
      warnings,
    };
  }

  private recommendations(
    plans: SnapsHashtagSetPlatformPlan[],
    placement: SnapsHashtagSetPlacement,
    strategy: SnapsHashtagSetStrategy
  ) {
    const ready = plans.filter((plan) => plan.status === 'ready').length;
    const heldBack = plans.reduce((sum, plan) => sum + plan.overLimit, 0);
    return [
      `${ready}/${plans.length} platform hashtag plan(s) are ready without warnings.`,
      placement === 'first-comment'
        ? 'Use first-comment placement when the caption should stay clean and the platform supports comment chaining.'
        : 'Use caption placement when the tags are part of the post discovery metadata.',
      heldBack
        ? `${heldBack} platform-specific tag overage(s) will be trimmed during apply.`
        : `${strategy} strategy stayed within the selected platform limits.`,
    ];
  }

  private generateHashtags(input: {
    topic: string;
    sourceText: string;
    description: string;
    strategy: SnapsHashtagSetStrategy;
    targetPlatforms: SnapsTargetPlatform[];
    variants: SnapsVariant[];
  }) {
    const platformDefaults = input.targetPlatforms.flatMap(
      (platform) => snapsPlatformRules[platform]?.defaultHashtags || []
    );
    const corpus = [
      input.topic,
      input.sourceText,
      input.description,
      ...input.variants.map((variant) => `${variant.title || ''} ${variant.content}`),
    ].join(' ');
    const keywordTags = this.keywords(corpus).map((keyword) => `#${keyword}`);
    const strategyTags: Record<SnapsHashtagSetStrategy, string[]> = {
      balanced: ['#콘텐츠운영', '#마케팅실무'],
      reach: ['#마케팅', '#SNS마케팅', '#인사이트'],
      community: ['#SNS운영', '#콘텐츠커뮤니티', '#마케터'],
      campaign: ['#캠페인', '#파일럿', '#콘텐츠자동화'],
    };
    return this.uniqueHashtags([
      ...platformDefaults,
      ...keywordTags,
      ...strategyTags[input.strategy],
    ]);
  }

  private keywords(value: string) {
    const tokens = value
      .replace(/https?:\/\/\S+/gi, ' ')
      .match(/[\p{L}\p{N}_]{2,20}/gu);
    if (!tokens) {
      return [];
    }
    return [
      ...new Set(
        tokens
          .map((token) => token.trim())
          .filter((token) => !stopWords.has(token.toLowerCase()))
          .filter((token) => !/^\d+$/.test(token))
          .map((token) => token.replace(/[^\p{L}\p{N}_]/gu, ''))
          .filter(Boolean)
      ),
    ].slice(0, 8);
  }

  private async readAll(organizationId: string): Promise<SnapsHashtagSetItem[]> {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsHashtagSetItem => !!item);
    } catch {
      return [];
    }
  }

  private async write(organizationId: string, sets: SnapsHashtagSetItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(this.filePath(organizationId), JSON.stringify(sets, null, 2));
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.hashtag-sets.json`);
  }

  private async atomicWrite(filePath: string, data: string) {
    await writeSnapsFileAtomic(filePath, data);
  }

  private hasHashtagSetSignal(value: unknown) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const input = value as Record<string, unknown>;
    return [
      'title',
      'topic',
      'sourceText',
      'hashtagText',
      'hashtags',
      'reusableText',
      'variants',
    ].some((key) => {
      const entry = input[key];
      return Array.isArray(entry)
        ? entry.length > 0
        : !!this.cleanText(entry, 20);
    });
  }

  private mergeByKey<T>(items: T[], keyFor: (item: T) => string) {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const item of items) {
      const key = keyFor(item).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
    return merged;
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
    const content = this.cleanText(record.content, 5000);
    if (!platform || !content) {
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
      hashtags: this.cleanHashtags(record.hashtags, 30),
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
      notes: this.cleanStringArray(record.notes, 8, 180),
    };
  }

  private cleanHashtags(value: unknown, maxItems: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\s,\n|]+/)
        : [];
    return this.uniqueHashtags(
      raw
        .map((item) => this.cleanText(item, 80))
        .filter(Boolean)
        .map((tag) => tag.replace(/^#+/, ''))
        .map((tag) => tag.replace(/[^\p{L}\p{N}_]/gu, ''))
        .filter(Boolean)
        .map((tag) => `#${tag}`)
    ).slice(0, maxItems);
  }

  private extractHashtags(value: string) {
    return this.uniqueHashtags(value.match(/#[\p{L}\p{N}_-]+/gu) || []);
  }

  private uniqueHashtags(value: unknown[]) {
    const seen = new Set<string>();
    const hashtags: string[] = [];
    for (const item of value) {
      const tag = this.cleanText(item, 80).replace(/^#+/, '');
      const normalized = tag.replace(/[^\p{L}\p{N}_]/gu, '');
      if (!normalized) {
        continue;
      }
      const next = `#${normalized}`;
      const key = next.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hashtags.push(next);
    }
    return hashtags;
  }

  private cleanMentions(value: unknown, maxItems: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\s,\n|]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, 80).replace(/^@+/, ''))
          .map((item) => item.replace(/[^\p{L}\p{N}_.-]/gu, ''))
          .filter(Boolean)
          .map((item) => `@${item}`)
      ),
    ].slice(0, maxItems);
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n| ]+/)
        : [];
    return this.uniquePlatforms(
      raw
        .map((item) => this.cleanPlatform(item))
        .filter((item): item is SnapsTargetPlatform => !!item)
    ).slice(0, 10);
  }

  private uniquePlatforms(platforms: SnapsTargetPlatform[]) {
    return [...new Set(platforms)];
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = String(value || '').trim().toLowerCase();
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanPlacement(value: unknown, fallback = true): SnapsHashtagSetPlacement | undefined {
    const placement = String(value || '').trim().toLowerCase();
    if (placement === 'first-comment' || placement === 'caption') {
      return placement;
    }
    return fallback ? 'caption' : undefined;
  }

  private cleanStrategy(value: unknown): SnapsHashtagSetStrategy {
    const strategy = String(value || '').trim().toLowerCase();
    return ['balanced', 'reach', 'community', 'campaign'].includes(strategy)
      ? (strategy as SnapsHashtagSetStrategy)
      : 'balanced';
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, maxLength))
          .filter(Boolean)
      ),
    ].slice(0, maxItems);
  }

  private cleanReusableText(value: unknown, maxLength: number) {
    return this.cleanText(value, maxLength)
      .replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private extractReusableText(value: unknown) {
    if (typeof value !== 'string') {
      return '';
    }
    return this.cleanReusableText(value, 500);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value)
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
        .slice(0, maxLength);
    }
    return '';
  }

  private cleanIso(value: unknown) {
    const text = this.cleanText(value, 80);
    return text && !Number.isNaN(new Date(text).getTime()) ? text : '';
  }

  private firstVariantTitle(variants: SnapsVariant[]) {
    return variants.map((variant) => variant.title).find(Boolean) || '';
  }

  private extractTopic(value: string) {
    return (
      value
        .split(/[.!?\n。！？]/)
        .map((line) => this.cleanText(line, 120))
        .find((line) => line.length >= 4) || ''
    );
  }

  private hashtagLimit(platform: SnapsTargetPlatform) {
    return snapsPlatformRules[platform]?.hashtagLimit || 6;
  }

  private limitForPlatform(platform: SnapsTargetPlatform, hashtags: string[]) {
    return this.uniqueHashtags(hashtags).slice(0, this.hashtagLimit(platform));
  }

  private mergeBlocks(first: string, second: string, maxLength: number) {
    const blocks = [first, second].filter(Boolean);
    return blocks.join('\n\n').trim().slice(0, maxLength);
  }

  private appendToCaption(content: string, block: string, platform: SnapsTargetPlatform) {
    if (!block) {
      return content;
    }
    const normalized = this.cleanText(content, snapsPlatformRules[platform].maxLength);
    const compactBlock = this.cleanText(block, 1200);
    const existing = normalized.toLowerCase();
    const missingLines = compactBlock
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter((line) => line && !existing.includes(line.toLowerCase()));
    if (!missingLines.length) {
      return normalized;
    }
    return `${normalized}\n\n${missingLines.join('\n\n')}`.slice(
      0,
      snapsPlatformRules[platform].maxLength
    );
  }
}
