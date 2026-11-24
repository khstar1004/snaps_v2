import type { DialogueMode, DialogueSegment, ScriptToJsonSlide } from "@/lib/studio/codex-script-to-json";
import {
  captionLineFits,
  describeCaptionLayoutBudget,
  LEGACY_CAPTION_LAYOUT_POLICY,
  LEGACY_MAX_CAPTION_LINE_CHARACTERS,
  measureCaptionLine,
  toCaptionPlanningLength,
  type CaptionLayoutPolicy,
} from "@/lib/studio/caption-layout";

export type ScriptStructure = {
  lines: string[];
  title: string;
  bodyLines: string[];
  cta: string;
  bodyText: string;
};

export const MIN_SCRIPT_TO_JSON_SLIDE_CHARS = 16;
export const MAX_SCRIPT_TO_JSON_SLIDE_CHARS = 44;
export const TARGET_SCRIPT_TO_JSON_SLIDE_CHARS = 28;
export const MAX_SCRIPT_TO_JSON_LINE_CHARS = LEGACY_MAX_CAPTION_LINE_CHARACTERS;
const HANGUL_GLOSS_TOKEN_REGEX = /^[가-힣]+$/u;
const ANNOTATED_HANJA_GLOSS_TOKEN_REGEX = /^[가-힣]+\([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+\)$/u;
const TAIL_FRAGMENT_REGEX = /(거 아니야\?|거잖아!|아니냐\?|맞네\?|거지\?|써봐!|아니야\?|잖아!|거지!|아냐\?)$/;
const PARTICLE_START_REGEX = /^(은|는|이|가|을|를|에|의|도|만|와|과|로|으로|라고|이며|지만|인데|한데|또는|그리고)\b/;
const CLEARLY_DANGLING_PAGE_ENDS = [
  "그래서",
  "그래서 오늘은",
  "그런데",
  "그런데 갑자기",
  "하지만",
  "하지만 사실",
  "그리고",
  "그러면",
  "그러자",
  "그러다",
  "그러던 중",
  "알고 보니",
  "문제는",
  "이유는",
  "그때",
  "그때 내가",
  "이때",
  "어느 날",
  "그날부터",
  "시험 기간에",
  "시험 끝나고",
  "옆에서",
] as const;
const CLEARLY_DANGLING_FINAL_TOKENS = new Set([
  "내",
  "네",
  "그",
  "이",
  "저",
  "한",
  "첫",
  "두",
  "세",
  "다",
  "더",
  "못",
  "안",
  "잘",
  "매일",
  "항상",
  "자주",
  "가끔",
  "갑자기",
  "진짜",
  "사실",
  "이미",
  "아직",
  "바로",
  "계속",
  "같은",
  "다른",
  "어떤",
  "모든",
]);

export function normalizeScriptWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function toComparableText(text: string): string {
  return normalizeScriptWhitespace(text);
}

function splitBySentenceBoundary(text: string): string[] {
  const matched = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
  const normalized = matched
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalized.length > 0) return normalized;
  return text.trim() ? [text.trim()] : [];
}

function stripListPrefix(line: string): string {
  return line
    .replace(/^(?:대본|script)\s*:\s*/i, "")
    .replace(/^\s*(?:[-*•]+|\d+[.)]|[A-Za-z][.)]|[가-힣][.)])\s*/, "")
    .trim();
}

export function normalizeGeneratedScript(raw: string): string {
  const plain = typeof raw === "string"
    ? raw
        .replace(/```[a-z0-9_-]*\s*/gi, "")
        .replace(/```/g, "")
        .trim()
    : "";
  if (!plain) return "";
  const normalizedLines = plain
    .split(/\r?\n+/)
    .map((line) => normalizeScriptWhitespace(stripListPrefix(line)))
    .filter(Boolean);
  if (normalizedLines.length >= 2) {
    return normalizedLines.join("\n");
  }
  return splitBySentenceBoundary(normalizeScriptWhitespace(stripListPrefix(plain)))
    .map((line) => normalizeScriptWhitespace(stripListPrefix(line)))
    .filter(Boolean)
    .join("\n");
}

function toCharLength(text: string): number {
  return Array.from(text).length;
}

export function toScriptBodyTokens(text: string): string[] {
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isHanjaGlossPair(tokens: string[], startTokenIndex: number): boolean {
  return (
    HANGUL_GLOSS_TOKEN_REGEX.test(tokens[startTokenIndex] || "") &&
    ANNOTATED_HANJA_GLOSS_TOKEN_REGEX.test(tokens[startTokenIndex + 1] || "")
  );
}

function isHanjaGlossListTokens(tokens: string[]): boolean {
  if (tokens.length < 4 || tokens.length % 2 !== 0) return false;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 2) {
    if (!isHanjaGlossPair(tokens, tokenIndex)) return false;
  }
  return true;
}

function isHanjaGlossListText(text: string): boolean {
  return isHanjaGlossListTokens(toScriptBodyTokens(text));
}

export function toCaptionLineLength(
  text: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): number {
  return toCaptionPlanningLength(text, captionLayoutPolicy);
}

export type CompactQuoteTokenSpan = {
  startTokenIndex: number;
  endTokenIndex: number;
  text: string;
};

export type CompactDependentPhraseTokenSpan = {
  startTokenIndex: number;
  endTokenIndex: number;
  text: string;
};

export type CompactHanjaGlossPairTokenSpan = {
  startTokenIndex: number;
  endTokenIndex: number;
  text: string;
};

export function findCompactHanjaGlossPairTokenSpans(tokens: string[]): CompactHanjaGlossPairTokenSpan[] {
  const spans: CompactHanjaGlossPairTokenSpan[] = [];
  for (let tokenIndex = 0; tokenIndex < tokens.length - 1; tokenIndex += 1) {
    if (!isHanjaGlossPair(tokens, tokenIndex)) continue;
    spans.push({
      startTokenIndex: tokenIndex,
      endTokenIndex: tokenIndex + 1,
      text: tokens.slice(tokenIndex, tokenIndex + 2).join(" "),
    });
    tokenIndex += 1;
  }
  return spans;
}

export function findCompactQuoteTokenSpans(
  tokens: string[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): CompactQuoteTokenSpan[] {
  const spans: CompactQuoteTokenSpan[] = [];
  let asciiQuoteStart: number | null = null;
  let doubleCurlyQuoteStart: number | null = null;
  let singleCurlyQuoteStart: number | null = null;

  const completeSpan = (startTokenIndex: number | null, endTokenIndex: number) => {
    if (startTokenIndex === null) return;
    const text = tokens.slice(startTokenIndex, endTokenIndex + 1).join(" ");
    if (captionLineFits(text, captionLayoutPolicy)) {
      spans.push({ startTokenIndex, endTokenIndex, text });
    }
  };

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    for (const character of Array.from(tokens[tokenIndex])) {
      if (character === '"') {
        if (asciiQuoteStart === null) {
          asciiQuoteStart = tokenIndex;
        } else {
          completeSpan(asciiQuoteStart, tokenIndex);
          asciiQuoteStart = null;
        }
      } else if (character === "“") {
        doubleCurlyQuoteStart = tokenIndex;
      } else if (character === "”") {
        completeSpan(doubleCurlyQuoteStart, tokenIndex);
        doubleCurlyQuoteStart = null;
      } else if (character === "‘") {
        singleCurlyQuoteStart = tokenIndex;
      } else if (character === "’") {
        completeSpan(singleCurlyQuoteStart, tokenIndex);
        singleCurlyQuoteStart = null;
      }
    }
  }
  return spans;
}

export function findCompactDependentPhraseTokenSpans(
  tokens: string[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): CompactDependentPhraseTokenSpan[] {
  const spans: CompactDependentPhraseTokenSpan[] = [];
  const isDependentPhrase = (head: string, auxiliary: string) => {
    if (/^(?:수|수가|수도)$/.test(head)) return /^(?:있|없)/.test(auxiliary);
    if (/^(?:것|거)$/.test(head)) return /^같/.test(auxiliary);
    if (head === "지") return /^(?:모르|몰|않|못)/.test(auxiliary);
    if (head === "줄") return /^(?:알|모르|몰)/.test(auxiliary);
    return false;
  };

  for (let headTokenIndex = 1; headTokenIndex < tokens.length - 1; headTokenIndex += 1) {
    if (!isDependentPhrase(tokens[headTokenIndex], tokens[headTokenIndex + 1])) continue;
    const startTokenIndex = headTokenIndex - 1;
    const endTokenIndex = headTokenIndex + 1;
    const text = tokens.slice(startTokenIndex, endTokenIndex + 1).join(" ");
    if (captionLineFits(text, captionLayoutPolicy)) {
      spans.push({ startTokenIndex, endTokenIndex, text });
    }
  }
  return spans;
}

function collectLineEndTokenIndexes(slides: ScriptToJsonSlide[]): Set<number> {
  const lineEndTokenIndexes = new Set<number>();
  let tokenCursor = 0;
  for (const slide of slides) {
    for (const line of slide.lines) {
      tokenCursor += toScriptBodyTokens(line).length;
      lineEndTokenIndexes.add(tokenCursor - 1);
    }
  }
  return lineEndTokenIndexes;
}

export function assertCompactQuotesStayOnOneLine(
  slides: ScriptToJsonSlide[],
  bodyText: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): void {
  const tokens = toScriptBodyTokens(bodyText);
  const compactQuoteSpans = findCompactQuoteTokenSpans(tokens, captionLayoutPolicy);
  if (compactQuoteSpans.length <= 0) return;

  const lineEndTokenIndexes = collectLineEndTokenIndexes(slides);

  for (const span of compactQuoteSpans) {
    for (let tokenIndex = span.startTokenIndex; tokenIndex < span.endTokenIndex; tokenIndex += 1) {
      if (!lineEndTokenIndexes.has(tokenIndex)) continue;
      throw new Error(
        `${describeCaptionLayoutBudget(captionLayoutPolicy)} 안에 드는 인용문 ${JSON.stringify(span.text)}은 한 줄에 배치해야 합니다.`
      );
    }
  }
}

export function assertDependentPhrasesStayWithPredicate(
  slides: ScriptToJsonSlide[],
  bodyText: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): void {
  const tokens = toScriptBodyTokens(bodyText);
  const compactDependentPhraseSpans = findCompactDependentPhraseTokenSpans(tokens, captionLayoutPolicy);
  if (compactDependentPhraseSpans.length <= 0) return;

  const lineEndTokenIndexes = collectLineEndTokenIndexes(slides);
  for (const span of compactDependentPhraseSpans) {
    for (let tokenIndex = span.startTokenIndex; tokenIndex < span.endTokenIndex; tokenIndex += 1) {
      if (!lineEndTokenIndexes.has(tokenIndex)) continue;
      throw new Error(
        `의존 서술어 묶음 ${JSON.stringify(span.text)}은 한 줄에 배치해야 합니다. "수 있어" 같은 표현을 앞의 핵심 동사와 분리하지 마세요.`
      );
    }
  }
}

type HanjaGlossPageSpan = {
  startTokenIndex: number;
  endTokenIndex: number;
  text: string;
};

function findHanjaGlossPageSpans(
  source: ScriptStructure,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): HanjaGlossPageSpan[] {
  const lineRanges: Array<{ startTokenIndex: number; endTokenIndex: number; text: string }> = [];
  let tokenCursor = 0;
  for (const bodyLine of source.bodyLines) {
    const tokens = toScriptBodyTokens(bodyLine);
    if (tokens.length <= 0) continue;
    const startTokenIndex = tokenCursor;
    tokenCursor += tokens.length;
    lineRanges.push({
      startTokenIndex,
      endTokenIndex: tokenCursor - 1,
      text: bodyLine,
    });
  }

  const spans: HanjaGlossPageSpan[] = [];
  for (let lineIndex = 0; lineIndex < lineRanges.length - 1; lineIndex += 1) {
    const glossLine = lineRanges[lineIndex];
    const followupLine = lineRanges[lineIndex + 1];
    if (!isHanjaGlossListText(glossLine.text)) continue;
    const lineCount =
      toLinesStrict(glossLine.text, captionLayoutPolicy).length +
      toLinesStrict(followupLine.text, captionLayoutPolicy).length;
    if (lineCount < 2 || lineCount > 4) continue;
    spans.push({
      startTokenIndex: glossLine.startTokenIndex,
      endTokenIndex: followupLine.endTokenIndex,
      text: `${glossLine.text} ${followupLine.text}`,
    });
  }
  return spans;
}

export function assertHanjaGlossPairsStayTogether(
  slides: ScriptToJsonSlide[],
  source: ScriptStructure,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): void {
  const tokens = toScriptBodyTokens(source.bodyText);
  const pairSpans = findCompactHanjaGlossPairTokenSpans(tokens);
  const lineEndTokenIndexes = collectLineEndTokenIndexes(slides);
  for (const span of pairSpans) {
    if (!lineEndTokenIndexes.has(span.startTokenIndex)) continue;
    throw new Error(
      `한자 풀이 묶음 ${JSON.stringify(span.text)}은 한 줄에 배치해야 합니다. 뜻과 음(漢)을 분리하지 마세요.`
    );
  }

  const pageEndTokenIndexes = new Set<number>();
  let tokenCursor = 0;
  for (const slide of slides) {
    tokenCursor += toScriptBodyTokens(slide.text).length;
    pageEndTokenIndexes.add(tokenCursor - 1);
  }
  for (const span of findHanjaGlossPageSpans(source, captionLayoutPolicy)) {
    for (let tokenIndex = span.startTokenIndex; tokenIndex < span.endTokenIndex; tokenIndex += 1) {
      if (!pageEndTokenIndexes.has(tokenIndex)) continue;
      throw new Error(
        `한자 풀이 목록과 바로 다음 설명은 4줄 안에 들어가므로 같은 페이지에 배치해야 합니다: ${JSON.stringify(span.text)}`
      );
    }
  }
}

export function findOverlongScriptBodyToken(
  text: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): { token: string; tokenIndex: number; length: number } | null {
  const tokens = toScriptBodyTokens(text);
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    const length = measureCaptionLine(token, captionLayoutPolicy);
    if (!captionLineFits(token, captionLayoutPolicy)) {
      return { token, tokenIndex, length };
    }
  }
  return null;
}

export function findClearlyDanglingPageEnd(text: string): string | null {
  const normalized = normalizeScriptWhitespace(text);
  if (!normalized) return null;
  const asciiQuoteCount = (normalized.match(/"/g) || []).length;
  const openingQuoteCount = (normalized.match(/[“‘]/g) || []).length;
  const closingQuoteCount = (normalized.match(/[”’]/g) || []).length;
  if (asciiQuoteCount % 2 !== 0 || openingQuoteCount !== closingQuoteCount) {
    return "닫히지 않은 인용문";
  }
  if (/[.!?。！？]["'”’)]?$/.test(normalized)) return null;
  for (const ending of CLEARLY_DANGLING_PAGE_ENDS) {
    if (normalized === ending || normalized.endsWith(` ${ending}`)) return ending;
  }
  return null;
}

function splitLongSentenceBySpace(sentence: string, maxChars: number): string[] {
  const tokens = toScriptBodyTokens(sentence);
  if (tokens.length <= 1) return [sentence.trim()];
  const chunks: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (current && toCharLength(candidate) > maxChars) {
      chunks.push(current);
      current = token;
      continue;
    }
    current = candidate;
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function isOrphanChunk(text: string, isLast: boolean): boolean {
  if (!text.trim()) return true;
  if (!isLast && toCharLength(text) < 12) return true;
  return TAIL_FRAGMENT_REGEX.test(text.trim());
}

function toLinesStrict(
  text: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string[] {
  const tokens = toScriptBodyTokens(text);
  if (tokens.length === 0) return [];
  if (isHanjaGlossListTokens(tokens)) {
    const pairTexts: string[] = [];
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 2) {
      pairTexts.push(tokens.slice(tokenIndex, tokenIndex + 2).join(" "));
    }
    const glossLines: string[] = [];
    let currentGlossLine = "";
    for (const pairText of pairTexts) {
      const candidate = currentGlossLine ? `${currentGlossLine} ${pairText}` : pairText;
      if (currentGlossLine && !captionLineFits(candidate, captionLayoutPolicy)) {
        glossLines.push(currentGlossLine);
        currentGlossLine = pairText;
        continue;
      }
      currentGlossLine = candidate;
    }
    if (currentGlossLine) glossLines.push(currentGlossLine);
    return glossLines;
  }
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (current && !captionLineFits(candidate, captionLayoutPolicy)) {
      lines.push(current);
      current = token;
      continue;
    }
    current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function splitChunkForLineLimit(text: string): string[] {
  const tokens = toScriptBodyTokens(text);
  if (tokens.length <= 1) return [text.trim()];
  const half = Math.floor(tokens.length / 2);
  const left = tokens.slice(0, half).join(" ").trim();
  const right = tokens.slice(half).join(" ").trim();
  if (!left || !right) return [text.trim()];
  return [left, right];
}

function enforceChunkRules(
  inputChunks: string[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string[] {
  let chunks = inputChunks.map((item) => item.trim()).filter(Boolean);
  for (let guard = 0; guard < 24; guard += 1) {
    let changed = false;

    const splitPass: string[] = [];
    for (const chunk of chunks) {
      const lines = toLinesStrict(chunk, captionLayoutPolicy);
      if (lines.length > 4) {
        const parts = splitChunkForLineLimit(chunk);
        if (parts.length > 1) {
          splitPass.push(...parts);
          changed = true;
          continue;
        }
      }
      splitPass.push(chunk);
    }
    chunks = splitPass;

    const mergePass: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const lines = toLinesStrict(chunk, captionLayoutPolicy);
      const orphan = isOrphanChunk(chunk, i === chunks.length - 1);
      const startsWithParticle = PARTICLE_START_REGEX.test(chunk);
      const shouldMergePrev = mergePass.length > 0 && (orphan || startsWithParticle || lines.length < 2);
      if (shouldMergePrev) {
        const prev = mergePass[mergePass.length - 1];
        mergePass[mergePass.length - 1] = `${prev} ${chunk}`.trim();
        changed = true;
        continue;
      }
      mergePass.push(chunk);
    }
    chunks = mergePass;

    if (!changed) {
      break;
    }
  }

  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    if (i === chunks.length - 1) continue;
    if (toCharLength(chunks[i]) < 12 && i > 0) {
      chunks[i - 1] = `${chunks[i - 1]} ${chunks[i]}`.trim();
      chunks.splice(i, 1);
    }
  }

  return chunks;
}

function mergeShortScriptChunks(chunks: string[], minChars: number): string[] {
  const merged: string[] = [];
  for (const chunk of chunks) {
    const normalized = normalizeScriptWhitespace(chunk);
    if (!normalized) continue;
    if (toCharLength(normalized) < minChars && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${normalized}`.trim();
      continue;
    }
    merged.push(normalized);
  }
  if (merged.length > 1 && toCharLength(merged[merged.length - 1]) < minChars) {
    const tail = merged.pop() || "";
    merged[merged.length - 1] = `${merged[merged.length - 1]} ${tail}`.trim();
  }
  return merged;
}

function hasInvalidSlideLines(
  slides: ScriptToJsonSlide[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): boolean {
  return slides.some(
    (slide) =>
      slide.lines.length < 2 ||
      slide.lines.length > 4 ||
      slide.lines.some((line) => !captionLineFits(line, captionLayoutPolicy))
  );
}

type NaturalSlidePlan = {
  score: number;
  slides: ScriptToJsonSlide[];
};

function hasTerminalPunctuation(text: string): boolean {
  return /[.!?。！？]["'”’)]?$/.test(text.trim());
}

function looksLikeCompleteKoreanEnding(text: string): boolean {
  const lastToken = toScriptBodyTokens(text).at(-1) || "";
  if (CLEARLY_DANGLING_FINAL_TOKENS.has(lastToken.replace(/["'”’)]*$/, ""))) return false;
  return /(?:다|요|죠|네|음|함|됨|임|였음|했음|있었음|없었음|더라|거임|랬다|었다|았다|했다|있어|없어|같아|거야|많아|아니야|봐|줘|거든)["'”’)]?$/.test(
    lastToken
  );
}

function looksLikeDanglingKoreanEnding(text: string): boolean {
  const lastToken = (toScriptBodyTokens(text).at(-1) || "").replace(/["'”’)]*$/, "");
  if (!lastToken) return true;
  if (
    CLEARLY_DANGLING_FINAL_TOKENS.has(lastToken) ||
    ["다음", "그런", "이런", "저런", "그래서", "그런데", "하지만", "그리고", "그러면", "문제는", "이유는"].includes(lastToken)
  ) {
    return true;
  }
  return /(?:은|는|이|가|을|를|의|에게|한테|에서|으로|라고|시피|도록|고|며|면서|는데|더니|니까|려고|다가|지만|때문에|위해)$/.test(lastToken);
}

function startsWithSceneTransition(tokens: string[], tokenIndex: number): boolean {
  const next = tokens.slice(tokenIndex, tokenIndex + 3).join(" ");
  return /^(?:어느 날|그날부터|그날|그때|이때|시험 기간에|시험 끝나고|어제|다음 날|그러다|그렇게|이후|며칠 뒤)\b/.test(next);
}

function startsWithDependentContinuation(tokens: string[], tokenIndex: number): boolean {
  const firstToken = (tokens[tokenIndex] || "").replace(/^["'“‘]+/, "");
  return /(?:시피|도록|고|며|면서|는데|더니|니까|려고|다가|지만)$/.test(firstToken);
}

function scoreNaturalLine(line: string, captionLayoutPolicy: CaptionLayoutPolicy): number {
  const length = toCaptionLineLength(line, captionLayoutPolicy);
  let score = 6 - Math.abs(9 - length);
  if (length < 4) score -= 8;
  if (hasTerminalPunctuation(line)) score += 4;
  if (looksLikeCompleteKoreanEnding(line)) score += 6;
  if (looksLikeDanglingKoreanEnding(line)) score -= 2;
  return score;
}

function scoreNaturalSlide(input: {
  lines: string[];
  endTokenIndex: number;
  tokens: string[];
  paragraphEndTokenIndexes: Set<number>;
  captionLayoutPolicy: CaptionLayoutPolicy;
}): number {
  const text = input.lines.join(" ");
  const textLength = input.lines.reduce(
    (sum, line) => sum + toCaptionLineLength(line, input.captionLayoutPolicy),
    0,
  );
  const isLast = input.endTokenIndex === input.tokens.length - 1;
  let score = input.lines.reduce((sum, line) => sum + scoreNaturalLine(line, input.captionLayoutPolicy), 0);
  score += input.lines.length === 3 ? 5 : input.lines.length === 4 ? 3 : 0;
  score += textLength >= 24 && textLength <= 48 ? 8 : -Math.abs(30 - textLength) / 3;
  score -= 5;

  if (!isLast) {
    if (input.paragraphEndTokenIndexes.has(input.endTokenIndex)) score += 28;
    if (hasTerminalPunctuation(text)) score += 24;
    if (looksLikeCompleteKoreanEnding(text)) score += 16;
    if (startsWithSceneTransition(input.tokens, input.endTokenIndex + 1)) score += 18;
    if (startsWithDependentContinuation(input.tokens, input.endTokenIndex + 1)) score -= 32;
    if (findClearlyDanglingPageEnd(text)) score -= 120;
    if (looksLikeDanglingKoreanEnding(text)) score -= 36;
  }
  return score;
}

function buildNaturalSlidesFromBodyText(
  bodyText: string,
  paragraphEndTokenIndexes: Set<number>,
  forbiddenPageEndTokenIndexes: Set<number>,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonSlide[] {
  const tokens = toScriptBodyTokens(bodyText);
  if (tokens.length <= 0) return [];
  const overlong = findOverlongScriptBodyToken(bodyText, captionLayoutPolicy);
  if (overlong) {
    throw new Error(
      `본문의 "${overlong.token}" 어절이 ${describeCaptionLayoutBudget(captionLayoutPolicy)}을 만족할 수 없습니다.`
    );
  }
  const forbiddenLineEndTokenIndexes = new Set<number>();
  const cohesiveTokenSpans = [
    ...findCompactQuoteTokenSpans(tokens, captionLayoutPolicy),
    ...findCompactDependentPhraseTokenSpans(tokens, captionLayoutPolicy),
    ...findCompactHanjaGlossPairTokenSpans(tokens),
  ];
  for (const span of cohesiveTokenSpans) {
    for (let tokenIndex = span.startTokenIndex; tokenIndex < span.endTokenIndex; tokenIndex += 1) {
      forbiddenLineEndTokenIndexes.add(tokenIndex);
    }
  }

  const memo = new Map<number, NaturalSlidePlan | null>();
  const solve = (startTokenIndex: number): NaturalSlidePlan | null => {
    if (startTokenIndex === tokens.length) return { score: 0, slides: [] };
    if (memo.has(startTokenIndex)) return memo.get(startTokenIndex) || null;

    let best: NaturalSlidePlan | null = null;
    const visitLines = (lineStart: number, ranges: Array<[number, number]>) => {
      if (ranges.length >= 4 || lineStart >= tokens.length) return;
      let line = "";
      for (let end = lineStart; end < tokens.length; end += 1) {
        line = line ? `${line} ${tokens[end]}` : tokens[end];
        if (!captionLineFits(line, captionLayoutPolicy)) {
          if (isHanjaGlossPair(tokens, end)) continue;
          break;
        }
        if (forbiddenLineEndTokenIndexes.has(end)) continue;
        const nextRanges = [...ranges, [lineStart, end] as [number, number]];
        if (nextRanges.length >= 2 && !forbiddenPageEndTokenIndexes.has(end)) {
          const rest = solve(end + 1);
          if (rest) {
            const lines = nextRanges.map(([start, finish]) => tokens.slice(start, finish + 1).join(" "));
            const score =
              scoreNaturalSlide({
                lines,
                endTokenIndex: end,
                tokens,
                paragraphEndTokenIndexes,
                captionLayoutPolicy,
              }) + rest.score;
            const candidate: NaturalSlidePlan = {
              score,
              slides: [{ text: lines.join(" "), lines }, ...rest.slides],
            };
            if (!best || candidate.score > best.score) best = candidate;
          }
        }
        if (nextRanges.length < 4 && end + 1 < tokens.length) {
          visitLines(end + 1, nextRanges);
        }
      }
    };

    visitLines(startTokenIndex, []);
    memo.set(startTokenIndex, best);
    return best;
  };

  const plan = solve(0);
  if (!plan || plan.slides.length <= 0 || hasInvalidSlideLines(plan.slides, captionLayoutPolicy)) {
    throw new Error("본문을 자연스러운 2~4줄 슬라이드로 구성할 수 없습니다.");
  }
  return plan.slides;
}

export function buildSlidesFromTexts(
  texts: string[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonSlide[] {
  const merged = mergeShortScriptChunks(texts, MIN_SCRIPT_TO_JSON_SLIDE_CHARS);
  const rebalancedChunks = enforceChunkRules(
    mergeShortScriptChunks(enforceChunkRules(merged, captionLayoutPolicy), MIN_SCRIPT_TO_JSON_SLIDE_CHARS),
    captionLayoutPolicy,
  );
  const slides = rebalancedChunks.map((text) => ({
    text,
    lines: toLinesStrict(text, captionLayoutPolicy),
  }));
  if (slides.length <= 0 || hasInvalidSlideLines(slides, captionLayoutPolicy)) {
    throw new Error("slideTexts could not be normalized into valid 2~4 line slides");
  }
  return slides;
}

export function buildSlidesFromSourceBody(
  source: ScriptStructure,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonSlide[] {
  const paragraphEndTokenIndexes = new Set<number>();
  let tokenCursor = 0;
  for (const bodyLine of source.bodyLines) {
    const tokenCount = toScriptBodyTokens(bodyLine).length;
    if (tokenCount <= 0) continue;
    tokenCursor += tokenCount;
    paragraphEndTokenIndexes.add(tokenCursor - 1);
  }
  const forbiddenPageEndTokenIndexes = new Set<number>();
  for (const span of findHanjaGlossPageSpans(source, captionLayoutPolicy)) {
    for (let tokenIndex = span.startTokenIndex; tokenIndex < span.endTokenIndex; tokenIndex += 1) {
      forbiddenPageEndTokenIndexes.add(tokenIndex);
    }
  }
  const slides = buildNaturalSlidesFromBodyText(
    source.bodyText,
    paragraphEndTokenIndexes,
    forbiddenPageEndTokenIndexes,
    captionLayoutPolicy,
  );
  assertHanjaGlossPairsStayTogether(slides, source, captionLayoutPolicy);
  return slides;
}

export function extractSlideTextsFromParsed(parsed: Record<string, unknown>): string[] {
  if (Array.isArray(parsed.slideTexts)) {
    return parsed.slideTexts
      .map((item) => (typeof item === "string" ? normalizeScriptWhitespace(item) : ""))
      .filter(Boolean);
  }
  return [];
}

export function parseParsedDialogueSegments(value: unknown, slideIndex: number): ScriptToJsonSlide["dialogueSegments"] {
  if (!Array.isArray(value)) return undefined;
  const segments: DialogueSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? normalizeScriptWhitespace(row.text) : "";
    if (!text) continue;
    const type: DialogueSegment["type"] = String(row.type || "").trim().toLowerCase() === "quote" ? "quote" : "narration";
    const rawSpeed =
      (typeof row.speed === "number" || typeof row.speed === "string") &&
      !(typeof row.speed === "string" && !row.speed.trim())
        ? Number(row.speed)
        : Number.NaN;
    const rawPauseAfterMs =
      (typeof row.pauseAfterMs === "number" || typeof row.pauseAfterMs === "string") &&
      !(typeof row.pauseAfterMs === "string" && !row.pauseAfterMs.trim())
        ? Number(row.pauseAfterMs)
        : Number.NaN;
    segments.push({
      type,
      text,
      speakerId: typeof row.speakerId === "string" ? row.speakerId.trim() || undefined : undefined,
      voice: normalizeScriptWhitespace(String(row.voice || "")),
      ...(row.speed !== null && row.speed !== undefined && Number.isFinite(rawSpeed)
        ? { speed: Math.max(0.5, Math.min(2, rawSpeed)) }
        : {}),
      ...(row.pauseAfterMs !== null && row.pauseAfterMs !== undefined && Number.isFinite(rawPauseAfterMs)
        ? { pauseAfterMs: Math.max(0, Math.min(3000, Math.floor(rawPauseAfterMs))) }
        : {}),
    });
    if (segments.length >= 24) break;
  }
  if (segments.length <= 0) return undefined;
  if (segments.some((segment) => !segment.text)) {
    throw new Error(`slides[${slideIndex}].dialogueSegments.text가 비어 있습니다.`);
  }
  return segments;
}

export function normalizeParsedSlideLines(
  text: string,
  rawLines: string[],
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): { lines: string[]; repaired: boolean } {
  const normalizedInput = rawLines.map((line) => normalizeScriptWhitespace(line)).filter(Boolean);
  const joinedInput = normalizeScriptWhitespace(normalizedInput.join(" "));
  const inputValid =
    normalizedInput.length >= 2 &&
    normalizedInput.length <= 4 &&
    normalizedInput.every((line) => captionLineFits(line, captionLayoutPolicy)) &&
    joinedInput === text;
  if (inputValid) {
    return {
      lines: normalizedInput,
      repaired: false,
    };
  }

  const rebuiltFromChunking = buildSlidesFromTexts([text], captionLayoutPolicy)[0]?.lines || [];
  const rebuilt = rebuiltFromChunking.map((line) => normalizeScriptWhitespace(line)).filter(Boolean);
  const joinedRebuilt = normalizeScriptWhitespace(rebuilt.join(" "));
  const rebuiltValid =
    rebuilt.length >= 2 &&
    rebuilt.length <= 4 &&
    rebuilt.every((line) => captionLineFits(line, captionLayoutPolicy)) &&
    joinedRebuilt === text;
  if (rebuiltValid) {
    return {
      lines: rebuilt,
      repaired: true,
    };
  }

  throw new Error("lines 형식 자동 보정 실패");
}

function assertNoClearlyDanglingPageEnds(slides: ScriptToJsonSlide[]): void {
  for (let index = 0; index < slides.length - 1; index += 1) {
    const ending = findClearlyDanglingPageEnd(slides[index].text);
    if (!ending) continue;
    throw new Error(
      `slides[${index}]가 미완성 연결 구절 "${ending}"으로 끝납니다. 이 구절을 다음 슬라이드의 이어지는 서술어와 함께 배치하세요.`
    );
  }
}

export function extractTokenRangeSlidesFromParsed(
  parsed: Record<string, unknown>,
  mode: DialogueMode,
  bodyText: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonSlide[] | null {
  if (!Array.isArray(parsed.slides)) return null;
  const rawSlides = parsed.slides;
  const hasTokenRangePlan = rawSlides.some(
    (item) =>
      Boolean(item && typeof item === "object") &&
      Object.prototype.hasOwnProperty.call(item as Record<string, unknown>, "lineTokenRanges")
  );
  if (!hasTokenRangePlan) return null;

  const bodyTokens = toScriptBodyTokens(bodyText);
  if (bodyTokens.length <= 0) {
    throw new Error("본문 토큰이 비어 있어 lineTokenRanges를 복원할 수 없습니다.");
  }

  let expectedTokenIndex = 0;
  const slides = rawSlides.map((item, slideIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`slides[${slideIndex}]는 객체여야 합니다.`);
    }
    const row = item as Record<string, unknown>;
    const allowedKeys =
      mode === "dialogue"
        ? new Set(["lineTokenRanges", "dialogueSegments"])
        : new Set(["lineTokenRanges"]);
    const unexpectedKeys = Object.keys(row).filter((key) => !allowedKeys.has(key));
    if (unexpectedKeys.length > 0) {
      throw new Error(`slides[${slideIndex}]에 허용되지 않은 필드가 있습니다: ${unexpectedKeys.join(", ")}.`);
    }
    if (!Array.isArray(row.lineTokenRanges)) {
      throw new Error(`slides[${slideIndex}].lineTokenRanges가 없습니다.`);
    }
    if (row.lineTokenRanges.length < 2 || row.lineTokenRanges.length > 4) {
      throw new Error(`slides[${slideIndex}].lineTokenRanges는 2~4개여야 합니다.`);
    }

    const lines = row.lineTokenRanges.map((rawRange, lineIndex) => {
      if (!Array.isArray(rawRange) || rawRange.length !== 2) {
        throw new Error(`slides[${slideIndex}].lineTokenRanges[${lineIndex}]는 [시작, 끝] 배열이어야 합니다.`);
      }
      const start = Number(rawRange[0]);
      const end = Number(rawRange[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= bodyTokens.length) {
        throw new Error(`slides[${slideIndex}].lineTokenRanges[${lineIndex}] 범위가 올바르지 않습니다.`);
      }
      if (start !== expectedTokenIndex) {
        throw new Error(
          `본문 토큰 범위가 연속적이지 않습니다. expectedStart=${expectedTokenIndex} actualStart=${start}`
        );
      }
      expectedTokenIndex = end + 1;
      const line = bodyTokens.slice(start, end + 1).join(" ");
      const lineLength = measureCaptionLine(line, captionLayoutPolicy);
      if (!captionLineFits(line, captionLayoutPolicy)) {
        throw new Error(
          `slides[${slideIndex}].lineTokenRanges[${lineIndex}]로 만든 줄이 허용 폭을 넘습니다(${Math.ceil(lineLength)}). ${describeCaptionLayoutBudget(captionLayoutPolicy)}에 맞게 나누세요.`
        );
      }
      return line;
    });

    const dialogueSegments = mode === "dialogue" ? parseParsedDialogueSegments(row.dialogueSegments, slideIndex) : undefined;
    return {
      text: lines.join(" "),
      lines,
      dialogueSegments,
    };
  });

  if (expectedTokenIndex !== bodyTokens.length) {
    throw new Error(
      `본문 토큰이 끝까지 사용되지 않았습니다. expectedEnd=${bodyTokens.length - 1} actualEnd=${expectedTokenIndex - 1}`
    );
  }
  assertNoClearlyDanglingPageEnds(slides);
  return slides;
}

export function extractSlidesFromParsed(
  parsed: Record<string, unknown>,
  mode: DialogueMode,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonSlide[] {
  if (!Array.isArray(parsed.slides)) return [];
  const slides = parsed.slides.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`slides[${index}]는 객체여야 합니다.`);
    }
    const row = item as Record<string, unknown>;
    const unexpectedKeys = Object.keys(row).filter((key) =>
      mode === "dialogue" ? key !== "text" && key !== "lines" && key !== "dialogueSegments" : key !== "text" && key !== "lines"
    );
    if (unexpectedKeys.length > 0) {
      throw new Error(`slides[${index}]에 허용되지 않은 필드가 있습니다: ${unexpectedKeys.join(", ")}.`);
    }
    const lines = Array.isArray(row.lines)
      ? row.lines.map((line) => (typeof line === "string" ? normalizeScriptWhitespace(line) : "")).filter(Boolean)
      : [];
    const text = typeof row.text === "string" ? normalizeScriptWhitespace(row.text) : "";
    if (!text) {
      throw new Error(`slides[${index}].text가 비어 있습니다.`);
    }
    let normalizedLines: string[] = [];
    try {
      normalizedLines = normalizeParsedSlideLines(text, lines, captionLayoutPolicy).lines;
    } catch {
      if (lines.length < 2 || lines.length > 4) {
        throw new Error(`slides[${index}].lines는 2~4개여야 합니다.`);
      }
      if (lines.some((line) => !captionLineFits(line, captionLayoutPolicy))) {
        throw new Error(`slides[${index}].lines 각 줄은 ${describeCaptionLayoutBudget(captionLayoutPolicy)}을 만족해야 합니다.`);
      }
      const joined = normalizeScriptWhitespace(lines.join(" "));
      if (text !== joined) {
        throw new Error(`slides[${index}]는 text === lines.join(' ') 를 만족해야 합니다.`);
      }
      normalizedLines = lines;
    }
    const dialogueSegments = mode === "dialogue" ? parseParsedDialogueSegments(row.dialogueSegments, index) : undefined;
    return {
      text,
      lines: normalizedLines,
      dialogueSegments,
    };
  });
  assertNoClearlyDanglingPageEnds(slides);
  return slides;
}

export function explainTextMismatch(expected: string, actual: string): string {
  const max = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < max && expected[index] === actual[index]) {
    index += 1;
  }
  const expectedSnippet = expected.slice(index, index + 24) || "<end>";
  const actualSnippet = actual.slice(index, index + 24) || "<end>";
  return `slides 본문을 이어붙인 결과가 원본 body와 다릅니다. expected="${expectedSnippet}" actual="${actualSnippet}"`;
}

export function stripExactTitleSlide(source: ScriptStructure, slideTexts: string[]): string[] {
  const title = toComparableText(source.title);
  const expectedBody = source.bodyText;
  for (let index = 0; index < slideTexts.length; index += 1) {
    if (toComparableText(slideTexts[index]) !== title) continue;
    const candidate = slideTexts.filter((_, itemIndex) => itemIndex !== index);
    if (toComparableText(candidate.join(" ")) === expectedBody) {
      return candidate;
    }
  }
  return slideTexts;
}

export function shouldPreferDeterministicSlides(slides: ScriptToJsonSlide[], source: ScriptStructure): boolean {
  const shortSlideCount = slides.filter((slide) => toCharLength(slide.text) < MIN_SCRIPT_TO_JSON_SLIDE_CHARS).length;
  const avgChars = slides.reduce((sum, slide) => sum + toCharLength(slide.text), 0) / Math.max(1, slides.length);
  const maxReasonableSlideCount = Math.max(6, source.bodyLines.length * 2);
  return slides.length > maxReasonableSlideCount || shortSlideCount > Math.floor(slides.length * 0.2) || avgChars < 18;
}
