/**
 * Cuts text to a length budget without ending in the middle of a character.
 *
 * Every clamp in snaps was `text.slice(0, limit)`, which counts UTF-16 code
 * units and cuts between them. An emoji is two of those units, so a limit that
 * lands between them leaves a lone high surrogate - measured on a Korean
 * caption, one cut position out of 25 produced a string ending in U+D83D, which
 * cannot be encoded as UTF-8 and reaches the platform as a replacement
 * character. The hard split for an over-long token was worse: it also left a
 * lone low surrogate at the start of the following chunk.
 *
 * The budget still counts UTF-16 units, so every existing limit keeps the
 * meaning it has today. Only the cut position moves, and only ever backwards:
 * to the nearest grapheme boundary, which also keeps a skin-tone modifier or a
 * ZWJ family sequence from being torn into pieces that render as different
 * people.
 *
 * "Only ever backwards to a grapheme boundary" includes the boundary at zero.
 * A budget smaller than the first grapheme returns nothing, because the
 * alternative is returning a piece of it - and a piece of a decomposed Hangul
 * syllable is a different syllable.
 */

// Resolved once. Constructing a Segmenter per call showed up while clamping a
// deck of slides, and the locale does not vary.
let segmenter:
  | { segment: (input: string) => Iterable<{ index: number; segment: string }> }
  | undefined;
let segmenterResolved = false;

function graphemeSegmenter() {
  if (!segmenterResolved) {
    segmenterResolved = true;
    const intl = Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity?: string }
      ) => {
        segment: (
          input: string
        ) => Iterable<{ index: number; segment: string }>;
      };
    };
    segmenter = intl.Segmenter
      ? new intl.Segmenter('ko', { granularity: 'grapheme' })
      : undefined;
  }
  return segmenter;
}

export function snapsClampText(value: string, maxLength: number): string {
  const text = String(value ?? '');
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }

  const segments = graphemeSegmenter();
  if (segments) {
    let end = 0;
    for (const { index } of segments.segment(text)) {
      if (index > maxLength) {
        break;
      }
      end = index;
    }
    // Index 0 is a grapheme boundary too. This used to fall through to the code
    // point cut when the first grapheme was larger than the whole budget, on the
    // grounds that returning nothing loses more - but what it returned instead
    // contradicted the promise above. Measured by cutting at every position of
    // text carrying the shapes a Korean caption has: `1️⃣` clamped to 2 came back
    // as `1` plus a dangling variation selector, and decomposed `한` - the form
    // text that has been through macOS arrives in - came back as `하`, which is
    // a different word, not a shorter one. No caller passes a budget that small
    // today (the smallest is 80), so this changes nothing that runs; it makes
    // the guarantee true rather than nearly true.
    return text.slice(0, end);
  }

  // Without Intl.Segmenter, at least never split a surrogate pair.
  let cut = maxLength;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    cut -= 1;
  }
  return text.slice(0, cut);
}

/**
 * Walks text one user-perceived character at a time.
 *
 * Iterating a string gives code points, and an emoji is several of those: a
 * skin-tone modifier, a variation selector and the zero-width joiners in a
 * family sequence all arrive separately. Anything that measures or splits text
 * has to see them as one unit or it charges for each piece and can cut between
 * them. Falls back to code points where Intl.Segmenter is missing.
 */
export function* snapsGraphemes(value: string): Generator<string> {
  const text = String(value ?? '');
  const segments = graphemeSegmenter();
  if (!segments) {
    for (const char of text) {
      yield char;
    }
    return;
  }
  for (const { segment } of segments.segment(text)) {
    yield segment;
  }
}
