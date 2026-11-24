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

export type SnapsPostConditionType =
  | 'above-average'
  | 'delay'
  | 'likes'
  | 'retweets'
  | 'comments'
  | 'impressions'
  | 'engagement-rate';

export type SnapsPostConditionRequest = {
  parentTitle?: unknown;
  parentUrl?: unknown;
  parentPlatform?: unknown;
  parentPublishedAt?: unknown;
  followUpTitle?: unknown;
  followUpText?: unknown;
  conditionType?: unknown;
  threshold?: unknown;
  delayMinutes?: unknown;
  targetPlatforms?: unknown;
  cta?: unknown;
  tags?: unknown;
  metrics?: unknown;
  baseline?: unknown;
};

export type SnapsPostConditionDecisionStatus =
  | 'ready'
  | 'waiting'
  | 'blocked';

export type SnapsPostConditionMetrics = {
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
  engagementRate: number;
};

export type SnapsPostConditionBaseline = {
  averageImpressions: number;
  averageEngagementRate: number;
};

export type SnapsPostConditionItem = {
  title: string;
  sourceText: string;
  parentTitle: string;
  parentUrl?: string;
  parentPlatform: SnapsTargetPlatform;
  conditionType: SnapsPostConditionType;
  conditionSummary: string;
  triggerMet: boolean;
  recommendedPublishDate?: string;
  platforms: SnapsTargetPlatform[];
  cta?: string;
  tags: string[];
  warnings: string[];
  status: SnapsPostConditionDecisionStatus;
};

export type SnapsPostConditionPreview = {
  product: 'snaps';
  source: 'snaps-post-condition';
  conditionType: SnapsPostConditionType;
  status: SnapsPostConditionDecisionStatus;
  triggerMet: boolean;
  conditionSummary: string;
  metricValue: number;
  threshold: number;
  delayMinutes: number;
  elapsedMinutes?: number;
  recommendedPublishDate?: string;
  item: SnapsPostConditionItem;
  metrics: SnapsPostConditionMetrics;
  baseline: SnapsPostConditionBaseline;
  warnings: string[];
};

@Injectable()
export class SnapsPostConditionService {
  readonly sampleParent = [
    '부모 게시물: AI 콘텐츠 운영 체크리스트',
    '성과: 좋아요 120, 댓글 18, 노출 4200, 참여율 4.2%',
    '후속: 15분 뒤 상담/자료 링크를 댓글 또는 스레드 답글로 붙입니다.',
  ].join('\n');

  preview(body?: SnapsPostConditionRequest): SnapsPostConditionPreview {
    const request = body || {};
    const parentTitle =
      this.cleanText(request.parentTitle, 160) || 'snaps parent post';
    const parentUrl = this.cleanOptionalUrl(request.parentUrl) || undefined;
    const parentPlatform = this.cleanPlatform(request.parentPlatform) || 'threads';
    const followUpText = cleanSnapsMultilineText(request.followUpText, 50000);
    if (followUpText.length < 5) {
      throw new BadRequestException('followUpText is required for post conditions.');
    }

    const conditionType = this.cleanConditionType(request.conditionType);
    const threshold = this.defaultThreshold(conditionType, request.threshold);
    const delayMinutes = this.clampNumber(request.delayMinutes, 45, 0, 10080);
    const metrics = this.cleanMetrics(request.metrics);
    const baseline = this.cleanBaseline(request.baseline);
    const parentPublishedAt = this.cleanDate(request.parentPublishedAt);
    const now = new Date();
    const elapsedMinutes = parentPublishedAt
      ? Math.max(0, Math.floor((now.getTime() - parentPublishedAt.getTime()) / 60000))
      : undefined;
    const warnings: string[] = [];
    const metricValue = this.metricValue(conditionType, metrics, baseline);

    if (
      conditionType !== 'delay' &&
      conditionType !== 'above-average' &&
      metricValue <= 0
    ) {
      warnings.push('Condition metric is missing or zero.');
    }
    if (conditionType === 'delay' && !parentPublishedAt) {
      warnings.push('parentPublishedAt is required for delay conditions.');
    }
    if (
      conditionType === 'above-average' &&
      (!baseline.averageImpressions || !baseline.averageEngagementRate)
    ) {
      warnings.push('Average impressions and engagement rate are required for above-average conditions.');
    }

    const triggerMet = this.evaluate({
      conditionType,
      threshold,
      delayMinutes,
      metrics,
      baseline,
      elapsedMinutes,
    });
    const recommendedPublishDate = this.recommendedPublishDate(
      conditionType,
      parentPublishedAt,
      delayMinutes,
      triggerMet
    );
    const status: SnapsPostConditionDecisionStatus = triggerMet
      ? 'ready'
      : warnings.length
        ? 'blocked'
        : 'waiting';
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const cta = this.cleanText(request.cta, 180) || undefined;
    const tags = this.cleanTags(request.tags);
    const conditionSummary = this.conditionSummary({
      conditionType,
      threshold,
      delayMinutes,
      metricValue,
      triggerMet,
      elapsedMinutes,
      baseline,
    });
    const title =
      this.cleanText(request.followUpTitle, 160) ||
      `${parentTitle} · conditional follow-up`;
    const itemWarnings = [
      ...warnings,
      ...(snapsPlatformRules[parentPlatform].publishMode === 'assist'
        ? [`${snapsPlatformRules[parentPlatform].label} is assist-only and may need manual follow-up.`]
        : []),
    ];
    const item: SnapsPostConditionItem = {
      title,
      sourceText: this.decorateSourceText({
        title,
        followUpText,
        parentTitle,
        parentUrl,
        parentPlatform,
        conditionSummary,
        triggerMet,
        cta,
      }),
      parentTitle,
      parentUrl,
      parentPlatform,
      conditionType,
      conditionSummary,
      triggerMet,
      recommendedPublishDate,
      platforms: platforms.length ? platforms : [parentPlatform],
      cta,
      tags,
      warnings: itemWarnings,
      status,
    };

    return {
      product: 'snaps',
      source: 'snaps-post-condition',
      conditionType,
      status,
      triggerMet,
      conditionSummary,
      metricValue,
      threshold,
      delayMinutes,
      elapsedMinutes,
      recommendedPublishDate,
      item,
      metrics,
      baseline,
      warnings: itemWarnings,
    };
  }

  toSourceInput(item: SnapsPostConditionItem): SnapsSourceLibraryInputDto {
    return {
      title: item.title,
      sourceText: item.sourceText,
      topic: item.conditionType,
      sourcePlatform: 'post-condition',
      tags: [
        'post-condition',
        item.conditionType,
        item.status,
        ...item.platforms,
        ...item.tags,
      ],
    };
  }

  toVariants(item: SnapsPostConditionItem): SnapsVariant[] {
    if (!item.triggerMet || item.status !== 'ready') {
      return [];
    }

    return item.platforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      return {
        platform,
        label: rule.label,
        title: item.title,
        content: fitSnapsContent(platform, this.decorateVariantContent(item, rule.maxLength)),
        hashtags: this.toHashtags(
          [item.conditionType, ...item.tags],
          rule.hashtagLimit
        ),
        settings: {
          source: 'snaps-post-condition',
          conditionType: item.conditionType,
          parentUrl: item.parentUrl,
          parentPlatform: item.parentPlatform,
          subject: item.title,
        },
        publishMode: rule.publishMode,
        notes: [
          item.conditionSummary,
          item.recommendedPublishDate
            ? `recommendedPublishDate: ${item.recommendedPublishDate}`
            : '',
        ].filter(Boolean),
      };
    });
  }

  private evaluate(input: {
    conditionType: SnapsPostConditionType;
    threshold: number;
    delayMinutes: number;
    metrics: SnapsPostConditionMetrics;
    baseline: SnapsPostConditionBaseline;
    elapsedMinutes?: number;
  }) {
    if (input.conditionType === 'delay') {
      return typeof input.elapsedMinutes === 'number'
        ? input.elapsedMinutes >= input.delayMinutes
        : false;
    }
    if (input.conditionType === 'above-average') {
      return (
        input.metrics.impressions >= input.baseline.averageImpressions * 1.1 &&
        input.metrics.engagementRate >= input.baseline.averageEngagementRate
      );
    }
    return this.metricValue(input.conditionType, input.metrics, input.baseline) >= input.threshold;
  }

  private metricValue(
    conditionType: SnapsPostConditionType,
    metrics: SnapsPostConditionMetrics,
    baseline: SnapsPostConditionBaseline
  ) {
    if (conditionType === 'likes') {
      return metrics.likes;
    }
    if (conditionType === 'retweets') {
      return metrics.retweets;
    }
    if (conditionType === 'comments') {
      return metrics.comments;
    }
    if (conditionType === 'impressions') {
      return metrics.impressions;
    }
    if (conditionType === 'engagement-rate') {
      return metrics.engagementRate;
    }
    if (conditionType === 'above-average') {
      return Math.min(
        baseline.averageImpressions
          ? metrics.impressions / baseline.averageImpressions
          : 0,
        baseline.averageEngagementRate
          ? metrics.engagementRate / baseline.averageEngagementRate
          : 0
      );
    }
    return 0;
  }

  private conditionSummary(input: {
    conditionType: SnapsPostConditionType;
    threshold: number;
    delayMinutes: number;
    metricValue: number;
    triggerMet: boolean;
    elapsedMinutes?: number;
    baseline: SnapsPostConditionBaseline;
  }) {
    if (input.conditionType === 'delay') {
      return `Delay ${input.delayMinutes}m, elapsed ${input.elapsedMinutes ?? 0}m: ${
        input.triggerMet ? 'ready' : 'waiting'
      }`;
    }
    if (input.conditionType === 'above-average') {
      return `Above-average check against impressions ${input.baseline.averageImpressions} and engagement ${input.baseline.averageEngagementRate}%: ${
        input.triggerMet ? 'ready' : 'waiting'
      }`;
    }
    return `${input.conditionType} ${input.metricValue} / ${input.threshold}: ${
      input.triggerMet ? 'ready' : 'waiting'
    }`;
  }

  private recommendedPublishDate(
    conditionType: SnapsPostConditionType,
    parentPublishedAt: Date | undefined,
    delayMinutes: number,
    triggerMet: boolean
  ) {
    if (conditionType === 'delay' && parentPublishedAt) {
      const date = new Date(parentPublishedAt);
      date.setMinutes(date.getMinutes() + delayMinutes);
      return date.toISOString();
    }
    return triggerMet ? new Date().toISOString() : undefined;
  }

  private decorateSourceText(input: {
    title: string;
    followUpText: string;
    parentTitle: string;
    parentUrl?: string;
    parentPlatform: SnapsTargetPlatform;
    conditionSummary: string;
    triggerMet: boolean;
    cta?: string;
  }) {
    return [
      input.followUpText,
      input.cta ? `CTA: ${input.cta}` : '',
      '',
      `Parent: ${input.parentTitle}`,
      input.parentUrl ? `Parent URL: ${input.parentUrl}` : '',
      `Parent platform: ${input.parentPlatform}`,
      `Condition: ${input.conditionSummary}`,
      `Trigger: ${input.triggerMet ? 'ready' : 'waiting'}`,
    ].filter(Boolean).join('\n');
  }

  private decorateVariantContent(item: SnapsPostConditionItem, maxLength: number) {
    const lines = [
      item.sourceText.split('Parent:')[0].trim(),
      item.cta ? `\n${item.cta}` : '',
    ].filter(Boolean);
    return lines.join('\n').slice(0, Math.max(0, maxLength));
  }

  private cleanConditionType(value: unknown): SnapsPostConditionType {
    return value === 'delay' ||
      value === 'likes' ||
      value === 'retweets' ||
      value === 'comments' ||
      value === 'impressions' ||
      value === 'engagement-rate'
      ? value
      : 'above-average';
  }

  private defaultThreshold(conditionType: SnapsPostConditionType, value: unknown) {
    const fallback =
      conditionType === 'engagement-rate'
        ? 3.5
        : conditionType === 'impressions'
          ? 1000
          : conditionType === 'comments'
            ? 10
            : conditionType === 'retweets'
              ? 10
              : conditionType === 'likes'
                ? 50
                : 0;
    return this.clampNumber(value, fallback, 0, 100000000);
  }

  private cleanMetrics(value: unknown): SnapsPostConditionMetrics {
    const record = this.asRecord(value);
    const likes = this.clampNumber(record.likes, 0, 0, 100000000);
    const retweets = this.clampNumber(record.retweets, 0, 0, 100000000);
    const comments = this.clampNumber(record.comments, 0, 0, 100000000);
    const impressions = this.clampNumber(record.impressions, 0, 0, 100000000);
    const engagementRate =
      this.clampNumber(record.engagementRate, 0, 0, 100) ||
      (impressions ? ((likes + retweets + comments) / impressions) * 100 : 0);
    return {
      likes,
      retweets,
      comments,
      impressions,
      engagementRate: Number(engagementRate.toFixed(2)),
    };
  }

  private cleanBaseline(value: unknown): SnapsPostConditionBaseline {
    const record = this.asRecord(value);
    return {
      averageImpressions: this.clampNumber(record.averageImpressions, 0, 0, 100000000),
      averageEngagementRate: this.clampNumber(record.averageEngagementRate, 0, 0, 100),
    };
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const values = this.toStringList(value, 40)
      .map((item) => item.toLowerCase())
      .filter((item): item is SnapsTargetPlatform =>
        snapsTargetPlatforms.includes(item as SnapsTargetPlatform)
      );
    return [...new Set(values)];
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const raw = this.cleanText(value, 80).toLowerCase();
    return snapsTargetPlatforms.includes(raw as SnapsTargetPlatform)
      ? (raw as SnapsTargetPlatform)
      : undefined;
  }

  private cleanTags(value: unknown) {
    return this.toStringList(value, 40).slice(0, 12);
  }

  private toHashtags(values: string[], limit: number) {
    const tags = values
      .map((tag) => this.cleanText(tag, 40))
      .filter(Boolean)
      .map((tag) => `#${tag.replace(/^#/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '')}`)
      .filter((tag) => tag.length > 1);
    return [...new Set(tags)].slice(0, Math.max(0, limit));
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

  private cleanOptionalUrl(value: unknown) {
    const raw = this.cleanText(value, 2000);
    if (!raw) {
      return '';
    }
    try {
      const url = new URL(raw);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  private cleanDate(value: unknown) {
    const raw = this.cleanText(value, 120);
    if (!raw) {
      return undefined;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
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
    return Math.min(max, Math.max(min, numeric));
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
