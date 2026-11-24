import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import {
  SnapsBlockedUrlError,
  fetchSnapsPublicUrl,
} from '@gitroom/nestjs-libraries/snaps/utils/public-fetch';

export type SnapsSourceResolverType =
  | 'auto'
  | 'url'
  | 'article'
  | 'youtube'
  | 'tiktok'
  | 'x'
  | 'pdf'
  | 'audio'
  | 'text'
  | 'research';

export type SnapsSourceResolverRequest = {
  sourceType?: unknown;
  url?: unknown;
  text?: unknown;
  query?: unknown;
  customInstructions?: unknown;
  htmlText?: unknown;
  defaultTone?: unknown;
  tags?: unknown;
};

export type SnapsSourceResolverPreview = {
  product: 'snaps';
  source: 'snaps-source-resolver';
  sourceType: Exclude<SnapsSourceResolverType, 'auto'>;
  status: 'ready' | 'warning';
  title: string;
  sourceText: string;
  sourceUrl?: string;
  sourcePlatform: string;
  topic?: string;
  tone?: string;
  tags: string[];
  wordCount: number;
  metadata: {
    description?: string;
    contentType?: string;
    extractionMode: 'html' | 'text' | 'research' | 'metadata-fallback';
  };
  sourceInput: SnapsSourceLibraryInputDto;
  warnings: string[];
};

@Injectable()
export class SnapsSourceResolverService {
  async preview(
    body: SnapsSourceResolverRequest = {}
  ): Promise<SnapsSourceResolverPreview> {
    const explicitType = this.normalizeType(body.sourceType);
    const url = this.normalizeUrl(body.url);
    const text = this.cleanText(body.text, 50000);
    const query = this.cleanText(body.query, 240);
    const instructions = this.cleanText(body.customInstructions, 500);
    const htmlText = this.cleanText(body.htmlText, 200000);
    const tone = this.cleanOptional(body.defaultTone, 240);
    const tags = this.cleanTags(body.tags);
    const sourceType = this.detectType(explicitType, url, text, query);

    if (sourceType === 'text') {
      if (text.length < 5) {
        throw new BadRequestException('text must be at least 5 characters.');
      }
      return this.buildPreview({
        sourceType,
        title: this.extractTopic(text) || 'Text source',
        sourceText: this.appendInstructions(text, instructions),
        sourcePlatform: 'source-text',
        tone,
        tags: ['text', ...tags],
        metadata: { extractionMode: 'text' },
        warnings: [],
      });
    }

    if (sourceType === 'research') {
      if (query.length < 3) {
        throw new BadRequestException('query must be at least 3 characters.');
      }
      const researchText = this.buildResearchBrief(query, instructions);
      return this.buildPreview({
        sourceType,
        title: `${query} research brief`,
        sourceText: researchText,
        sourcePlatform: 'ai-research',
        topic: query,
        tone,
        tags: ['research', ...tags],
        metadata: { extractionMode: 'research' },
        warnings: [
          'AI research mode creates a deterministic research brief from the query. Add live source links before publishing claims.',
        ],
      });
    }

    if (!url) {
      throw new BadRequestException('url is required for URL source resolution.');
    }

    const html = htmlText || (await this.fetchUrlText(url));
    const extracted = this.extractFromHtml(html, url);
    const fallbackType = sourceType;
    const isRichTranscriptSource = ['youtube', 'tiktok', 'x', 'pdf', 'audio'].includes(
      fallbackType
    );
    const warnings: string[] = [];
    let sourceText = extracted.text;

    if (isRichTranscriptSource) {
      warnings.push(
        `${fallbackType} transcript or binary extraction is not guaranteed from public HTML. Source URL and available metadata were preserved.`
      );
    }
    if (sourceText.length < 80) {
      sourceText = [
        extracted.title,
        extracted.description,
        `Source URL: ${url}`,
        instructions ? `Custom instructions: ${instructions}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      warnings.push('Only limited text was extractable; review the resolved source before transforming.');
    } else {
      sourceText = this.appendInstructions(sourceText, instructions);
    }

    return this.buildPreview({
      sourceType: fallbackType,
      title: extracted.title || this.titleFromUrl(url),
      sourceText,
      sourceUrl: url,
      sourcePlatform: `source-${fallbackType}`,
      topic: extracted.title || this.titleFromUrl(url),
      tone,
      tags: [fallbackType, ...tags],
      metadata: {
        description: extracted.description,
        contentType: extracted.contentType,
        extractionMode: extracted.text.length >= 80 ? 'html' : 'metadata-fallback',
      },
      warnings,
    });
  }

  private buildPreview(input: {
    sourceType: Exclude<SnapsSourceResolverType, 'auto'>;
    title: string;
    sourceText: string;
    sourceUrl?: string;
    sourcePlatform: string;
    topic?: string;
    tone?: string;
    tags: string[];
    metadata: SnapsSourceResolverPreview['metadata'];
    warnings: string[];
  }): SnapsSourceResolverPreview {
    const title = this.cleanText(input.title, 160) || 'Resolved source';
    const sourceText = this.cleanText(input.sourceText, 50000);
    if (sourceText.length < 5) {
      throw new BadRequestException('resolved sourceText must be at least 5 characters.');
    }
    const tags = this.cleanTags(input.tags);
    const sourceInput: SnapsSourceLibraryInputDto = {
      title,
      sourceText,
      sourcePlatform: input.sourcePlatform,
      topic: this.cleanOptional(input.topic, 240) || title,
      tone: input.tone,
      tags,
    };
    return {
      product: 'snaps',
      source: 'snaps-source-resolver',
      sourceType: input.sourceType,
      status: input.warnings.length ? 'warning' : 'ready',
      title,
      sourceText,
      sourceUrl: input.sourceUrl,
      sourcePlatform: input.sourcePlatform,
      topic: sourceInput.topic,
      tone: sourceInput.tone,
      tags,
      wordCount: sourceText.split(/\s+/).filter(Boolean).length,
      metadata: input.metadata,
      sourceInput,
      warnings: input.warnings,
    };
  }

  private async fetchUrlText(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchSnapsPublicUrl(url, {
        signal: controller.signal,
        headers: {
          'user-agent':
            'snaps-source-resolver/1.0 (+https://snaps.local/source-resolver)',
          accept: 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.2',
        },
      });
      if (!response.ok) {
        throw new BadRequestException(`source URL returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (
        !/text|html|xml|json/i.test(contentType) &&
        !/pdf|audio|video/i.test(contentType)
      ) {
        throw new BadRequestException(`source URL content type is not readable: ${contentType}`);
      }
      const text = await response.text();
      return text.slice(0, 200000);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof SnapsBlockedUrlError) {
        throw new BadRequestException(`source URL is not allowed: ${error.message}`);
      }
      throw new BadRequestException('source URL could not be fetched within the timeout.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractFromHtml(html: string, url: string) {
    const contentType = html.startsWith('%PDF') ? 'application/pdf' : 'text/html';
    const title =
      this.decodeEntities(this.matchTag(html, 'title')) ||
      this.decodeEntities(this.matchMeta(html, 'og:title')) ||
      this.titleFromUrl(url);
    const description =
      this.decodeEntities(this.matchMeta(html, 'description')) ||
      this.decodeEntities(this.matchMeta(html, 'og:description'));
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(nav|header|footer|aside|form|svg|canvas)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    const text = this.decodeEntities(stripped)
      .split(/\n+/)
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line.length >= 20)
      .filter((line, index, lines) => lines.indexOf(line) === index)
      .slice(0, 80)
      .join('\n\n')
      .slice(0, 45000);
    return { title, description, text, contentType };
  }

  private buildResearchBrief(query: string, instructions: string) {
    const base = [
      `Research query: ${query}`,
      '',
      'Angles to validate:',
      `1. What changed recently around ${query}?`,
      `2. What pain does this create for creators, brands, or agencies?`,
      `3. Which proof point, case, or metric would make the post credible?`,
      `4. What counterpoint should be handled before publishing?`,
      '',
      'Draftable source notes:',
      `- Lead with the clearest audience pain around ${query}.`,
      '- Turn one proof point into a short hook, one carousel, and one reply prompt.',
      '- Keep claims conservative until live links or first-party examples are attached.',
    ];
    if (instructions) {
      base.push('', `Custom instructions: ${instructions}`);
    }
    return base.join('\n');
  }

  private detectType(
    explicitType: SnapsSourceResolverType,
    url: string,
    text: string,
    query: string
  ): Exclude<SnapsSourceResolverType, 'auto'> {
    if (explicitType && explicitType !== 'auto') {
      return explicitType;
    }
    if (text) {
      return 'text';
    }
    if (query) {
      return 'research';
    }
    const lower = url.toLowerCase();
    if (/youtube\.com|youtu\.be/.test(lower)) {
      return 'youtube';
    }
    if (/tiktok\.com/.test(lower)) {
      return 'tiktok';
    }
    if (/(^|\/\/)(x\.com|twitter\.com)/.test(lower)) {
      return 'x';
    }
    if (/\.pdf($|[?#])/.test(lower)) {
      return 'pdf';
    }
    if (/\.(mp3|wav|m4a|aac|ogg)($|[?#])/.test(lower)) {
      return 'audio';
    }
    return 'article';
  }

  private normalizeType(value: unknown): SnapsSourceResolverType {
    const allowed: SnapsSourceResolverType[] = [
      'auto',
      'url',
      'article',
      'youtube',
      'tiktok',
      'x',
      'pdf',
      'audio',
      'text',
      'research',
    ];
    return allowed.includes(value as SnapsSourceResolverType)
      ? (value as SnapsSourceResolverType)
      : 'auto';
  }

  private normalizeUrl(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }
    try {
      const parsed = new URL(value.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }

  private matchTag(html: string, tag: string) {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim() || '';
  }

  private matchMeta(html: string, name: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexes = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match?.[1]) {
        return match[1];
      }
    }
    return '';
  }

  private titleFromUrl(url: string) {
    try {
      const parsed = new URL(url);
      const pathTitle = parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, ' ');
      return pathTitle || parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'URL source';
    }
  }

  private appendInstructions(text: string, instructions: string) {
    return instructions
      ? `${text}\n\nCustom instructions:\n${instructions}`
      : text;
  }

  private extractTopic(text: string) {
    return text
      .replace(/https?:\/\/\S+/g, '')
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 8)
      .join(' ')
      .slice(0, 120);
  }

  private decodeEntities(value: string) {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
      .trim();
  }

  private cleanText(value: unknown, maxLength = 1000) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\u0000/g, '').trim().slice(0, maxLength);
  }

  private cleanOptional(value: unknown, maxLength = 1000) {
    const text = this.cleanText(value, maxLength);
    return text || undefined;
  }

  private cleanTags(value: unknown) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,|]/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, 80).replace(/^#+/, '').trim())
          .filter(Boolean)
      ),
    ].slice(0, 20);
  }
}
