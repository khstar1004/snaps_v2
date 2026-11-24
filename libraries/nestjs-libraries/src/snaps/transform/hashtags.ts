/**
 * Turns whatever a caller offers as hashtags into a clean, deduplicated tag
 * list.
 *
 * This lived as a private method on SnapsContentTransformService, so only the
 * transform path got it. The publishing builder is the choke point every snaps
 * flow crosses - including a direct /snaps/schedule-variants call with
 * caller-supplied variants - and without this it published a bare `환절기` as
 * plain text, a lone `#`, `123`, and the same tag twice.
 *
 * Accepts a single string as well as an array, splits on whitespace and commas,
 * drops anything that is not a letter, digit, underscore or hyphen, and puts a
 * single leading `#` back on.
 *
 * Two kinds of duplicate got past the original Set, both of which are the same
 * tag as far as a platform is concerned:
 *
 * - Korean written as decomposed jamo. `환절기` is three code points composed
 *   and eight decomposed, and text that has been through a macOS filesystem
 *   arrives decomposed. Measured: the two forms came out as two entries that
 *   read identically in the published caption.
 * - The same word in different case. Instagram, X and Threads all group tags
 *   case-insensitively, so `#Health` and `#health` are one tag published twice
 *   out of a budget that is as small as one on Threads.
 *
 * Output is composed (NFC) and keeps the casing of the first spelling seen,
 * because the platform shows what was written.
 */
/**
 * Where one tag ends and the next begins.
 *
 * Splitting on whitespace and commas alone left every other separator to
 * be stripped by the character filter below, which welded the tags either
 * side of it into one word. Measured on four shapes:
 * `#환절기#건강관리#면역력` - the run-together form a model emits most
 * often - came out as the single tag `#환절기건강관리면역력`, and
 * `#환절기·건강` and `#환절기/건강` came out as `#환절기건강`. A merged tag
 * is worse than a dropped one: it is published, and nobody searches it.
 *
 * `#` cannot appear inside a tag, so a `#` that is not the first character
 * always starts a new one.
 */
const SEPARATORS = /[\s,、·|\/]+|(?=#)/;

export function sanitizeSnapsHashtags(hashtags?: unknown, limit = 20): string[] {
  const rawValues = Array.isArray(hashtags)
    ? hashtags
    : typeof hashtags === 'string'
    ? [hashtags]
    : [];

  const values = rawValues.flatMap((value) =>
    String(value || '')
      .split(SEPARATORS)
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  const cleaned = values
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^#+/, ''))
    .map((tag) => tag.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean)
    // Composed, so decomposed jamo stops being a second spelling of the same
    // word. This runs after the strip: a decomposed syllable is a letter plus
    // combining marks, and the marks are letters too under \p{L}.
    .map((tag) => tag.normalize('NFC'));

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tag of cleaned) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(`#${tag}`);
  }

  return kept.slice(0, Math.max(0, limit));
}
