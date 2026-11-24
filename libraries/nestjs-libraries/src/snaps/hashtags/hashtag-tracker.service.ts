import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsHashtagSetInput,
  SnapsHashtagSetPlacement,
  SnapsHashtagSetStrategy,
} from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-set.service';

export type SnapsHashtagTrackerGoal =
  | 'reach'
  | 'engagement'
  | 'saves'
  | 'clicks'
  | 'community';

export type SnapsHashtagTrackerRequest = {
  title?: unknown;
  topic?: unknown;
  sourceText?: unknown;
  goal?: unknown;
  hashtagText?: unknown;
  hashtags?: unknown;
  metrics?: unknown;
  importText?: unknown;
  targetPlatforms?: unknown;
  variants?: unknown;
  maxHashtags?: unknown;
};

export type SnapsHashtagTrackerSaveRequest = SnapsHashtagTrackerRequest & {
  setTitle?: unknown;
  placement?: unknown;
};

export type SnapsHashtagTrackerSource = 'metric' | 'variant' | 'generated';
export type SnapsHashtagTrackerTrend = 'rising' | 'steady' | 'watch' | 'fatigue';
export type SnapsHashtagTrackerAction = 'keep' | 'test' | 'replace';

export type SnapsHashtagTrackerItem = {
  hashtag: string;
  source: SnapsHashtagTrackerSource;
  platforms: SnapsTargetPlatform[];
  posts: number;
  impressions: number;
  engagements: number;
  comments: number;
  saves: number;
  clicks: number;
  engagementRate: number;
  score: number;
  trend: SnapsHashtagTrackerTrend;
  action: SnapsHashtagTrackerAction;
  reason: string;
  suggestedPairings: string[];
};

export type SnapsHashtagTrackerPreview = {
  product: 'snaps';
  source: 'snaps-hashtag-tracker';
  title: string;
  topic: string;
  goal: SnapsHashtagTrackerGoal;
  targetPlatforms: SnapsTargetPlatform[];
  totalHashtags: number;
  trackedHashtags: number;
  bestHashtag: string;
  averageEngagementRate: number;
  items: SnapsHashtagTrackerItem[];
  warnings: string[];
  recommendations: string[];
};

type MetricRow = {
  hashtag: string;
  platform?: SnapsTargetPlatform;
  posts: number;
  impressions: number;
  engagements: number;
  comments: number;
  saves: number;
  clicks: number;
};

const trackerPlatforms: SnapsTargetPlatform[] = ['instagram', 'x'];

@Injectable()
export class SnapsHashtagTrackerService {
  preview(body?: SnapsHashtagTrackerRequest): SnapsHashtagTrackerPreview {
    const request = body || {};
    const variants = this.cleanVariants(request.variants);
    const targetPlatforms = this.resolvePlatforms(request.targetPlatforms, variants);
    const sourceText = this.cleanText(request.sourceText, 5000);
    const topic =
      this.cleanText(request.topic, 140) ||
      this.firstVariantTitle(variants) ||
      this.extractTopic(sourceText) ||
      'snaps hashtag tracker';
    const title =
      this.cleanText(request.title, 140) || `${topic} hashtag tracker`;
    const goal = this.cleanGoal(request.goal);
    const metricRows = this.parseMetricRows(request.metrics, request.importText);
    const explicitHashtags = this.uniqueHashtags([
      ...this.cleanHashtags(request.hashtags, 60),
      ...this.cleanHashtags(request.hashtagText, 60),
      ...this.extractHashtags(sourceText),
      ...variants.flatMap((variant) => variant.hashtags || []),
      ...metricRows.map((row) => row.hashtag),
    ]);
    const maxHashtags = this.cleanNumber(request.maxHashtags, 5, 24) || 12;
    const hashtags = explicitHashtags.length
      ? explicitHashtags
      : this.generatedHashtags(topic, sourceText, targetPlatforms);
    if (!hashtags.length) {
      throw new BadRequestException('hashtag tracker needs hashtags, metrics, variants, topic, or source text.');
    }

    const items = hashtags
      .map((hashtag) =>
        this.scoreHashtag({
          hashtag,
          rows: metricRows.filter(
            (row) => row.hashtag.toLowerCase() === hashtag.toLowerCase()
          ),
          targetPlatforms,
          variants,
          topic,
          goal,
        })
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHashtags);
    const trackedHashtags = items.filter((item) => item.source === 'metric').length;
    const warnings: string[] = [];

    if (!metricRows.length) {
      warnings.push('No hashtag performance metrics were supplied, so snaps used caption, variant, and platform-planning estimates.');
    }
    if (!targetPlatforms.some((platform) => trackerPlatforms.includes(platform))) {
      warnings.push('Metricool-style hashtag tracking is strongest for Instagram and X/Twitter; other channels use planning estimates.');
    }

    return {
      product: 'snaps',
      source: 'snaps-hashtag-tracker',
      title,
      topic,
      goal,
      targetPlatforms,
      totalHashtags: items.length,
      trackedHashtags,
      bestHashtag: items[0]?.hashtag || '',
      averageEngagementRate: this.round(
        items.reduce((sum, item) => sum + item.engagementRate, 0) /
          Math.max(1, items.length),
        2
      ),
      items,
      warnings,
      recommendations: this.recommendations(items, goal, targetPlatforms),
    };
  }

  toHashtagSetInput(
    preview: SnapsHashtagTrackerPreview,
    body?: SnapsHashtagTrackerSaveRequest
  ): SnapsHashtagSetInput {
    const selected = preview.items
      .filter((item) => item.action !== 'replace')
      .slice(0, 12);
    const fallback = preview.items.slice(0, 8);
    const hashtags = (selected.length ? selected : fallback).map((item) => item.hashtag);
    if (!hashtags.length) {
      throw new BadRequestException('hashtag tracker did not produce hashtags to save.');
    }
    return {
      title:
        this.cleanText(body?.setTitle, 140) ||
        `${preview.topic} tracked hashtags`,
      description: `Tracked hashtag set from ${preview.title}`,
      topic: preview.topic,
      hashtagText: hashtags.join(' '),
      hashtags,
      reusableText: preview.recommendations[0] || '',
      tags: ['tracked', preview.goal, 'hashtag-performance'],
      strategy: this.strategyForGoal(preview.goal),
      placement: this.cleanPlacement(body?.placement),
      targetPlatforms: preview.targetPlatforms,
      source: 'snaps-hashtag-tracker',
    };
  }

  private scoreHashtag(input: {
    hashtag: string;
    rows: MetricRow[];
    targetPlatforms: SnapsTargetPlatform[];
    variants: SnapsVariant[];
    topic: string;
    goal: SnapsHashtagTrackerGoal;
  }): SnapsHashtagTrackerItem {
    const rows = input.rows;
    const source: SnapsHashtagTrackerSource = rows.length
      ? 'metric'
      : input.variants.some((variant) =>
          (variant.hashtags || []).some(
            (tag) => tag.toLowerCase() === input.hashtag.toLowerCase()
          )
        )
        ? 'variant'
        : 'generated';
    const posts =
      rows.reduce((sum, row) => sum + row.posts, 0) ||
      (source === 'variant' ? 2 : 1);
    const impressions =
      rows.reduce((sum, row) => sum + row.impressions, 0) ||
      this.estimatedImpressions(input.hashtag, input.topic, input.targetPlatforms);
    const comments = rows.reduce((sum, row) => sum + row.comments, 0);
    const saves = rows.reduce((sum, row) => sum + row.saves, 0);
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const engagements =
      rows.reduce((sum, row) => sum + row.engagements, 0) ||
      this.estimatedEngagements(input.hashtag, impressions, source);
    const engagementRate = this.round((engagements / Math.max(1, impressions)) * 100, 2);
    const goalBoost = this.goalBoost({
      goal: input.goal,
      impressions,
      engagements,
      comments,
      saves,
      clicks,
      posts,
    });
    const fatiguePenalty = posts > 80 && engagementRate < 1.5 ? 18 : posts > 140 ? 10 : 0;
    const score = this.clamp(
      engagementRate * 11 +
        Math.log10(impressions + 10) * 8 +
        goalBoost +
        (source === 'metric' ? 8 : source === 'variant' ? 4 : 0) -
        fatiguePenalty,
      1,
      100
    );
    const trend = this.trend(score, posts, engagementRate);
    const action: SnapsHashtagTrackerAction =
      score >= 72 ? 'keep' : score >= 48 ? 'test' : 'replace';

    return {
      hashtag: input.hashtag,
      source,
      platforms: this.rowPlatforms(rows, input.targetPlatforms),
      posts,
      impressions,
      engagements,
      comments,
      saves,
      clicks,
      engagementRate,
      score: this.round(score, 1),
      trend,
      action,
      reason: this.reason({ source, action, trend, engagementRate, posts, goal: input.goal }),
      suggestedPairings: this.suggestedPairings(input.hashtag, input.targetPlatforms),
    };
  }

  private recommendations(
    items: SnapsHashtagTrackerItem[],
    goal: SnapsHashtagTrackerGoal,
    targetPlatforms: SnapsTargetPlatform[]
  ) {
    const keep = items.filter((item) => item.action === 'keep').slice(0, 5);
    const replace = items.filter((item) => item.action === 'replace').slice(0, 3);
    return [
      keep.length
        ? `Keep ${keep.map((item) => item.hashtag).join(' ')} for ${goal} campaigns.`
        : 'No clear keep winner yet; run the top test tags in the next two posts.',
      replace.length
        ? `Replace or cap ${replace.map((item) => item.hashtag).join(' ')} before the next queue.`
        : 'No low-score hashtag needs immediate removal.',
      targetPlatforms.some((platform) => trackerPlatforms.includes(platform))
        ? 'For live tracking, keep Instagram and X/Twitter hashtags in separate sessions when you need platform-specific reports.'
        : 'Use these as planning suggestions until connected platform metrics are available.',
    ];
  }

  private parseMetricRows(metrics: unknown, importText: unknown): MetricRow[] {
    return [
      ...this.parseMetricValue(metrics),
      ...this.parseMetricText(this.cleanText(importText, 12000)),
    ].filter((row) => !!row.hashtag);
  }

  private parseMetricValue(value: unknown): MetricRow[] {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeMetricRow(item)).filter(Boolean) as MetricRow[];
    }
    if (typeof value === 'string') {
      const text = this.cleanText(value, 12000);
      if (!text) {
        return [];
      }
      try {
        return this.parseMetricValue(JSON.parse(text));
      } catch {
        return this.parseMetricText(text);
      }
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const items = record.items || record.hashtags || record.metrics || record.rows;
      if (Array.isArray(items)) {
        return this.parseMetricValue(items);
      }
      const row = this.normalizeMetricRow(value);
      return row ? [row] : [];
    }
    return [];
  }

  private parseMetricText(text: string): MetricRow[] {
    if (!text) {
      return [];
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      return [];
    }
    const [first, ...rest] = lines;
    const headers = this.splitCsvLine(first).map((header) =>
      header.trim().toLowerCase()
    );
    const hasHeader = headers.some((header) =>
      ['hashtag', 'tag', 'impressions', 'reach', 'engagement', 'likes'].includes(header)
    );
    if (!hasHeader) {
      return lines.flatMap((line) =>
        this.cleanHashtags(line, 30).map((hashtag) => ({
          hashtag,
          posts: 1,
          impressions: 0,
          engagements: 0,
          comments: 0,
          saves: 0,
          clicks: 0,
        }))
      );
    }
    return rest
      .map((line) => {
        const values = this.splitCsvLine(line);
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });
        return this.normalizeMetricRow(record);
      })
      .filter(Boolean) as MetricRow[];
  }

  private normalizeMetricRow(value: unknown): MetricRow | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const hashtag = this.cleanHashtags(
      record.hashtag || record.tag || record.keyword || record.name,
      1
    )[0];
    if (!hashtag) {
      return undefined;
    }
    const likes = this.numberFrom(record.likes || record.likeCount);
    const comments = this.numberFrom(record.comments || record.commentCount);
    const saves = this.numberFrom(record.saves || record.saveCount);
    const shares = this.numberFrom(record.shares || record.shareCount);
    const clicks = this.numberFrom(record.clicks || record.linkClicks);
    const explicitEngagements = this.numberFrom(
      record.engagements || record.engagement || record.interactions
    );
    return {
      hashtag,
      platform: this.cleanPlatform(record.platform),
      posts: this.numberFrom(record.posts || record.uses || record.count) || 1,
      impressions:
        this.numberFrom(record.impressions || record.reach || record.views) || 0,
      engagements:
        explicitEngagements || likes + comments + saves + shares + clicks,
      comments,
      saves,
      clicks,
    };
  }

  private splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values;
  }

  private resolvePlatforms(value: unknown, variants: SnapsVariant[]) {
    const requested = this.cleanPlatforms(value);
    if (requested.length) {
      return requested;
    }
    const variantPlatforms = this.uniquePlatforms(variants.map((variant) => variant.platform));
    return variantPlatforms.length
      ? variantPlatforms
      : (['instagram', 'x'] as SnapsTargetPlatform[]);
  }

  private rowPlatforms(rows: MetricRow[], fallback: SnapsTargetPlatform[]) {
    const platforms = this.uniquePlatforms(
      rows.map((row) => row.platform).filter((platform): platform is SnapsTargetPlatform => !!platform)
    );
    return platforms.length ? platforms : fallback.slice(0, 3);
  }

  private generatedHashtags(
    topic: string,
    sourceText: string,
    targetPlatforms: SnapsTargetPlatform[]
  ) {
    const defaults = targetPlatforms.flatMap(
      (platform) => snapsPlatformRules[platform]?.defaultHashtags || []
    );
    const keywords = this.keywords(`${topic} ${sourceText}`).map((keyword) => `#${keyword}`);
    return this.uniqueHashtags([...defaults, ...keywords, '#SNS운영', '#콘텐츠전략']).slice(0, 18);
  }

  private estimatedImpressions(
    hashtag: string,
    topic: string,
    platforms: SnapsTargetPlatform[]
  ) {
    const compact = hashtag.replace(/^#/, '');
    const topicHit = topic.toLowerCase().includes(compact.toLowerCase()) ? 1.2 : 1;
    const platformBoost = platforms.some((platform) => trackerPlatforms.includes(platform))
      ? 1.15
      : 1;
    const lengthBoost = compact.length >= 4 && compact.length <= 14 ? 1.1 : 0.9;
    return Math.round(420 * topicHit * platformBoost * lengthBoost);
  }

  private estimatedEngagements(
    hashtag: string,
    impressions: number,
    source: SnapsHashtagTrackerSource
  ) {
    const compact = hashtag.replace(/^#/, '');
    const baseRate = source === 'variant' ? 0.042 : 0.032;
    const clarityBoost = compact.length >= 3 && compact.length <= 16 ? 1.12 : 0.86;
    return Math.max(1, Math.round(impressions * baseRate * clarityBoost));
  }

  private goalBoost(input: {
    goal: SnapsHashtagTrackerGoal;
    impressions: number;
    engagements: number;
    comments: number;
    saves: number;
    clicks: number;
    posts: number;
  }) {
    if (input.goal === 'reach') {
      return Math.log10(input.impressions + 10) * 8;
    }
    if (input.goal === 'saves') {
      return input.saves * 1.8;
    }
    if (input.goal === 'clicks') {
      return input.clicks * 2.2;
    }
    if (input.goal === 'community') {
      return input.comments * 2 + Math.min(12, input.posts / 3);
    }
    return Math.log10(input.engagements + 10) * 10;
  }

  private trend(score: number, posts: number, engagementRate: number): SnapsHashtagTrackerTrend {
    if (posts > 80 && engagementRate < 1.5) {
      return 'fatigue';
    }
    if (score >= 72 && engagementRate >= 3) {
      return 'rising';
    }
    if (score >= 48) {
      return 'steady';
    }
    return 'watch';
  }

  private reason(input: {
    source: SnapsHashtagTrackerSource;
    action: SnapsHashtagTrackerAction;
    trend: SnapsHashtagTrackerTrend;
    engagementRate: number;
    posts: number;
    goal: SnapsHashtagTrackerGoal;
  }) {
    const sourceLabel =
      input.source === 'metric'
        ? 'historical metrics'
        : input.source === 'variant'
          ? 'current draft usage'
          : 'planning estimate';
    if (input.action === 'keep') {
      return `${sourceLabel} supports keeping it for ${input.goal}; engagement rate ${input.engagementRate}%.`;
    }
    if (input.trend === 'fatigue') {
      return `${sourceLabel} shows high use with weak engagement; cap or rotate it.`;
    }
    if (input.action === 'test') {
      return `${sourceLabel} is promising but needs another post or session before it becomes a winner.`;
    }
    return `${sourceLabel} is below the current campaign threshold; replace it with a clearer niche tag.`;
  }

  private suggestedPairings(
    hashtag: string,
    platforms: SnapsTargetPlatform[]
  ) {
    const normalized = hashtag.replace(/^#/, '');
    const defaults = platforms.flatMap(
      (platform) => snapsPlatformRules[platform]?.defaultHashtags || []
    );
    return this.uniqueHashtags([
      hashtag,
      ...defaults,
      `#${normalized}팁`,
      `#${normalized}사례`,
    ]).slice(0, 4);
  }

  private strategyForGoal(goal: SnapsHashtagTrackerGoal): SnapsHashtagSetStrategy {
    if (goal === 'reach') {
      return 'reach';
    }
    if (goal === 'community') {
      return 'community';
    }
    if (goal === 'clicks') {
      return 'campaign';
    }
    return 'balanced';
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
      label: this.cleanText(record.label, 80) || snapsPlatformRules[platform].label,
      title: this.cleanText(record.title, 140) || undefined,
      content,
      hashtags: this.cleanHashtags(record.hashtags, 30),
      settings:
        record.settings && typeof record.settings === 'object'
          ? (record.settings as Record<string, unknown>)
          : { __type: platform },
      publishMode: snapsPlatformRules[platform]?.publishMode || 'schedule',
      notes: [],
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
    const normalized = String(value || '').trim().toLowerCase();
    const aliases: Record<string, SnapsTargetPlatform> = {
      twitter: 'x',
      xcom: 'x',
      facebook: 'facebook',
      fb: 'facebook',
      instagram: 'instagram',
      ig: 'instagram',
    };
    const platform = aliases[normalized] || normalized;
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanGoal(value: unknown): SnapsHashtagTrackerGoal {
    const goal = String(value || '').trim().toLowerCase();
    return ['reach', 'engagement', 'saves', 'clicks', 'community'].includes(goal)
      ? (goal as SnapsHashtagTrackerGoal)
      : 'engagement';
  }

  private cleanPlacement(value: unknown): SnapsHashtagSetPlacement {
    const placement = String(value || '').trim().toLowerCase();
    return placement === 'first-comment' ? 'first-comment' : 'caption';
  }

  private cleanNumber(value: unknown, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private numberFrom(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[,%\s]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
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
          .filter((token) => !/^\d+$/.test(token))
          .map((token) => token.replace(/[^\p{L}\p{N}_]/gu, ''))
          .filter(Boolean)
      ),
    ].slice(0, 8);
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

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
