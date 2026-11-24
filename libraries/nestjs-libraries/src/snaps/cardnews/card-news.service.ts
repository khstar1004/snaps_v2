import { Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsSplitSentences } from '@gitroom/nestjs-libraries/snaps/text/split-sentences';
import { sanitizeSnapsHashtags } from '@gitroom/nestjs-libraries/snaps/transform/hashtags';

export type SnapsCardNewsTemplateId = 'editorial' | 'bold' | 'minimal';

export type SnapsCardNewsRequest = {
  sourceText: string;
  slideCount?: number;
  tone?: string;
  templateId?: SnapsCardNewsTemplateId;
  brandColor?: string;
};

export type SnapsCardNewsSlide = {
  order: number;
  eyebrow: string;
  heading: string;
  body: string;
};

export type SnapsCardNewsDeck = {
  /**
   * Which path produced this deck. The transform result has carried the same
   * label for a while; card news had none, so neither the API response nor the
   * workspace could tell a generated deck from the deterministic template one,
   * and the live smoke had to guess by matching '포인트 N' headings.
   */
  provider: 'ollama' | 'deepseek' | 'rule-fallback';
  title: string;
  templateId: SnapsCardNewsTemplateId;
  brandColor: string;
  slides: SnapsCardNewsSlide[];
  caption: string;
  hashtags: string[];
};

const templateIds: SnapsCardNewsTemplateId[] = ['editorial', 'bold', 'minimal'];
const MIN_SLIDES = 4;
export const SNAPS_CARD_NEWS_MAX_SLIDES = 10;
const MAX_SLIDES = SNAPS_CARD_NEWS_MAX_SLIDES;
const DEFAULT_SLIDES = 6;

@Injectable()
export class SnapsCardNewsService {
  constructor(private readonly ollama: OllamaClient) {}

  async script(body?: SnapsCardNewsRequest): Promise<SnapsCardNewsDeck> {
    const request = this.normalizeRequest(body);
    try {
      const deck = await this.ollama.chatJson<unknown>([
        {
          role: 'system',
          content:
            'You are snaps card-news planner. Return strict JSON only. Turn Korean source content into a scannable image-carousel (card news) deck.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Create a card-news slide deck for a Korean social image carousel.',
            outputShape: {
              title: 'string',
              slides: [
                {
                  order: 'number',
                  eyebrow: 'string: short label such as 01 or a category tag',
                  heading: 'string: one short punchy line',
                  body: 'string: 1-3 short sentences, no more than 90 characters per sentence',
                },
              ],
              caption: 'string',
              hashtags: ['string'],
            },
            rules: [
              'Write in Korean.',
              `Return exactly ${request.slideCount} slides, ordered starting at 1.`,
              'The first slide is a cover: heading is the hook, body is a one-line subtitle.',
              'The last slide is a closing slide: heading is a call to action, body summarizes the takeaway.',
              'Do not invent facts, numbers, or claims not present in sourceText.',
              'Keep each body under 3 short sentences so it reads well on a phone screen.',
              'Never repeat a sentence across slides; each slide must say something new.',
            ],
            sourceText: request.sourceText,
            slideCount: request.slideCount,
            tone: request.tone,
          }),
        },
      ]);
      return this.normalizeDeck(deck, request);
    } catch {
      return this.fallbackDeck(request);
    }
  }

  private normalizeDeck(
    value: unknown,
    request: Required<SnapsCardNewsRequest>
  ): SnapsCardNewsDeck {
    const fallback = this.fallbackDeck(request);
    const root = this.record(value);
    const title = this.text(root.title, fallback.title, 80);
    const sourceSlides = Array.isArray(root.slides) ? root.slides : [];

    // The prompt asks for exactly slideCount slides, but the model does not
    // always comply. Padding the tail from the fallback deck re-used its last
    // slide for every missing index, so a 3-of-6 response shipped three
    // identical closing slides. slideCount is an upper bound here, not a quota
    // - the same rule fallbackDeck() follows.
    const caption = this.text(root.caption, fallback.caption, 500);
    // An empty array is truthy, so `root.hashtags || fallback.hashtags` shipped a
    // deck with no hashtags whenever the model returned []. Decide on the
    // cleaned list, which also covers a list of tags the sanitiser strips away.
    const modelHashtags = sanitizeSnapsHashtags(root.hashtags);
    const hashtags = modelHashtags.length
      ? modelHashtags
      : sanitizeSnapsHashtags(fallback.hashtags);

    const usable = this.usableSlideCount(sourceSlides);
    if (usable === 0) {
      // Only the slides were unusable. This branch already kept the model's
      // title and caption, but spread the fallback's hashtags over the ones the
      // model produced - the same decision is right for all three fields.
      return { ...fallback, title, caption, hashtags };
    }
    const slideCount = Math.min(usable, request.slideCount);

    const slides: SnapsCardNewsSlide[] = Array.from({ length: slideCount }, (_, index) => {
      const slideValue = this.record(sourceSlides[index]);
      const fallbackSlide =
        fallback.slides[Math.min(index, fallback.slides.length - 1)] || fallback.slides[0];
      return {
        order: index + 1,
        eyebrow: this.slideEyebrow(slideValue.eyebrow, index),
        heading: this.text(slideValue.heading, fallbackSlide.heading, 60),
        body: this.text(slideValue.body, fallbackSlide.body, 220),
      };
    });

    return {
      // Only this path is built from slides the model actually produced. The
      // early return above spreads the fallback deck, so it keeps that label.
      // The engine that actually answered; was the literal 'ollama'.
      provider: this.ollama.provider(),
      title,
      templateId: request.templateId,
      brandColor: request.brandColor,
      slides: this.dropRepeatedSentences(slides),
      caption,
      hashtags,
    };
  }

  /**
   * The model repeats itself. Measured against the live DeepSeek API on a
   * six-slide deck: two body slides closed with
   * "감기 예방에 가장 효과적인 방법 중 하나입니다." word for word and a third
   * with a one-word variant of it, so half the deck ended on the same line. The
   * padding bug noted in normalizeDeck() produced the same symptom from a
   * different cause, which is what makes this worth removing deterministically
   * rather than only asking the prompt not to do it.
   *
   * Only exact repeats go, and only when the slide keeps a sentence of its own:
   * a near-duplicate is a judgement call, an identical sentence is not, and a
   * blanked slide would be worse than a repetitive one.
   */
  private dropRepeatedSentences(slides: SnapsCardNewsSlide[]): SnapsCardNewsSlide[] {
    const seen = new Set<string>();
    return slides.map((slide) => {
      const sentences = snapsSplitSentences(String(slide.body || ''));
      const kept = sentences.filter((sentence) => !seen.has(sentence));
      sentences.forEach((sentence) => seen.add(sentence));
      if (!kept.length || kept.length === sentences.length) {
        return slide;
      }
      return { ...slide, body: kept.join(' ') };
    });
  }

  /**
   * Counts the leading slides the model actually filled in. A slide counts as
   * usable when it carries any heading or body text; trailing blanks are
   * dropped rather than backfilled, so the deck length reflects what the model
   * produced instead of repeating one slide to hit a quota.
   */
  private usableSlideCount(sourceSlides: unknown[]) {
    let count = 0;
    for (const entry of sourceSlides) {
      const slide = this.record(entry);
      const hasText = Boolean(
        this.text(slide.heading, '', 60) || this.text(slide.body, '', 220)
      );
      if (!hasText) {
        break;
      }
      count += 1;
    }
    return count;
  }

  private fallbackDeck(request: Required<SnapsCardNewsRequest>): SnapsCardNewsDeck {
    const source = this.cleanSourceText(request.sourceText);
    const sentences = snapsSplitSentences(source);
    const chunkCount = Math.max(1, request.slideCount - 2);
    const chunks = this.chunkSentences(sentences.length ? sentences : [source], chunkCount);

    const coverSlide: SnapsCardNewsSlide = {
      order: 1,
      eyebrow: '01',
      // headline(), not the raw source: the source keeps its newlines now
      // so that it can be split into slides, and a heading is rendered on
      // one line.
      heading: this.headline(source, 40) || '오늘의 핵심 정리',
      body: '슬라이드를 넘기며 핵심만 빠르게 확인하세요.',
    };

    const bodySlides: SnapsCardNewsSlide[] = chunks.map((chunk, index) => ({
      order: index + 2,
      eyebrow: String(index + 2).padStart(2, '0'),
      heading: `포인트 ${index + 1}`,
      body: snapsClampText(
        this.stripListMarkers(chunk).join(' ') || this.headline(source, 200),
        200
      ),
    }));

    const closingSlide: SnapsCardNewsSlide = {
      order: request.slideCount,
      eyebrow: String(request.slideCount).padStart(2, '0'),
      heading: '저장하고 다시 보기',
      body: '도움이 됐다면 저장하고 팔로우로 다음 콘텐츠도 받아보세요.',
    };

    // slideCount is an upper bound here, not a quota: when the source has
    // fewer sentences than requested slides we emit a shorter deck rather than
    // padding it out with slides that repeat the same source text.
    const slides = [coverSlide, ...bodySlides, closingSlide].slice(0, request.slideCount);
    slides.forEach((slide, index) => {
      slide.order = index + 1;
      slide.eyebrow = String(index + 1).padStart(2, '0');
    });

    return {
      provider: 'rule-fallback',
      // Was a plain slice while the slides beside it already clamped on
      // grapheme boundaries - a missed sibling. A 60th UTF-16 unit landing
      // inside an emoji left a dangling surrogate in the deck title.
      title: this.headline(source, 60) || 'snaps 카드뉴스',
      templateId: request.templateId,
      brandColor: request.brandColor,
      slides,
      // Same miss, and this one is published: the variant builder clamps to
      // the platform limit, which is above 300, so a broken pair here
      // survives all the way to the post.
      caption: snapsClampText(source, 300),
      hashtags: sanitizeSnapsHashtags(['#카드뉴스', '#snaps']),
    };
  }

  /**
   * Splits sentences into contiguous, order-preserving chunks - one per body
   * slide. Distributing round-robin (`chunks[index % chunkCount]`) instead
   * scrambled the deck: with 8 sentences over 4 slides the reader got
   * 1,5 / 2,6 / 3,7 / 4,8 rather than 1,2 / 3,4 / 5,6 / 7,8. Leftover
   * sentences go to the earliest chunks so sizes differ by at most one, and
   * empty chunks are dropped so a slide never falls back to echoing the whole
   * source text.
   */
  private chunkSentences(sentences: string[], chunkCount: number) {
    const total = sentences.length;
    const buckets = Math.max(1, Math.min(chunkCount, total));
    if (total <= 0) {
      return [] as string[][];
    }

    const baseSize = Math.floor(total / buckets);
    const remainder = total % buckets;
    const chunks: string[][] = [];
    let cursor = 0;

    for (let index = 0; index < buckets; index += 1) {
      const size = baseSize + (index < remainder ? 1 : 0);
      chunks.push(sentences.slice(cursor, cursor + size));
      cursor += size;
    }

    return chunks;
  }

  private normalizeRequest(
    body?: Partial<SnapsCardNewsRequest> | null
  ): Required<SnapsCardNewsRequest> {
    return {
      sourceText: this.cleanSourceText(body?.sourceText),
      slideCount: this.slideCount(body?.slideCount),
      tone: this.text(body?.tone, '한국 SNS 카드뉴스 톤', 200),
      templateId: this.templateId(body?.templateId),
      brandColor: this.brandColor(body?.brandColor),
    };
  }

  private slideCount(value?: unknown) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return DEFAULT_SLIDES;
    }
    return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.round(normalized)));
  }

  /**
   * The short label at the top of a slide.
   *
   * The footer prints the slide's position - "3 / 6" - and the eyebrow falls
   * back to that same position, so the two are meant to agree. The model
   * numbers slides by its own scheme though: seen on a rendered deck, a slide
   * carried "02" at the top and "3 / 6" at the bottom, two numbering systems
   * contradicting each other on one card.
   *
   * A numeric eyebrow is the slide number, so it follows the position. A
   * textual one is a label the model chose - "환절기 건강", "마무리" - and is
   * kept as written.
   */
  private slideEyebrow(value: unknown, index: number) {
    const positional = String(index + 1).padStart(2, '0');
    const supplied = this.text(value, positional, 20);
    return /^\d+$/.test(supplied.trim()) ? positional : supplied;
  }

  private templateId(value?: unknown): SnapsCardNewsTemplateId {
    return templateIds.includes(value as SnapsCardNewsTemplateId)
      ? (value as SnapsCardNewsTemplateId)
      : 'editorial';
  }

  private brandColor(value?: unknown) {
    const text = this.text(value, '', 20);
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#1F2937';
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown, fallback = '', maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((entry) => this.text(entry, '', maxLength))
        .filter(Boolean)
        .join(' ');
    }

    const normalized = raw.trim().replace(/\s+/g, ' ');
    return snapsClampText(normalized || fallback, maxLength);
  }

  /** A single-line form of the source, for a field rendered on one line. */
  private headline(value: string, maxLength: number) {
    return snapsClampText(
      String(value ?? '').replace(/\s+/g, ' ').trim(),
      maxLength
    );
  }

  /**
   * Drops the bullet a pasted list carries on every line. Keeping them
   * put a stray `- ` in the middle of a rendered card once the lines were
   * joined back together.
   */
  private stripListMarkers(lines: string[]) {
    return lines.map((line) =>
      line.replace(/^[-*\u2022\u00b7]\s+/, '').replace(/^\d+[.)]\s+/, '')
    );
  }

  /**
   * The source text, kept in the shape the operator pasted it.
   *
   * This used to go through text(), which collapses every run of
   * whitespace to a single space. That is right for a heading and wrong
   * here: the line structure is what the deck is split on, so a pasted
   * bulleted note arrived as one long line and produced one body slide
   * with everything crammed into it, whatever slideCount asked for.
   * Runs of spaces still collapse; newlines survive.
   */
  private cleanSourceText(value: unknown) {
    if (typeof value !== 'string') {
      return this.text(value, '', 6000);
    }
    const normalized = value
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return snapsClampText(normalized, 6000);
  }
}
