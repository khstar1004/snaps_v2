import type { DialogueMode, ScriptToJsonSlide } from "@/lib/studio/codex-script-to-json";
import {
  captionLineFits,
  LEGACY_CAPTION_LAYOUT_POLICY,
  type CaptionLayoutPolicy,
} from "@/lib/studio/caption-layout";
import {
  assertCompactQuotesStayOnOneLine,
  assertDependentPhrasesStayWithPredicate,
  assertHanjaGlossPairsStayTogether,
  buildSlidesFromSourceBody,
  buildSlidesFromTexts,
  explainTextMismatch,
  findClearlyDanglingPageEnd,
  findCompactDependentPhraseTokenSpans,
  findCompactHanjaGlossPairTokenSpans,
  findCompactQuoteTokenSpans,
  findOverlongScriptBodyToken,
  extractSlideTextsFromParsed,
  extractSlidesFromParsed,
  extractTokenRangeSlidesFromParsed,
  normalizeGeneratedScript,
  normalizeParsedSlideLines,
  normalizeScriptWhitespace,
  parseParsedDialogueSegments,
  shouldPreferDeterministicSlides,
  stripExactTitleSlide,
  toScriptBodyTokens,
  toCaptionLineLength,
  toComparableText,
} from "@/lib/studio/codex-script-to-json-slides-helpers";
export {
  assertCompactQuotesStayOnOneLine,
  assertDependentPhrasesStayWithPredicate,
  assertHanjaGlossPairsStayTogether,
  buildSlidesFromSourceBody,
  buildSlidesFromTexts,
  explainTextMismatch,
  findClearlyDanglingPageEnd,
  findCompactDependentPhraseTokenSpans,
  findCompactHanjaGlossPairTokenSpans,
  findCompactQuoteTokenSpans,
  findOverlongScriptBodyToken,
  extractSlideTextsFromParsed,
  extractSlidesFromParsed,
  extractTokenRangeSlidesFromParsed,
  normalizeGeneratedScript,
  normalizeParsedSlideLines,
  normalizeScriptWhitespace,
  parseParsedDialogueSegments,
  shouldPreferDeterministicSlides,
  stripExactTitleSlide,
  toScriptBodyTokens,
  toCaptionLineLength,
  toComparableText,
};

export function extractPlainText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/```[a-z0-9_-]*\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

export function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  if (first === -1) {
    return stripped;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = first; index < stripped.length; index += 1) {
    const char = stripped[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return stripped.slice(first, index + 1);
      }
    }
  }
  return stripped.slice(first);
}

export function hasInvalidSlideLines(
  slides: ScriptToJsonSlide[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): boolean {
  return slides.some(
    (slide) =>
      slide.lines.length < 2 ||
      slide.lines.length > 4 ||
      slide.lines.some((line) => !captionLineFits(line, captionLayoutPolicy)),
  );
}

export function toScriptLines(script: string): string[] {
  const normalized = normalizeGeneratedScript(script);
  if (!normalized) return [];
  return normalized
    .split("\n")
    .map((line) => normalizeScriptWhitespace(line))
    .filter(Boolean);
}
