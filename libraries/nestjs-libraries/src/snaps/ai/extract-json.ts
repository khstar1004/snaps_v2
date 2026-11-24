/**
 * The JSON payload inside whatever a chat model actually wrote.
 *
 * One function, because there were two byte-identical copies - one in
 * `deepseek.client.ts`, one in `ollama.client.ts` - and a fix to either would
 * have left the other wrong. The Ollama copy is the one that matters most:
 * DeepSeek is asked for `response_format: json_object`, Ollama is not, so its
 * models fence and add a sentence far more often.
 *
 * Measured against fifteen shapes models return, the previous implementation
 * failed four:
 *
 *   - a fence followed by a closing sentence, because it stripped only a fence
 *     anchored at the very end (`/```$/`) and left the rest in place;
 *   - a fence tagged with anything but `json` (`javascript`, `JSON5`), because
 *     only the literal `json` was optional after the backticks;
 *   - a top-level array, because the brace scan cut from the first `{` to the
 *     last `}` and handed back `{"a":1},{"b":2}` with the brackets gone;
 *   - a top-level array followed by a sentence, for the same reason.
 *
 * Each of those made `JSON.parse` throw, which the callers read as "the model
 * failed" and answer from the deterministic path - so the operator got the
 * rule-based result while a perfectly good model response sat in the buffer.
 */
export function snapsExtractJson(content: string): string {
  let trimmed = content.trim();

  if (trimmed.startsWith('```')) {
    // The tag is bounded, not `[^\n]*`: a whole fenced payload can arrive on
    // one line, and a greedy match to the newline would eat the JSON with it.
    trimmed = trimmed.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '');
    // What is between the fences, rather than everything minus a fence at each
    // end - the difference is a trailing sentence.
    const closing = trimmed.indexOf('```');
    if (closing > -1) {
      trimmed = trimmed.slice(0, closing);
    }
    trimmed = trimmed.trim();
  }

  // An array is cut at its own bracket. The object scan below would keep the
  // braces of the elements and drop the brackets that hold them together.
  if (trimmed.startsWith('[')) {
    const lastArray = trimmed.lastIndexOf(']');
    return lastArray > 0 ? trimmed.slice(0, lastArray + 1) : trimmed;
  }

  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject > -1 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  return trimmed;
}
