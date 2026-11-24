import { snapsClampText } from './clamp-text';

/**
 * How X counts a post, which is not how many characters it has.
 *
 * X's limit is 280 *weighted units*, not 280 characters. Latin letters, ASCII
 * punctuation and general punctuation weigh one; everything outside those
 * ranges - Hangul among it - weighs two. The rule is the published
 * twitter-text weighting (config v3: `defaultWeight` 200, `scale` 100, and
 * four ranges at weight 100), which is why the boundaries below look arbitrary.
 *
 * Measured against the X rule this product ships: a Korean variant clamped to
 * the declared 280 characters counts as **479 units** to X and is refused at
 * publish. The same rule on English produces exactly 280 units and is fine. For
 * a Korean-first product the declared limit was therefore wrong for almost
 * every post it writes - and wrong in the direction that fails at the platform
 * rather than in the workspace.
 *
 * About 164 characters of ordinary Korean prose fit in 280 units; the exact
 * number depends on how much of it is spaces and Latin punctuation, which is
 * why this counts rather than assuming a ratio.
 *
 * No live X call was available to confirm the weighting; the source is the
 * published algorithm. If X's rules differ, the failure mode is a Korean post
 * cut shorter than necessary - the opposite of being refused at publish.
 */
const LIGHT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

const weightOf = (codePoint: number) =>
  LIGHT_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to) ? 1 : 2;

/**
 * A link costs the same whatever it says.
 *
 * X rewrites every URL to t.co and counts it as 23 units - twitter-text's
 * `transformedURLLength` - so counting its characters is wrong in both
 * directions, and a caption with a link is the ordinary case for this product.
 * Measured on one Korean sentence plus a link:
 *
 * - `https://s.io/a` weighs 14 here and costs 23 at X, so a post this counted
 *   at 62 units is 71 to X. Near the limit that is a post the workspace said
 *   would fit, scheduled, and X refused - the failure this file exists to stop.
 * - A UTM-tagged link weighs 107 here and still costs 23, so the same sentence
 *   counted 155 against a real 71. That is 84 units - about 42 Korean
 *   characters - cut off the operator's copy for nothing.
 *
 * Only an explicit http(s) URL is treated this way. A bare `example.com` is
 * linkified by X too, but it is also how people write a brand name mid-
 * sentence, and over-counting prose is the worse mistake of the two.
 */
const SNAPS_URL_UNITS = 23;
const SNAPS_URL = /https?:\/\/\S+/gi;

/** The text as a list of things that carry weight: each URL, then each character. */
function weightedTokens(value: string): Array<{ text: string; units: number }> {
  const text = String(value ?? '');
  const tokens: Array<{ text: string; units: number }> = [];
  let at = 0;
  SNAPS_URL.lastIndex = 0;
  for (const match of text.matchAll(SNAPS_URL)) {
    const start = match.index ?? 0;
    for (const character of text.slice(at, start)) {
      tokens.push({ text: character, units: weightOf(character.codePointAt(0) || 0) });
    }
    tokens.push({ text: match[0], units: SNAPS_URL_UNITS });
    at = start + match[0].length;
  }
  for (const character of text.slice(at)) {
    tokens.push({ text: character, units: weightOf(character.codePointAt(0) || 0) });
  }
  return tokens;
}

/** What X counts, for the text as a whole. */
export function snapsWeightedLength(value: string): number {
  // Iterating the string yields code points, so an emoji is one unit of
  // weight two rather than two halves of one.
  return weightedTokens(value).reduce((total, token) => total + token.units, 0);
}

/**
 * Cuts text to a weighted budget, on a grapheme boundary.
 *
 * Reuses snapsClampText for the cut itself: finding the character count that
 * fits and then clamping there keeps one implementation of "never split a
 * character", which is the part that has gone wrong before.
 */
export function snapsClampToWeight(value: string, maxUnits: number): string {
  const text = String(value ?? '');
  if (!Number.isFinite(maxUnits) || maxUnits <= 0) {
    return '';
  }
  if (snapsWeightedLength(text) <= maxUnits) {
    return text;
  }

  // A URL is all or nothing. Half a link is not a shorter link, it is a broken
  // one, and it would not cost 23 units either.
  let used = 0;
  let characters = 0;
  for (const token of weightedTokens(text)) {
    const next = used + token.units;
    if (next > maxUnits) {
      break;
    }
    used = next;
    characters += token.text.length;
  }
  return snapsClampText(text, characters);
}
