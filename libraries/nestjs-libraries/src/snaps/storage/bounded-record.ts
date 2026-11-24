/**
 * Caps a stored JSON blob so one record cannot take the whole store with it.
 *
 * Three snaps stores keep a free-form object exactly as it arrives: the
 * activity log's `detail`, a report's `report` payload and an agent task's
 * `result`. Every other field around them is length-capped. `/snaps/import`
 * fills all three from an operator's backup file, so a hand-edited or
 * corrupted one lands in a store that every list() call reads back.
 *
 * Measured before this existed:
 *
 * - one report carrying 500 long action items wrote a 100MB JSON file;
 * - the same shape at 5,000 items threw `Invalid string length` out of the
 *   import, taking the valid records in the file with it, because
 *   JSON.stringify ran past V8's maximum string length;
 * - an activity detail nested 2,000 levels deep was stored at 2,000, deep
 *   enough that walking it without a limit throws RangeError.
 *
 * Limits are per store and are set from what the real data measures, not
 * guessed: a report payload is 896 characters at depth 4, a real agent result
 * 6,715 at depth 6, an activity detail 37 to 41 at depth 1. Anything past the
 * limit is replaced by a note saying so rather than dropped in silence, and a
 * cycle is cut rather than followed.
 */
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

export type SnapsRecordBounds = {
  maxChars: number;
  maxDepth: number;
  maxKeys: number;
  maxItems: number;
  maxText: number;
};

export function boundStoredRecord(
  value: unknown,
  bounds: SnapsRecordBounds,
  label: string
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === 'string') {
      // Grapheme-safe. A raw slice here cut between the halves of an
      // emoji: measured, a detail string bounded at the limit came back
      // as `환절기 팁 \ud83d`, a lone high surrogate that survived the
      // JSON round trip into the store and back out to the operator.
      return node.length > bounds.maxText
        ? snapsClampText(node, bounds.maxText)
        : node;
    }
    if (!node || typeof node !== 'object') {
      return node;
    }
    if (seen.has(node)) {
      return '[순환 참조]';
    }
    if (depth >= bounds.maxDepth) {
      return '[중첩 한도 초과]';
    }
    seen.add(node);
    const result = Array.isArray(node)
      ? node.slice(0, bounds.maxItems).map((item) => walk(item, depth + 1))
      : Object.fromEntries(
          Object.entries(node as Record<string, unknown>)
            .slice(0, bounds.maxKeys)
            .map(([key, child]) => [key, walk(child, depth + 1)])
        );
    seen.delete(node);
    return result;
  };

  const bounded = walk(value, 0) as Record<string, unknown>;
  let serialized = '';
  try {
    serialized = JSON.stringify(bounded) || '';
  } catch {
    // Past V8's maximum string length even after the walk. Nothing useful can
    // be kept, and throwing here would fail the whole import.
    //
    // No test covers this branch, deliberately. The walk caps each object at
    // maxKeys and each array at maxItems, but it does not cap the tree, so a
    // wide enough shape still serialises past the limit - reaching it needs
    // roughly 520MB of strings in one input, which is not a reasonable thing
    // to build in a test suite. It is reachable, not dead; do not delete it as
    // unused.
    return {
      note: `${label}이(가) 저장 한도를 넘어 저장하지 않았습니다.`,
    };
  }
  if (serialized.length > bounds.maxChars) {
    return {
      note: `${label}이(가) ${bounds.maxChars}자를 넘어 저장하지 않았습니다.`,
      originalLength: serialized.length,
    };
  }
  return bounded;
}
