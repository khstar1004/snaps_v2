import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  SnapsCardNewsDeck,
  SnapsCardNewsSlide,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { snapsGraphemes } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

export type SnapsCardNewsRenderedSlide = {
  order: number;
  buffer: Buffer;
  mimetype: 'image/png';
  filename: string;
  /**
   * Which of this slide's texts did not fit and ends in an ellipsis.
   *
   * The slide itself shows the ellipsis, so a reader who opens the image can
   * see something was cut. Nobody reading the response could: the variant
   * builder reports the captions it trims and the transform reports its clamp,
   * and this was the one layer that trimmed in silence. Measured on a 192
   * character supplied body, which fills all six lines and loses the rest.
   */
  trimmed?: Array<'heading' | 'body'>;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 88;
/**
 * Must match the family name fontconfig reads out of the bundled OTFs, which is
 * plain "Pretendard" (`fc-list` reports `Pretendard:style=Bold` etc). An earlier
 * invented alias, "Snaps Pretendard", matched nothing: `fc-match` resolved it to
 * DejaVu Sans, so Latin text rendered in DejaVu and font-weight 700 vs 800 came
 * out identical because neither mapped to a real face. Korean still looked fine
 * only because fontconfig fell back per-glyph to the one font that had Hangul.
 */
const FONT_FAMILY = 'Pretendard';

/**
 * Line clamps, sized against the 1350px slide so text cannot run past the
 * footer at HEIGHT-70. Worst case on a body slide: heading starts at y=320 and
 * each heading line is 62*1.2=74.4px, so 6 lines end at ~766; the body then
 * starts 60px lower and each line is 40*1.5=60px, so 6 more lines end at
 * ~1186 - still clear of the footer. Hashtags render in the fixed band from
 * HEIGHT-170 to the footer, which fits 2 lines at 38px.
 */
const MAX_HEADING_LINES = 6;
const MAX_BODY_LINES = 6;
/** Marks a line the slide had no room to finish. */
const ELLIPSIS = '…';
const MAX_HASHTAG_LINES = 2;

/** Body slides lay text out from here down to the hashtag/footer band. */
const BODY_SLIDE_TEXT_TOP = 320;
const TEXT_BOTTOM_LIMIT = HEIGHT - 200;
const HEADING_BODY_GAP = 60;

/**
 * The workspace offers three templates and the deck has carried a templateId
 * from the start, but the renderer never read it, so all three produced
 * byte-identical images. These are the knobs that actually make them differ.
 *
 * Font sizes vary per template, so the line clamps cannot stay the fixed 6/6
 * that were computed for editorial's 62px/40px. They are derived from the
 * sizes in lineBudget() instead, and MAX_HEADING_LINES/MAX_BODY_LINES are the
 * upper bound rather than the value.
 */
type SnapsCardNewsTemplateStyle = {
  coverHeadingSize: number;
  bodyHeadingSize: number;
  bodySize: number;
  /** Which slides get the brand gradient rather than a light background. */
  gradient: 'cover-and-closing' | 'all' | 'none';
  accent: 'top-rule' | 'left-bar' | 'none';
  lightBackground: string;
};

const CARD_NEWS_TEMPLATE_STYLES: Record<string, SnapsCardNewsTemplateStyle> = {
  // 신문/매거진 스타일의 정돈된 레이아웃 - the original look.
  editorial: {
    coverHeadingSize: 76,
    bodyHeadingSize: 62,
    bodySize: 40,
    gradient: 'cover-and-closing',
    accent: 'top-rule',
    lightBackground: '#FFFFFF',
  },
  // 큰 타이포와 강한 대비 - brand colour everywhere, oversized headings.
  bold: {
    coverHeadingSize: 96,
    bodyHeadingSize: 78,
    bodySize: 42,
    gradient: 'all',
    accent: 'none',
    lightBackground: '#FFFFFF',
  },
  // 여백 중심의 담백한 스타일 - no gradient, smaller type, a thin accent.
  minimal: {
    coverHeadingSize: 64,
    bodyHeadingSize: 52,
    bodySize: 38,
    gradient: 'none',
    accent: 'left-bar',
    lightBackground: '#FAFAF9',
  },
};

/**
 * A deck handed straight to /card-news/generate skips the service's own
 * allowlist, so this is the only thing standing between caller input and the
 * style lookup. It used to be `STYLES[key] || STYLES.editorial`, which answers
 * Object.prototype for '__proto__' and a function for 'constructor',
 * 'toString', 'valueOf' or 'hasOwnProperty' - all truthy, so the fallback never
 * fired. Measured: the slide still rendered, 773 bytes of SVG instead of 1097,
 * carrying font-size="undefined", and the request returned 200. hasOwnProperty
 * is the check that makes the fallback real.
 */
export function resolveSnapsCardNewsTemplateId(templateId: unknown): string {
  const key = typeof templateId === 'string' ? templateId : '';
  return Object.prototype.hasOwnProperty.call(CARD_NEWS_TEMPLATE_STYLES, key)
    ? key
    : 'editorial';
}

/** The templates the renderer can actually draw. */
export const SNAPS_CARD_NEWS_TEMPLATE_IDS = Object.keys(CARD_NEWS_TEMPLATE_STYLES);

/**
 * See docs/snaps-card-news.md for the full pipeline overview.
 *
 * canvas (node-canvas) needs a native build against system cairo/pango and
 * has no prebuilt binary for every Node/OS combo we run on (broke on both a
 * Node 24 Windows dev box and would need extra apt packages in the Docker
 * image). sharp bundles a statically linked libvips, so SVG-to-PNG works
 * everywhere sharp already works.
 *
 * Fonts come from fontconfig, NOT from the SVG. This renderer used to inline
 * all three Pretendard weights as base64 @font-face rules, but librsvg (inside
 * sharp) ignores @font-face entirely: rendering the same slide with and without
 * those rules produced byte-identical PNGs, while the embed added ~6.3MB of
 * base64 to every slide's SVG. Measured in a container with zero system fonts,
 * Korean text rendered as tofu either way (324 dark pixels); with Pretendard
 * installed through fontconfig it rendered properly (6604 dark pixels).
 *
 * So the font files must be installed into the image via fontconfig - see the
 * fontconfig + fc-cache block in Dockerfile.dev. Removing that install silently
 * degrades every card news slide to tofu.
 */

/**
 * Missing Korean fonts fail silently: slides still render, they just come out
 * as tofu boxes, which is easy to ship without noticing. This probe renders a
 * few Hangul glyphs once per process and measures how much ink lands, so a
 * misconfigured image says so in the logs instead of quietly producing garbage.
 * It measures the real output rather than asking fontconfig, so it also works
 * on dev machines where fonts come from the OS and fc-list does not exist.
 */
let koreanFontProbe: Promise<boolean> | null = null;
const KOREAN_PROBE_MIN_INK = 800;

async function hasUsableKoreanFont(): Promise<boolean> {
  const probeSvg =
    `<svg width="300" height="120" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="300" height="120" fill="#FFFFFF"/>` +
    `<text x="10" y="80" font-size="56" font-weight="700" ` +
    `font-family="${FONT_FAMILY}" fill="#000000">환절기</text></svg>`;

  const { data, info } = await sharp(Buffer.from(probeSvg))
    .raw()
    .toBuffer({ resolveWithObject: true });

  let dark = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index] < 128) {
      dark += 1;
    }
  }
  return dark >= KOREAN_PROBE_MIN_INK;
}

@Injectable()
export class SnapsCardNewsRendererService {
  async renderDeck(deck: SnapsCardNewsDeck): Promise<SnapsCardNewsRenderedSlide[]> {
    await this.warnIfKoreanFontMissing();
    const total = deck.slides.length;
    // Rasterising is sharp's work, and sharp hands it to its own thread pool
    // rather than holding the event loop, so rendering slide by slide spent most
    // of the time waiting. Measured on a ten-slide deck: 266ms in sequence
    // against 87ms together, with no meaningful difference in heap - the buffers
    // are all retained either way. The deck is capped at
    // SNAPS_CARD_NEWS_MAX_SLIDES, so this fans out to at most ten.
    return Promise.all(
      deck.slides.map((slide, index) => this.renderSlide(deck, slide, index, total))
    );
  }

  private async warnIfKoreanFontMissing() {
    if (!koreanFontProbe) {
      koreanFontProbe = hasUsableKoreanFont().catch(() => true);
    }
    if (!(await koreanFontProbe)) {
      console.warn(
        '[snaps card-news] No Korean-capable font is available to the renderer, so slides will ' +
          'render as tofu boxes. Install the Pretendard fonts through fontconfig (see the ' +
          'fontconfig + fc-cache block in Dockerfile.dev); a stale image built before that ' +
          'block was added needs rebuilding. Details: docs/snaps-card-news.md'
      );
    }

    // Korean is all this can check, and only for the case where nothing draws
    // at all. A font that is installed but missing a script cannot be caught
    // this way: measured here, a guaranteed-tofu string came out at 2508 dark
    // pixels against 3077 for Hangul and 2242 for Latin, and two different
    // unsupported code points landed 8% apart - there is no threshold that
    // separates them. So an image built before fonts-noto-cjk and
    // fonts-noto-color-emoji were added draws a Xiaohongshu deck and every
    // emoji as boxes while this probe stays perfectly happy, and warning about
    // it unconditionally would fire on every healthy install instead. What
    // does carry the check is verify:snaps:static, which reads the shipped
    // font's cmap, and the packages named in Dockerfile.dev.
  }

  private async renderSlide(
    deck: SnapsCardNewsDeck,
    slide: SnapsCardNewsSlide,
    index: number,
    total: number
  ): Promise<SnapsCardNewsRenderedSlide> {
    const isCover = index === 0;
    const isClosing = index === total - 1;
    const { svg, trimmed } = this.buildSlideSvg(
      deck,
      slide,
      index,
      total,
      isCover,
      isClosing
    );
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

    return {
      order: slide.order,
      buffer,
      mimetype: 'image/png',
      filename: `card-news-${String(slide.order).padStart(2, '0')}.png`,
      ...(trimmed.length ? { trimmed } : {}),
    };
  }

  private templateStyle(templateId: unknown): SnapsCardNewsTemplateStyle {
    return CARD_NEWS_TEMPLATE_STYLES[resolveSnapsCardNewsTemplateId(templateId)];
  }

  /**
   * Derives the line clamps from the template's font sizes so text still stops
   * above the hashtag/footer band. The clamps used to be the fixed constants
   * 6/6, which only held for editorial's 62px heading and 40px body: bold's
   * 78px heading would have run 6 lines to y~1085 and then pushed the body
   * past the bottom of the slide.
   */
  private lineBudget(headingFontSize: number, bodyFontSize: number, isCover: boolean) {
    const headingLineHeight = headingFontSize * 1.2;
    const bodyLineHeight = bodyFontSize * 1.5;
    // The cover centres its heading and drops the body below the midpoint, so
    // it has roughly half the slide to work with either way.
    const available = isCover
      ? TEXT_BOTTOM_LIMIT - HEIGHT / 2
      : TEXT_BOTTOM_LIMIT - BODY_SLIDE_TEXT_TOP;
    const clamp = (value: number, max: number) =>
      Math.max(1, Math.min(max, Math.floor(value)));

    const headingLines = clamp(
      (available * (isCover ? 0.9 : 0.55)) / headingLineHeight,
      MAX_HEADING_LINES
    );

    return {
      headingLines,
      bodyLinesFor: (actualHeadingLines: number) => {
        if (isCover) {
          // The cover body sits in the fixed band below the midpoint.
          return clamp((TEXT_BOTTOM_LIMIT - (HEIGHT / 2 + 90)) / bodyLineHeight, MAX_BODY_LINES);
        }
        const used = actualHeadingLines * headingLineHeight + HEADING_BODY_GAP;
        return clamp((available - used) / bodyLineHeight, MAX_BODY_LINES);
      },
    };
  }

  private buildSlideSvg(
    deck: SnapsCardNewsDeck,
    slide: SnapsCardNewsSlide,
    index: number,
    total: number,
    isCover: boolean,
    isClosing: boolean
  ): { svg: string; trimmed: Array<'heading' | 'body'> } {
    const style = this.templateStyle(deck.templateId);
    const dark =
      style.gradient === 'all' ||
      (style.gradient === 'cover-and-closing' && (isCover || isClosing));
    const brand = this.sanitizeColor(deck.brandColor);

    const accent =
      style.accent === 'top-rule'
        ? `<rect width="${WIDTH}" height="14" fill="${brand}" />`
        : style.accent === 'left-bar'
        ? `<rect x="0" y="${BODY_SLIDE_TEXT_TOP - 60}" width="10" height="220" fill="${brand}" />`
        : '';

    const background = dark
      ? `<defs>
           <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stop-color="${brand}" />
             <stop offset="100%" stop-color="${this.shade(brand, -0.35)}" />
           </linearGradient>
         </defs>
         <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />`
      : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${style.lightBackground}" />
         ${accent}`;

    const eyebrowColor = dark ? 'rgba(255,255,255,0.85)' : brand;
    const headingColor = dark ? '#FFFFFF' : '#111827';
    const bodyColor = dark ? 'rgba(255,255,255,0.9)' : '#374151';
    const footerColor = dark ? 'rgba(255,255,255,0.7)' : 'rgba(17,24,39,0.5)';

    // The 4th wrapText argument is maxLines, not a font weight. Passing the
    // 800/400 weights here effectively disabled line clamping, so long AI text
    // overflowed past the bottom of the 1350px slide instead of being clipped
    // the way the pre-SVG canvas renderer did (it applied slice(0, 6)).
    const headingFontSize = isCover ? style.coverHeadingSize : style.bodyHeadingSize;
    const bodyFontSize = style.bodySize;
    const budget = this.lineBudget(headingFontSize, bodyFontSize, isCover);
    const headingLines = this.wrapText(
      slide.heading,
      WIDTH - MARGIN * 2,
      headingFontSize,
      budget.headingLines
    );
    const bodyLines = this.wrapText(
      slide.body,
      WIDTH - MARGIN * 2,
      bodyFontSize,
      budget.bodyLinesFor(headingLines.length)
    );

    // An ellipsis at the end of the last kept line is how wrapText says it ran
    // out of room; reading it back here keeps one definition of "cut".
    const trimmed: Array<'heading' | 'body'> = [];
    if (headingLines.some((line) => line.endsWith(ELLIPSIS))) {
      trimmed.push('heading');
    }
    if (bodyLines.some((line) => line.endsWith(ELLIPSIS))) {
      trimmed.push('body');
    }

    const headingY = isCover ? HEIGHT / 2 - (headingLines.length * headingFontSize * 1.2) / 2 : 320;
    const bodyY = isCover
      ? HEIGHT / 2 + 90
      : 320 + headingFontSize * 1.2 * headingLines.length + 60;

    const headingTspans = this.toTspans(headingLines, MARGIN, headingY, headingFontSize * 1.2);
    const bodyTspans = this.toTspans(bodyLines, MARGIN, bodyY, bodyFontSize * 1.5);

    const hashtagsBlock = isClosing
      ? this.buildHashtagsBlock(
          Array.isArray(deck.hashtags) ? deck.hashtags : [],
          MARGIN,
          HEIGHT - 170,
          dark
        )
      : '';

    return {
      svg: `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          text { font-family: '${FONT_FAMILY}'; }
        </style>
      </defs>
      ${background}
      <text x="${MARGIN}" y="150" font-size="32" font-weight="800" fill="${eyebrowColor}">${this.escape(slide.eyebrow)}</text>
      <text font-size="${headingFontSize}" font-weight="800" fill="${headingColor}">${headingTspans}</text>
      <text font-size="${bodyFontSize}" font-weight="400" fill="${bodyColor}">${bodyTspans}</text>
      <text x="${MARGIN}" y="${HEIGHT - 70}" font-size="30" fill="${footerColor}">${index + 1} / ${total}</text>
      <text x="${WIDTH - MARGIN - 100}" y="${HEIGHT - 70}" font-size="30" fill="${footerColor}">snaps</text>
      ${hashtagsBlock}
    </svg>`,
      trimmed,
    };
  }

  private buildHashtagsBlock(hashtags: string[], x: number, y: number, dark: boolean) {
    const lines = this.wrapText(hashtags.slice(0, 8).join('  '), WIDTH - MARGIN * 2, 28, MAX_HASHTAG_LINES);
    // The colour used to be white unconditionally, which only worked because
    // every closing slide had the dark brand gradient behind it. The minimal
    // template keeps its light background all the way through, so white
    // hashtags would have been invisible on the last slide.
    const fill = dark ? 'rgba(255,255,255,0.85)' : 'rgba(17,24,39,0.65)';
    return `<text font-size="28" fill="${fill}">${this.toTspans(lines, x, y, 38)}</text>`;
  }

  private toTspans(lines: string[], x: number, startY: number, lineHeight: number) {
    return lines
      .map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${this.escape(line)}</tspan>`)
      .join('');
  }

  /**
   * No native canvas context is available for real glyph metrics here, so
   * width is estimated per character: full-width (Hangul/CJK) glyphs are
   * treated as square, everything else as roughly half that width. Good
   * enough for card-news layout with generous margins.
   */
  /**
   * SVG gives us no glyph metrics, so line breaking works off an estimate.
   * These ratios were measured against the bundled Pretendard by rendering
   * "<run>H" and "H" and taking the advance delta (em-ratios at 62px):
   *
   *   Hangul 0.865 | Hangul punctuation 0.818 | space 0.252
   *   W 0.915  M 0.853  m 0.834  w 0.777  O 0.726
   *   uppercase avg 0.594 | digits 0.582 | lowercase avg 0.469
   *   ASCII punctuation 0.347 | t 0.340 | I 0.244 | i/l 0.218
   *
   * A single Latin constant cannot be both safe and tight across a 4x spread,
   * so the buckets below each sit just above their measured worst case. The
   * previous flat 1.0 / 0.55 split overestimated Hangul and spaces (wrapping
   * earlier than needed) while UNDERestimating uppercase, digits and especially
   * M/W, which let caps-heavy headings render past the right margin.
   */
  private estimateCharWidth(char: string, fontSize: number) {
    const code = char.codePointAt(0) || 0;

    if (char === ' ' || code === 0x00a0) {
      return fontSize * 0.3;
    }

    // Joiners and modifiers advance nothing on their own. Measured: a skin
    // tone modifier took a thumb from 0.81em to 0.85em, and the zero width
    // joiners in a family sequence added nothing at all.
    if (
      code === 0x200d || // zero width joiner
      (code >= 0xfe00 && code <= 0xfe0f) || // variation selectors
      (code >= 0x1f3fb && code <= 0x1f3ff) // skin tone modifiers
    ) {
      return 0;
    }

    // Measured the same way as the Latin buckets, by rendering and reading the
    // ink extent at 52px: Han and kana come out at 1.00 em and emoji at 0.99,
    // against Hangul's 0.90. All three were missing from the full-width test
    // below and fell through to the 0.55 default, so a Chinese heading was
    // estimated at 55% of what it draws - measured at 1.81x - and ran well past
    // the slide edge. Xiaohongshu is one of the channels this renders for, and
    // an emoji in a Korean heading is ordinary.
    const isWideCjk =
      (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK extension A
      (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
      (code >= 0x3040 && code <= 0x30ff) || // hiragana and katakana
      (code >= 0x31f0 && code <= 0x31ff) || // katakana phonetic extensions
      (code >= 0x2e80 && code <= 0x2eff); // CJK radicals
    if (isWideCjk) {
      return fontSize * 1.02;
    }

    const isEmoji =
      code >= 0x1f000 ||
      (code >= 0x2600 && code <= 0x27bf) || // miscellaneous symbols, dingbats
      (code >= 0x2b00 && code <= 0x2bff); // arrows and stars
    if (isEmoji) {
      return fontSize * 1.05;
    }

    const isFullWidth =
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
      (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
      (code >= 0x3130 && code <= 0x318f) || // Hangul compatibility jamo
      (code >= 0x3000 && code <= 0x303f) || // CJK punctuation
      (code >= 0xff00 && code <= 0xffef); // full-width forms
    if (isFullWidth) {
      return fontSize * 0.92;
    }

    if ('MWmwOQG@%'.includes(char)) {
      return fontSize * 0.95;
    }
    if ('iljItf.,;:\'!|()[]'.includes(char)) {
      return fontSize * 0.38;
    }
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39)) {
      return fontSize * 0.7; // uppercase A-Z and digits
    }

    return fontSize * 0.55;
  }

  private measureText(text: string, fontSize: number) {
    // By code point, deliberately. A grapheme would be the tidier unit, but
    // this renderer draws through librsvg with the bundled fonts, and that
    // stack does not compose a ZWJ sequence: 👨‍👩‍👧 measured 2.83em here,
    // exactly what the three emoji draw separately. Charging per code point
    // stays on the safe side of what is actually painted, and the joiners and
    // modifiers between them are worth nothing - a skin tone modifier moved a
    // thumb from 0.81em to 0.85em.
    // Composed here as well as in toText(). Every caller today arrives
    // through wrapText(), which composes - but the table this feeds reads
    // the syllable block, so the guarantee belongs where the block is read
    // rather than in whoever happens to call it.
    return [...snapsComposeHangul(text)].reduce(
      (sum, char) => sum + this.estimateCharWidth(char, fontSize),
      0
    );
  }

  private wrapText(text: unknown, maxWidth: number, fontSize: number, maxLines = 6): string[] {
    const source = this.toText(text);
    if (!source) {
      return [];
    }

    const words = source.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.measureText(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = '';
      }

      if (this.measureText(word, fontSize) <= maxWidth) {
        current = word;
        continue;
      }

      const broken = this.breakLongWord(word, maxWidth, fontSize);
      lines.push(...broken.slice(0, -1));
      current = broken[broken.length - 1] || '';
    }
    if (current) {
      lines.push(current);
    }

    if (lines.length <= maxLines) {
      return lines;
    }

    // Text that does not fit the slide used to just stop. The reader saw a
    // sentence end mid-word with nothing to say it had been cut - measured on
    // an emoji-heavy 200 character body, which needs seven lines where six fit
    // and lost twenty characters in silence. The ellipsis is added inside the
    // line width, not past it, so the last line still fits.
    const kept = lines.slice(0, maxLines);
    const lastIndex = kept.length - 1;
    let last = kept[lastIndex];
    while (
      last &&
      this.measureText(`${last}${ELLIPSIS}`, fontSize) > maxWidth
    ) {
      const clusters = [...snapsGraphemes(last)];
      clusters.pop();
      last = clusters.join('').trimEnd();
    }
    kept[lastIndex] = `${last}${ELLIPSIS}`;
    return kept;
  }

  private breakLongWord(word: string, maxWidth: number, fontSize: number): string[] {
    const result: string[] = [];
    let chunk = '';
    // Also by grapheme: breaking between the halves of an emoji put a lone
    // surrogate at the end of one line and the rest at the start of the next.
    for (const char of snapsGraphemes(word)) {
      const candidate = chunk + char;
      if (this.measureText(candidate, fontSize) > maxWidth && chunk) {
        result.push(chunk);
        chunk = char;
        continue;
      }
      chunk = candidate;
    }
    if (chunk) {
      result.push(chunk);
    }
    return result;
  }

  private sanitizeColor(color: string) {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1F2937';
  }

  private shade(hexColor: string, amount: number) {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
    if (!match) {
      return hexColor;
    }
    const num = parseInt(match[1], 16);
    const clamp = (value: number) => Math.min(255, Math.max(0, value));
    const r = clamp(((num >> 16) & 0xff) + Math.round(255 * amount));
    const g = clamp(((num >> 8) & 0xff) + Math.round(255 * amount));
    const b = clamp((num & 0xff) + Math.round(255 * amount));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  /**
   * Coerces before escaping. POST /snaps/card-news/generate renders a deck
   * supplied by the caller, so a field can arrive missing or non-string; that
   * used to surface as an opaque 500 ("Cannot read properties of undefined")
   * instead of just rendering an empty slot.
   */
  /**
   * Every string this renderer lays out or draws, in one spelling.
   *
   * The width table below charges a Hangul jamo the same as a syllable, which
   * is right for the compatibility jamo someone types on purpose and wrong for
   * the three jamo a decomposed syllable is made of - that syllable is then
   * charged three times. Measured on `환절기 건강 관리` at 62px: 436.5 composed
   * against 1121.0 decomposed, 2.57x. A heading wrapped and ellipsised long
   * before it reached the margin, and the deck reported it as trimmed.
   *
   * Composing here rather than in the width table covers the drawing too: the
   * SVG carries the composed form, which is what the bundled font has glyphs
   * for.
   */
  private toText(value: unknown): string {
    const text =
      typeof value === 'string' ? value : value == null ? '' : String(value);
    return snapsComposeHangul(text);
  }

  private escape(text: unknown) {
    return this.toText(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
