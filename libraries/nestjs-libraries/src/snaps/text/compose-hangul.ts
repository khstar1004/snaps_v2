/**
 * Korean in the one spelling the `가-힣` checks in this codebase can see.
 *
 * `가-힣` is the composed syllable block. Hangul also has a decomposed form -
 * initial, medial and final jamo as separate code points - and text that has
 * been through a macOS filesystem arrives that way, which
 * `sanitizeSnapsHashtags` already documents. Every `가-힣` test silently fails
 * on it, and the failures are not cosmetic. Measured:
 *
 * - `snapsMediaFileName` filters to `[^\w.\-가-힣]`, so a decomposed
 *   `환절기영상.mp4` is filed as `______________.mp4`.
 * - `normalizeMetricKey` strips the same way and falls back to the literal
 *   `metric`, so decomposed `좋아요` and `댓글` become **the same key** and the
 *   report adds two different metrics together.
 * - The shorts timeline shares a scene's seconds out by syllable count,
 *   `match(/[가-힣]/g)?.length || 1`. A decomposed narration line of 17
 *   syllables counts as **1**, so every scene gets an equal slice however much
 *   there is to read, and the "too long to read in time" warning never fires.
 *
 * Composing is the fix rather than widening each pattern to include the jamo
 * ranges: the two forms are the same word, and one spelling of it is what
 * everything downstream - deduplication, keys, counting - is written against.
 */
export function snapsComposeHangul(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC') : '';
}
