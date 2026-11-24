import { BadRequestException, Injectable } from '@nestjs/common';
import type { SnapsMediaAssetInput } from '@gitroom/nestjs-libraries/snaps/media/media-asset.service';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsCreativeBriefMediaType = 'image' | 'video' | 'gif' | 'carousel';

export type SnapsCreativeBriefAspectRatio =
  | 'square'
  | 'portrait'
  | 'story'
  | 'landscape';

export type SnapsCreativeBriefRequest = {
  sourceText?: unknown;
  title?: unknown;
  topic?: unknown;
  campaign?: unknown;
  mediaType?: unknown;
  aspectRatio?: unknown;
  visualStyle?: unknown;
  brandColor?: unknown;
  accentColor?: unknown;
  cta?: unknown;
  targetPlatforms?: unknown;
  referenceUrls?: unknown;
  variants?: unknown;
};

export type SnapsCreativeBriefSaveRequest = SnapsCreativeBriefRequest & {
  itemId?: unknown;
};

export type SnapsCreativeBriefItem = {
  id: string;
  angle: 'hero' | 'proof' | 'cta';
  mediaType: SnapsCreativeBriefMediaType;
  aspectRatio: SnapsCreativeBriefAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  title: string;
  overlayText: string;
  prompt: string;
  altText: string;
  captionSeed: string;
  productionNotes: string[];
  storyboard: string[];
  referenceUrls: string[];
  svg: string;
  svgDataUrl: string;
  warnings: string[];
};

export type SnapsCreativeBriefPreview = {
  product: 'snaps';
  source: 'snaps-creative-brief';
  mediaType: SnapsCreativeBriefMediaType;
  aspectRatio: SnapsCreativeBriefAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  title: string;
  topic: string;
  campaign: string;
  visualStyle: string;
  targetPlatforms: SnapsTargetPlatform[];
  items: SnapsCreativeBriefItem[];
  checklist: string[];
  warnings: string[];
};

const creativeMediaTypes: SnapsCreativeBriefMediaType[] = [
  'image',
  'video',
  'gif',
  'carousel',
];

const creativeAspectRatios: SnapsCreativeBriefAspectRatio[] = [
  'square',
  'portrait',
  'story',
  'landscape',
];

@Injectable()
export class SnapsCreativeBriefService {
  preview(body?: SnapsCreativeBriefRequest): SnapsCreativeBriefPreview {
    const request = body || {};
    const sourceText = this.sourceText(request);
    const title =
      this.cleanText(request.title, 120) ||
      this.firstLine(sourceText) ||
      'snaps creative brief';

    if (sourceText.length < 10 && title === 'snaps creative brief') {
      throw new BadRequestException(
        'sourceText, variants, or title is required for creative brief generation.'
      );
    }

    const mediaType = this.cleanMediaType(request.mediaType);
    const aspectRatio = this.cleanAspectRatio(request.aspectRatio);
    const dimensions = this.dimensionsFor(aspectRatio);
    const topic = this.cleanText(request.topic, 120) || title;
    const campaign = this.cleanText(request.campaign, 140) || topic;
    const visualStyle =
      this.cleanText(request.visualStyle, 120) ||
      'clean Korean SaaS editorial layout';
    const brandColor = this.cleanColor(request.brandColor, '#12b8b8');
    const accentColor = this.cleanColor(request.accentColor, '#f6c85f');
    const cta =
      this.cleanText(request.cta, 140) || '저장하고 다음 콘텐츠 회의에서 확인하세요.';
    const targetPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const platforms = targetPlatforms.length
      ? targetPlatforms
      : (['instagram', 'linkedin', 'threads'] as SnapsTargetPlatform[]);
    const referenceUrls = this.cleanUrls(request.referenceUrls);
    const points = this.extractPoints(sourceText || title);

    const items = this.buildItems({
      title,
      topic,
      campaign,
      mediaType,
      aspectRatio,
      dimensions,
      visualStyle,
      brandColor,
      accentColor,
      cta,
      platforms,
      referenceUrls,
      points,
    });
    const warnings = this.platformWarnings(mediaType, aspectRatio, platforms);

    return {
      product: 'snaps',
      source: 'snaps-creative-brief',
      mediaType,
      aspectRatio,
      dimensions,
      title,
      topic,
      campaign,
      visualStyle,
      targetPlatforms: platforms,
      items,
      checklist: [
        `Create a ${mediaType} design at ${dimensions.width}x${dimensions.height}.`,
        'Keep the first-screen overlay readable without the caption.',
        'Export the final asset, save it to Media library, then attach or queue from snaps.',
      ],
      warnings,
    };
  }

  toMediaAssetInput(
    preview: SnapsCreativeBriefPreview,
    body?: SnapsCreativeBriefSaveRequest
  ): SnapsMediaAssetInput {
    const itemId = this.cleanText(body?.itemId, 80);
    const selected =
      preview.items.find((item) => item.id === itemId) || preview.items[0];

    return {
      title: selected.title,
      url: selected.svgDataUrl,
      thumbnail: selected.svgDataUrl,
      mediaType: selected.mediaType,
      altText: selected.altText,
      caption: selected.captionSeed,
      campaign: preview.campaign,
      tags: [
        'creative-brief',
        selected.mediaType,
        selected.aspectRatio,
        selected.angle,
        ...preview.targetPlatforms,
      ],
      targetPlatforms: preview.targetPlatforms,
      width: selected.dimensions.width,
      height: selected.dimensions.height,
      source: 'snaps-creative-brief',
    };
  }

  private buildItems(input: {
    title: string;
    topic: string;
    campaign: string;
    mediaType: SnapsCreativeBriefMediaType;
    aspectRatio: SnapsCreativeBriefAspectRatio;
    dimensions: { width: number; height: number };
    visualStyle: string;
    brandColor: string;
    accentColor: string;
    cta: string;
    platforms: SnapsTargetPlatform[];
    referenceUrls: string[];
    points: string[];
  }): SnapsCreativeBriefItem[] {
    const pointA = input.points[0] || input.topic;
    const pointB = input.points[1] || input.campaign;
    const pointC = input.points[2] || input.cta;
    const seeds: Array<{
      angle: SnapsCreativeBriefItem['angle'];
      title: string;
      overlayText: string;
      body: string;
    }> = [
      {
        angle: 'hero',
        title: `${input.title} hero`,
        overlayText: this.overlayText(input.title),
        body: pointA,
      },
      {
        angle: 'proof',
        title: `${input.title} proof`,
        overlayText: this.overlayText(pointB),
        body: `${pointA} / ${pointB}`,
      },
      {
        angle: 'cta',
        title: `${input.title} CTA`,
        overlayText: this.overlayText(input.cta),
        body: pointC,
      },
    ];

    return seeds.map((seed, index) => {
      const storyboard = this.storyboard(input.mediaType, seed.body, input.cta);
      const warnings = this.platformWarnings(
        input.mediaType,
        input.aspectRatio,
        input.platforms
      );
      const svg = this.svgPreview({
        index: index + 1,
        title: seed.overlayText,
        body: seed.body,
        footer: input.campaign,
        dimensions: input.dimensions,
        brandColor: input.brandColor,
        accentColor: input.accentColor,
        mediaType: input.mediaType,
      });
      return {
        id: `creative-${seed.angle}`,
        angle: seed.angle,
        mediaType: input.mediaType,
        aspectRatio: input.aspectRatio,
        dimensions: input.dimensions,
        title: seed.title.slice(0, 140),
        overlayText: seed.overlayText,
        prompt: [
          input.visualStyle,
          `${input.mediaType} design`,
          `${input.dimensions.width}x${input.dimensions.height}`,
          `topic: ${input.topic}`,
          `overlay: ${seed.overlayText}`,
          `supporting idea: ${seed.body}`,
        ].join(' | '),
        altText: `${seed.overlayText} creative brief for ${input.platforms
          .map((platform) => snapsPlatformRules[platform].label)
          .join(', ')}`,
        captionSeed: `${seed.body}\n\n${input.cta}`,
        productionNotes: this.productionNotes(input.mediaType, input.aspectRatio),
        storyboard,
        referenceUrls: input.referenceUrls,
        svg,
        svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        warnings,
      };
    });
  }

  private productionNotes(
    mediaType: SnapsCreativeBriefMediaType,
    aspectRatio: SnapsCreativeBriefAspectRatio
  ) {
    const notes = [
      `Lock the canvas to ${aspectRatio} before designing.`,
      'Keep headline text inside the center safe area.',
      'Use the exported file as the Media library asset source.',
    ];
    if (mediaType === 'video' || mediaType === 'gif') {
      notes.push('Use the storyboard frames as shot or animation beats.');
    }
    if (mediaType === 'carousel') {
      notes.push('Use this as slide 1 and keep follow-up slides in the same system.');
    }
    return notes;
  }

  private storyboard(
    mediaType: SnapsCreativeBriefMediaType,
    body: string,
    cta: string
  ) {
    if (mediaType === 'video' || mediaType === 'gif') {
      return [
        `0-2s: show the hook as large motion text: ${this.overlayText(body)}`,
        '2-6s: show the proof point with one metric or customer quote.',
        `6-9s: end on CTA: ${cta}`,
      ];
    }
    if (mediaType === 'carousel') {
      return [
        `Slide 1: ${this.overlayText(body)}`,
        'Slide 2: explain the pain or insight.',
        `Final slide: ${cta}`,
      ];
    }
    return [
      `Main image: ${this.overlayText(body)}`,
      'Supporting visual: product, workflow, or customer outcome.',
      `Caption CTA: ${cta}`,
    ];
  }

  private platformWarnings(
    mediaType: SnapsCreativeBriefMediaType,
    aspectRatio: SnapsCreativeBriefAspectRatio,
    platforms: SnapsTargetPlatform[]
  ) {
    const warnings: string[] = [];
    if (
      platforms.some((platform) => platform === 'youtube' || platform === 'tiktok') &&
      mediaType !== 'video'
    ) {
      warnings.push('YouTube Shorts and TikTok usually need a video export.');
    }
    if (
      platforms.includes('instagram') &&
      (mediaType === 'video' || mediaType === 'gif') &&
      aspectRatio !== 'story' &&
      aspectRatio !== 'portrait'
    ) {
      warnings.push('Instagram short-form creative usually performs better in portrait or story ratio.');
    }
    if (platforms.some((platform) => snapsPlatformRules[platform].publishMode === 'assist')) {
      warnings.push('Assist-only channels still need manual placement after export.');
    }
    return [...new Set(warnings)];
  }

  private svgPreview(input: {
    index: number;
    title: string;
    body: string;
    footer: string;
    dimensions: { width: number; height: number };
    brandColor: string;
    accentColor: string;
    mediaType: SnapsCreativeBriefMediaType;
  }) {
    const { width, height } = input.dimensions;
    const safeTitle = this.escapeXml(input.title);
    const safeBody = this.escapeXml(input.body.slice(0, 120));
    const safeFooter = this.escapeXml(input.footer);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
      `<rect width="${width}" height="${height}" fill="#101716"/>`,
      `<rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.06)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.88)}" rx="28" fill="${this.escapeXml(input.brandColor)}" opacity="0.16"/>`,
      `<circle cx="${Math.round(width * 0.84)}" cy="${Math.round(height * 0.16)}" r="${Math.round(width * 0.08)}" fill="${this.escapeXml(input.accentColor)}" opacity="0.9"/>`,
      `<text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.16)}" fill="${this.escapeXml(input.accentColor)}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.04)}" font-weight="700">snaps creative ${input.index}</text>`,
      `<text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.4)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.075)}" font-weight="800">${safeTitle}</text>`,
      `<text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.52)}" fill="#d6e7e3" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.035)}">${safeBody}</text>`,
      `<text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.84)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.034)}">${this.escapeXml(input.mediaType)} / ${safeFooter}</text>`,
      '</svg>',
    ].join('');
  }

  private sourceText(request: SnapsCreativeBriefRequest) {
    const direct = this.cleanTextBlock(request.sourceText, 50000);
    if (direct) {
      return direct;
    }
    if (Array.isArray(request.variants)) {
      return request.variants
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const record = item as Record<string, unknown>;
          return [
            this.cleanText(record.title, 160),
            this.cleanText(record.content, 1000),
            this.cleanText(record.caption, 1000),
          ]
            .filter(Boolean)
            .join('\n');
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 50000);
    }
    return '';
  }

  private extractPoints(text: string) {
    const lines = text
      .split(/\n|[.!?。！？]/)
      .map((line) => this.cleanText(line, 180))
      .filter((line) => line.length > 8);
    return (lines.length ? lines : [text]).slice(0, 5);
  }

  private overlayText(value: string) {
    const text = this.cleanText(value, 80);
    if (text.length <= 34) {
      return text;
    }
    return `${text.slice(0, 32).trim()}...`;
  }

  private dimensionsFor(aspectRatio: SnapsCreativeBriefAspectRatio) {
    if (aspectRatio === 'story') {
      return { width: 1080, height: 1920 };
    }
    if (aspectRatio === 'portrait') {
      return { width: 1080, height: 1350 };
    }
    if (aspectRatio === 'landscape') {
      return { width: 1200, height: 675 };
    }
    return { width: 1080, height: 1080 };
  }

  private cleanMediaType(value: unknown): SnapsCreativeBriefMediaType {
    const text = this.cleanText(value, 40) as SnapsCreativeBriefMediaType;
    return creativeMediaTypes.includes(text) ? text : 'image';
  }

  private cleanAspectRatio(value: unknown): SnapsCreativeBriefAspectRatio {
    const text = this.cleanText(value, 40) as SnapsCreativeBriefAspectRatio;
    return creativeAspectRatios.includes(text) ? text : 'portrait';
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
          .map((item) => this.cleanText(item, 80) as SnapsTargetPlatform)
          .filter((platform) => snapsTargetPlatforms.includes(platform))
      ),
    ].slice(0, 10);
  }

  private cleanUrls(value: unknown) {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]/)
        : [];
    return values
      .map((item) => this.cleanText(item, 2000))
      .filter((item) => /^https?:\/\//i.test(item) || /^data:image\//i.test(item))
      .slice(0, 8);
  }

  private cleanColor(value: unknown, fallback: string) {
    const color = this.cleanText(value, 40);
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  private firstLine(text: string) {
    return this.cleanText(text.split(/\n/)[0], 120);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }
    return '';
  }

  private cleanTextBlock(value: unknown, maxLength: number) {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).replace(/\r\n/g, '\n').trim().slice(0, maxLength);
    }
    return '';
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
