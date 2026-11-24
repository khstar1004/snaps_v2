import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  buildDefaultSettings,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsCarouselVisualRequest = {
  sourceText?: unknown;
  title?: unknown;
  topic?: unknown;
  tone?: unknown;
  template?: unknown;
  aspectRatio?: unknown;
  slideCount?: unknown;
  brandColor?: unknown;
  accentColor?: unknown;
  targetPlatforms?: unknown;
  cta?: unknown;
  imageUrls?: unknown;
};

export type SnapsCarouselAspectRatio = 'square' | 'portrait' | 'story' | 'landscape';

export type SnapsCarouselTemplate =
  | 'listicle'
  | 'quote'
  | 'problem-solution'
  | 'report'
  | 'launch';

export type SnapsCarouselSlide = {
  slideIndex: number;
  kind: 'cover' | 'point' | 'quote' | 'cta';
  eyebrow: string;
  title: string;
  body: string;
  footer: string;
  visualPrompt: string;
  imageUrl?: string;
  svg: string;
  svgDataUrl: string;
  alt: string;
  warnings: string[];
};

export type SnapsCarouselVisualPreview = {
  product: 'snaps';
  source: 'snaps-carousel-visual';
  template: SnapsCarouselTemplate;
  aspectRatio: SnapsCarouselAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  slideCount: number;
  title: string;
  topic?: string;
  captionSeed: string;
  exportHtml: string;
  media: Array<{
    id: string;
    path: string;
    thumbnail: string;
    alt: string;
  }>;
  slides: SnapsCarouselSlide[];
  warnings: string[];
};

type CarouselDimensions = {
  width: number;
  height: number;
};

@Injectable()
export class SnapsCarouselVisualService {
  readonly sampleSource = [
    'AI 콘텐츠 운영 체크리스트',
    '1. 하나의 원문을 플랫폼별 문법으로 재작성합니다.',
    '2. 저장할 만한 인사이트를 카드뉴스로 쪼갭니다.',
    '3. 마지막 장에는 댓글이나 상담 CTA를 둡니다.',
  ].join('\n');

  preview(body?: SnapsCarouselVisualRequest): SnapsCarouselVisualPreview {
    const request = body || {};
    const sourceText = this.cleanSourceText(request.sourceText, 50000);
    if (sourceText.length < 10) {
      throw new BadRequestException('sourceText is required for carousel visual generation.');
    }

    const template = this.cleanTemplate(request.template);
    const aspectRatio = this.cleanAspectRatio(request.aspectRatio);
    const dimensions = this.dimensionsFor(aspectRatio);
    const brandColor = this.cleanColor(request.brandColor, '#12b8b8');
    const accentColor = this.cleanColor(request.accentColor, '#f6c85f');
    const title =
      this.cleanText(request.title, 100) ||
      this.firstLine(sourceText).slice(0, 90) ||
      'snaps carousel';
    const topic = this.cleanText(request.topic, 120) || undefined;
    const tone = this.cleanText(request.tone, 120) || 'clear social carousel';
    const cta = this.cleanText(request.cta, 140) || '댓글로 필요한 내용을 알려주세요.';
    const imageUrls = this.cleanUrls(request.imageUrls);
    const requestedSlideCount = this.clampNumber(request.slideCount, 6, 3, 10);
    const points = this.extractPoints(sourceText, requestedSlideCount - 2);
    const slideCount = Math.max(3, Math.min(requestedSlideCount, points.length + 2));
    const selectedPoints = points.slice(0, slideCount - 2);
    const warnings: string[] = [];

    if (points.length < requestedSlideCount - 2) {
      warnings.push('Source text had fewer distinct points than requested slides.');
    }

    const seed = selectedPoints.length ? selectedPoints : [sourceText.slice(0, 180)];
    const slides = [
      this.buildSlide({
        slideIndex: 1,
        kind: template === 'quote' ? 'quote' : 'cover',
        eyebrow: topic || this.templateLabel(template),
        title,
        body: this.coverBody(seed[0], tone),
        footer: 'snaps carousel',
        imageUrl: imageUrls[0],
        brandColor,
        accentColor,
        dimensions,
        template,
      }),
      ...seed.map((point, index) =>
        this.buildSlide({
          slideIndex: index + 2,
          kind: template === 'quote' ? 'quote' : 'point',
          eyebrow: `${String(index + 1).padStart(2, '0')} / ${seed.length}`,
          title: this.pointTitle(point, index, template),
          body: this.pointBody(point),
          footer: topic || title,
          imageUrl: imageUrls[index + 1],
          brandColor,
          accentColor,
          dimensions,
          template,
        })
      ),
      this.buildSlide({
        slideIndex: seed.length + 2,
        kind: 'cta',
        eyebrow: 'NEXT',
        title: '다음 액션',
        body: cta,
        footer: topic || title,
        imageUrl: imageUrls[seed.length + 1],
        brandColor,
        accentColor,
        dimensions,
        template,
      }),
    ].slice(0, slideCount);

    const captionSeed = this.captionSeed(title, seed, cta, topic);
    const media = slides.map((slide) => ({
      id: `snaps-carousel-${String(slide.slideIndex).padStart(2, '0')}`,
      path: slide.svgDataUrl,
      thumbnail: slide.svgDataUrl,
      alt: slide.alt,
    }));

    return {
      product: 'snaps',
      source: 'snaps-carousel-visual',
      template,
      aspectRatio,
      dimensions,
      slideCount: slides.length,
      title,
      topic,
      captionSeed,
      exportHtml: this.exportHtml(title, slides, dimensions),
      media,
      slides,
      warnings,
    };
  }

  toVariants(
    preview: SnapsCarouselVisualPreview,
    targetPlatforms?: unknown
  ): SnapsVariant[] {
    const platforms = this.cleanPlatforms(targetPlatforms);
    const selectedPlatforms = platforms.length
      ? platforms
      : (['instagram', 'linkedin', 'threads'] as SnapsTargetPlatform[]);

    return selectedPlatforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      return {
        platform,
        label: rule.label,
        title: preview.title,
        content: fitSnapsContent(platform, preview.captionSeed),
        hashtags: this.toHashtags(
          [preview.topic, preview.template, 'carousel'].filter(Boolean) as string[],
          rule.hashtagLimit
        ),
        media: preview.media,
        settings: {
          ...buildDefaultSettings(platform),
          source: 'snaps-carousel-visual',
          subject: preview.title,
          carouselSlides: preview.slideCount,
        },
        publishMode: rule.publishMode,
        notes: [
          `template: ${preview.template}`,
          `aspectRatio: ${preview.aspectRatio}`,
          `slides: ${preview.slideCount}`,
        ],
      };
    });
  }

  private buildSlide(input: {
    slideIndex: number;
    kind: SnapsCarouselSlide['kind'];
    eyebrow: string;
    title: string;
    body: string;
    footer: string;
    imageUrl?: string;
    brandColor: string;
    accentColor: string;
    dimensions: CarouselDimensions;
    template: SnapsCarouselTemplate;
  }): SnapsCarouselSlide {
    const visualPrompt = [
      `${this.templateLabel(input.template)} carousel slide`,
      input.kind,
      input.title,
      input.body,
    ].join(' | ');
    const svg = this.renderSvg(input);
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    return {
      slideIndex: input.slideIndex,
      kind: input.kind,
      eyebrow: input.eyebrow,
      title: input.title,
      body: input.body,
      footer: input.footer,
      visualPrompt,
      imageUrl: input.imageUrl,
      svg,
      svgDataUrl,
      alt: `${input.title} - slide ${input.slideIndex}`,
      warnings: [],
    };
  }

  private renderSvg(input: {
    slideIndex: number;
    kind: SnapsCarouselSlide['kind'];
    eyebrow: string;
    title: string;
    body: string;
    footer: string;
    imageUrl?: string;
    brandColor: string;
    accentColor: string;
    dimensions: CarouselDimensions;
    template: SnapsCarouselTemplate;
  }) {
    const { width, height } = input.dimensions;
    const margin = Math.round(width * 0.08);
    const titleSize = Math.max(54, Math.round(width * 0.068));
    const bodySize = Math.max(28, Math.round(width * 0.034));
    const eyebrowSize = Math.max(22, Math.round(width * 0.024));
    const footerSize = Math.max(20, Math.round(width * 0.022));
    const dark = '#10191b';
    const panel = '#f7faf8';
    const titleLines = this.wrapText(input.title, input.kind === 'cover' ? 15 : 18, 3);
    const bodyLines = this.wrapText(input.body, 28, input.kind === 'cover' ? 5 : 7);
    const imageBlock = input.imageUrl
      ? `<image href="${this.xml(input.imageUrl)}" x="${margin}" y="${Math.round(height * 0.62)}" width="${width - margin * 2}" height="${Math.round(height * 0.18)}" preserveAspectRatio="xMidYMid slice" opacity="0.9" />`
      : `<circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.2)}" r="${Math.round(width * 0.12)}" fill="${this.xml(input.accentColor)}" opacity="0.18" />`;

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${this.xml(input.title)}">`,
      `<rect width="${width}" height="${height}" fill="${panel}" />`,
      `<rect x="0" y="0" width="${width}" height="${Math.round(height * 0.022)}" fill="${this.xml(input.brandColor)}" />`,
      `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" rx="36" fill="#ffffff" stroke="#dfe7e5" stroke-width="2" />`,
      `<text x="${margin + 34}" y="${margin + 70}" fill="${this.xml(input.brandColor)}" font-family="Arial, sans-serif" font-size="${eyebrowSize}" font-weight="700" letter-spacing="0">${this.xml(input.eyebrow)}</text>`,
      ...this.textLines(titleLines, margin + 34, Math.round(height * 0.23), titleSize, titleSize * 1.06, dark, 800),
      ...this.textLines(bodyLines, margin + 34, Math.round(height * 0.46), bodySize, bodySize * 1.35, '#2b3a3d', 500),
      imageBlock,
      `<rect x="${margin + 34}" y="${height - margin - 92}" width="${Math.round(width * 0.24)}" height="8" rx="4" fill="${this.xml(input.accentColor)}" />`,
      `<text x="${margin + 34}" y="${height - margin - 42}" fill="#637174" font-family="Arial, sans-serif" font-size="${footerSize}" font-weight="700">${this.xml(input.footer)}</text>`,
      `<text x="${width - margin - 92}" y="${height - margin - 42}" fill="${this.xml(input.brandColor)}" font-family="Arial, sans-serif" font-size="${footerSize}" font-weight="800">${String(input.slideIndex).padStart(2, '0')}</text>`,
      '</svg>',
    ].join('');
  }

  private textLines(
    lines: string[],
    x: number,
    y: number,
    fontSize: number,
    lineHeight: number,
    color: string,
    weight: number
  ) {
    return lines.map(
      (line, index) =>
        `<text x="${x}" y="${y + Math.round(index * lineHeight)}" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}">${this.xml(line)}</text>`
    );
  }

  private exportHtml(title: string, slides: SnapsCarouselSlide[], dimensions: CarouselDimensions) {
    const slideMarkup = slides
      .map(
        (slide) =>
          `<section class="slide"><img src="${slide.svgDataUrl}" alt="${this.xml(slide.alt)}" /></section>`
      )
      .join('\n');
    return [
      '<!doctype html>',
      '<html lang="ko">',
      '<head>',
      '<meta charset="utf-8" />',
      `<title>${this.xml(title)} - snaps carousel</title>`,
      '<style>',
      'body{margin:0;background:#0f1719;font-family:Arial,sans-serif;color:#f7faf8;}',
      '.page{max-width:1120px;margin:0 auto;padding:24px;display:grid;gap:18px;}',
      `.slide{width:min(100%,${dimensions.width}px);aspect-ratio:${dimensions.width}/${dimensions.height};}`,
      '.slide img{width:100%;height:100%;display:block;border:0;}',
      '@media print{body{background:#fff}.page{padding:0}.slide{break-after:page;width:100%;}}',
      '</style>',
      '</head>',
      '<body><main class="page">',
      slideMarkup,
      '</main></body></html>',
    ].join('\n');
  }

  private extractPoints(sourceText: string, limit: number) {
    const source = sourceText
      .replace(/\r/g, '\n')
      .split(/\n+|[.!?。！？]\s+/g)
      .map((line) =>
        line
          .replace(/^\s*[-*•\d.)]+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((line) => line.length >= 8);
    return [...new Set(source)].slice(0, Math.max(1, limit));
  }

  private captionSeed(title: string, points: string[], cta: string, topic?: string) {
    return [
      title,
      '',
      ...points.map((point, index) => `${index + 1}. ${point}`),
      '',
      cta,
      topic ? `#${topic.replace(/\s+/g, '')}` : '',
      '#carousel',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private pointTitle(point: string, index: number, template: SnapsCarouselTemplate) {
    if (template === 'problem-solution') {
      return index % 2 === 0 ? '문제' : '해결';
    }
    if (template === 'report') {
      return `인사이트 ${index + 1}`;
    }
    if (template === 'launch') {
      return `기능 ${index + 1}`;
    }
    if (template === 'quote') {
      return '핵심 문장';
    }
    return `포인트 ${index + 1}`;
  }

  private pointBody(point: string) {
    return point.slice(0, 220);
  }

  private coverBody(point: string, tone: string) {
    return `${point.slice(0, 150)}\n${tone}`;
  }

  private firstLine(sourceText: string) {
    return sourceText.split(/\n+/).map((line) => line.trim()).find(Boolean) || '';
  }

  private wrapText(value: string, maxChars: number, maxLines: number) {
    const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words.length ? words : [value]) {
      if (word.length > maxChars) {
        if (current) {
          lines.push(current);
          current = '';
        }
        for (let index = 0; index < word.length; index += maxChars) {
          lines.push(word.slice(index, index + maxChars));
        }
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
      if (lines.length >= maxLines) {
        break;
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
    }
    return lines.length ? lines : [''];
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
      linkedin: 'linkedin',
      x: 'x',
      twitter: 'x',
      blog: 'naver-blog',
      'naver-blog': 'naver-blog',
    };
    const platforms = raw
      .split(/[|,;]+/g)
      .map((item) => item.trim().toLowerCase().replace(/^@/, '').replace(/[\s_]+/g, '-'))
      .map((platform) => aliases[platform] || platform)
      .filter((platform): platform is SnapsTargetPlatform =>
        snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      );
    return [...new Set(platforms)].slice(0, 6);
  }

  private cleanUrls(value: unknown) {
    const raw = Array.isArray(value)
      ? value
      : this.cleanText(value, 4000).split(/[,\n|]+/g);
    return raw
      .map((item) => this.cleanUrl(item))
      .filter(Boolean)
      .slice(0, 10);
  }

  private cleanUrl(value: unknown) {
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

  private cleanTemplate(value: unknown): SnapsCarouselTemplate {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    return ['listicle', 'quote', 'problem-solution', 'report', 'launch'].includes(normalized)
      ? (normalized as SnapsCarouselTemplate)
      : 'listicle';
  }

  private cleanAspectRatio(value: unknown): SnapsCarouselAspectRatio {
    const normalized = this.cleanText(value, 80).toLowerCase().replace(/[\s_]+/g, '-');
    return ['square', 'portrait', 'story', 'landscape'].includes(normalized)
      ? (normalized as SnapsCarouselAspectRatio)
      : 'square';
  }

  private dimensionsFor(aspectRatio: SnapsCarouselAspectRatio): CarouselDimensions {
    if (aspectRatio === 'portrait') {
      return { width: 1080, height: 1350 };
    }
    if (aspectRatio === 'story') {
      return { width: 1080, height: 1920 };
    }
    if (aspectRatio === 'landscape') {
      return { width: 1200, height: 675 };
    }
    return { width: 1080, height: 1080 };
  }

  private templateLabel(template: SnapsCarouselTemplate) {
    const labels: Record<SnapsCarouselTemplate, string> = {
      listicle: 'Listicle',
      quote: 'Quote card',
      'problem-solution': 'Problem solution',
      report: 'Report insight',
      launch: 'Launch card',
    };
    return labels[template];
  }

  private cleanColor(value: unknown, fallback: string) {
    const text = this.cleanText(value, 40);
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  private toHashtags(tags: string[], limit = 5) {
    return tags
      .map((tag) => tag.replace(/^#+/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .slice(0, Math.max(0, limit));
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

  private cleanSourceText(value: unknown, maxLength = 50000) {
    return typeof value === 'string'
      ? value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength)
      : '';
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  private xml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
