import type { StudioPromptTemplates } from "@/lib/studio/prompt-templates";
import { renderScriptToJsonPromptTemplate } from "@/lib/studio/prompt-templates";
import {
  buildCaptionTokenWidthPlan,
  describeCaptionLayoutBudget,
  LEGACY_CAPTION_LAYOUT_POLICY,
  type CaptionLayoutPolicy,
} from "@/lib/studio/caption-layout";
import { toScriptStructure } from "@/lib/studio/codex-topic-script";
import { buildDialogueRoutingPlan, toSpeakerVoiceMap } from "@/lib/studio/codex-script-to-json-dialogue";
import {
  assertCompactQuotesStayOnOneLine,
  assertDependentPhrasesStayWithPredicate,
  assertHanjaGlossPairsStayTogether,
  buildSlidesFromSourceBody,
  buildSlidesFromTexts,
  explainTextMismatch,
  extractJsonObjectText,
  extractSlideTextsFromParsed,
  extractSlidesFromParsed,
  extractTokenRangeSlidesFromParsed,
  findOverlongScriptBodyToken,
  hasInvalidSlideLines,
  normalizeScriptWhitespace,
  shouldPreferDeterministicSlides,
  stripExactTitleSlide,
  toScriptBodyTokens,
  toComparableText,
} from "@/lib/studio/codex-script-to-json-slides";
import type { PublishCategory, StudioPrepareRequest } from "@/types/studio-json";

export type DialogueMode = "normal" | "dialogue";
export type CodexPromptOverrides = Partial<StudioPromptTemplates>;

type ScriptStructure = {
  lines: string[];
  title: string;
  bodyLines: string[];
  cta: string;
  bodyText: string;
};

export type ScriptToJsonSlide = {
  text: string;
  lines: string[];
  dialogueSegments?: DialogueSegment[];
};

export type ScriptToJsonParsed = {
  title: string;
  mode: DialogueMode;
  ttsSourceText: string;
  narrationVoice?: string;
  quoteVoice?: string;
  speakerVoices?: SpeakerVoiceMap;
  slides: ScriptToJsonSlide[];
};

export type DialogueSegmentType = "narration" | "quote";

export type DialogueSegment = {
  type: DialogueSegmentType;
  text: string;
  speakerId?: string;
  voice?: string;
  speed?: number;
  pauseAfterMs?: number;
};

export type SpeakerVoiceMap = Record<string, string>;

export type DialogueSlidePlan = {
  hasQuote: boolean;
  segments: DialogueSegment[];
};

export type DialogueRoutingPlan = {
  mode: DialogueMode;
  narrationVoice: string;
  quoteVoice: string;
  speakerVoices?: SpeakerVoiceMap;
  slides: DialogueSlidePlan[];
};

type DialogueAwareSlide = StudioPrepareRequest["slides"][number] & {
  dialogueSegments?: DialogueSegment[];
};

type DialogueAwarePrepareRequest = StudioPrepareRequest & {
  mode?: DialogueMode;
  narrationVoice?: string;
  quoteVoice?: string;
  speakerVoices?: SpeakerVoiceMap;
  slides: DialogueAwareSlide[];
};

export { findOverlongScriptBodyToken, toScriptBodyTokens };

export function buildScriptToJsonSystemPrompt(
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string {
  const dialogueRules =
    mode === "dialogue"
      ? [
          "mode가 dialogue일 때는 mode 필드를 반드시 dialogue로 반환한다.",
          "dialogue 모드 허용 필드: title, mode, narrationVoice, quoteVoice, speakerVoices, slides",
          "slides 각 항목 허용 필드: lineTokenRanges, dialogueSegments",
          "dialogueSegments.type은 narration 또는 quote만 허용한다.",
        ]
      : [];
  const allowedFieldRule =
    mode === "dialogue" ? "허용 필드는 title, mode, narrationVoice, quoteVoice, speakerVoices, slides만이다." : "허용 필드는 title, slides만이다.";
  const slideFieldRule =
    mode === "dialogue"
      ? "slides 각 항목은 lineTokenRanges를 기본으로 하고 dialogueSegments를 선택적으로 포함할 수 있다."
      : "slides 각 항목은 lineTokenRanges만 가진다.";
  const schemaLine =
    mode === "dialogue"
      ? 'JSON 스키마: {"title":"...","mode":"dialogue","narrationVoice":"...","quoteVoice":"...","speakerVoices":{"female_1":"voice_id"},"slides":[{"lineTokenRanges":[[0,2],[3,5]],"dialogueSegments":[{"type":"narration","text":"..."},{"type":"quote","speakerId":"female_1","text":"..."}]}]}'
      : 'JSON 스키마: {"title":"...","slides":[{"lineTokenRanges":[[0,2],[3,5]]}]}';
  const captionBudget = describeCaptionLayoutBudget(captionLayoutPolicy);
  return [
    "너는 한국어 쇼츠 대본의 자연스러운 페이지와 줄 경계를 선택하는 편집자다.",
    "창작, 요약, 문장 수정, 단어 추가, 단어 삭제, 순서 변경 금지. 본문 문자열을 다시 쓰지 말고 제공된 토큰 번호 범위만 선택한다.",
    "출력은 JSON 객체 1개만 반환한다. 설명, 주석, 마크다운, 코드블록 금지.",
    "imageRequest, imageBeats, imageUrl 등 이미지 관련 필드는 출력하지 않는다.",
    "title은 원본의 첫 번째 비어 있지 않은 물리적 줄과 완전히 동일해야 한다.",
    "slides는 title을 제외한 body와 CTA만 담는다.",
    slideFieldRule,
    "lineTokenRanges의 각 범위는 [시작 토큰 번호, 끝 토큰 번호]이며 양끝을 포함한다.",
    "모든 범위는 0번부터 마지막 토큰까지 누락, 중복, 역순 없이 정확히 한 번씩 연속해서 사용한다.",
    `각 토큰 범위로 복원한 한 줄은 ${captionBudget}을 만족해야 하고, 각 slide는 정확히 2~4줄이어야 한다.`,
    '"달 월(月)"처럼 한글 뜻과 한자 음(漢)이 이어지는 한자 풀이 쌍은 절대 줄 사이에서 분리하지 않는다.',
    "화면에 표시되는 한글·한자·영문·괄호·공백을 모두 줄 폭에 포함한다. TTS 발음 규칙은 화면 줄 분할에 적용하지 않는다.",
    "한자 풀이 목록과 바로 다음 설명 문단이 합쳐 4줄 이하이면 반드시 같은 slide에 둔다.",
    "한자 풀이 목록과 설명이 합쳐 4줄을 넘으면 글자를 줄이거나 생략하지 말고 다음 slide로 분리한다.",
    `따옴표를 포함한 완결된 인용문 전체가 ${captionBudget} 안에 들면 반드시 하나의 lineTokenRanges 범위에 넣어 한 줄로 유지한다.`,
    "완결된 인용문이 줄 폭 예산을 초과할 때만 인용문 내부 줄바꿈을 허용한다.",
    `"챙길 수 있어", "감면받을 수 있어", "할 수 없어", "그런 것 같아"처럼 앞 동사와 의존 표현을 합쳐 ${captionBudget} 안에 드는 서술어 묶음은 반드시 한 줄로 유지한다.`,
    '"수 있어", "수 없어", "것 같아" 같은 의존 표현만 다음 줄에 홀로 남기지 않는다. 앞줄을 더 일찍 끊어 핵심 동사와 같은 줄로 옮긴다.',
    "모든 하드 제약을 만족하는 후보 중 의미 흐름이 가장 자연스러운 페이지 경계를 선택한다.",
    "페이지 끝에 '그래서 오늘은', '그런데 갑자기', '알고 보니', '문제는', 주어만 있는 구절, 인용 도입부 같은 미완성 구절을 남기지 않는다.",
    "미완성 연결 구절은 다음 서술어 또는 인용문과 같은 페이지로 넘긴다.",
    "주어와 서술어, 인용 도입부와 실제 대사, 시간 전환어와 이어지는 사건을 가능한 한 같은 페이지에 둔다.",
    "문장이나 사건이 완결되는 지점, 시간·장소·화제가 전환되는 지점을 페이지 경계로 우선한다.",
    ...dialogueRules,
    mode === "dialogue"
      ? "dialogue speakerId는 가능하면 male_1, female_1, unknown_1 같은 안정적인 슬롯 ID를 사용하고, 같은 화자는 slide가 바뀌어도 같은 ID를 재사용한다."
      : "",
    allowedFieldRule,
    schemaLine,
  ].join("\n");
}

function buildScriptToJsonTokenPlanBlock(
  script: string,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string {
  const source = toScriptStructure(script);
  const bodyTokens = toScriptBodyTokens(source.bodyText);
  const tokenLines = bodyTokens.map((token, index) => `t${index}=${JSON.stringify(token)}`);
  const captionBudget = describeCaptionLayoutBudget(captionLayoutPolicy);
  let tokenCursor = 0;
  const paragraphLines = source.bodyLines.map((line, index) => {
    const paragraphTokenCount = toScriptBodyTokens(line).length;
    const start = tokenCursor;
    const end = tokenCursor + paragraphTokenCount - 1;
    tokenCursor += paragraphTokenCount;
    return `문단${index + 1}=t${start}..t${end}`;
  });
  return [
    "[최종 우선 출력 방식]",
    "아래 본문 토큰의 경계만 lineTokenRanges로 반환한다. text와 lines 필드는 반환하지 않는다.",
    '예: {"title":"제목","slides":[{"lineTokenRanges":[[0,2],[3,4]]}]}',
    "각 범위는 양끝 포함이며, 0부터 마지막 토큰까지 정확히 한 번씩 연속 사용한다.",
    `한 범위로 복원되는 문자열은 ${captionBudget}을 만족해야 하고, 한 slide의 범위는 2~4개다.`,
    "제공된 토큰 폭과 토큰 사이 공백 폭을 모두 더한다. 한글·한자·영문·괄호·공백을 생략하지 않는다.",
    '"달 월(月)" 같은 한자 풀이 쌍은 하나의 범위에 둔다.',
    "한자 풀이 목록과 바로 다음 설명 문단이 합쳐 4줄 이하이면 같은 slide에 둔다.",
    "목록과 설명이 합쳐 4줄을 넘으면 원문을 줄이지 말고 slide를 나눈다.",
    `완결된 인용문 전체가 ${captionBudget} 안에 들면 인용문 시작부터 끝까지 반드시 하나의 범위로 묶는다.`,
    "줄 폭 예산을 넘는 인용문만 의미 단위에 맞춰 여러 범위로 나눌 수 있다.",
    `"수 있어", "수 없어", "것 같아" 같은 의존 표현은 앞의 핵심 동사와 합쳐 ${captionBudget} 안에 들면 반드시 하나의 범위로 묶는다.`,
    "페이지 마지막에 미완성 연결 구절을 두지 말고 다음 서술어와 함께 다음 페이지로 넘긴다.",
    "서버가 원문 표시 문자열로 각 범위의 폭을 다시 계산하므로 폭 예산을 넘기는 범위를 반환하지 않는다.",
    "",
    "[고정 title]",
    JSON.stringify(source.title),
    "",
    "[원문 문단 토큰 범위]",
    ...paragraphLines,
    "",
    "[본문 토큰]",
    ...tokenLines,
    "",
    "[토큰별 표시 폭]",
    buildCaptionTokenWidthPlan(bodyTokens, captionLayoutPolicy),
  ].join("\n");
}

export function buildScriptToJsonUserPrompt(
  script: string,
  publishCategory?: PublishCategory,
  promptTemplate?: string,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string {
  const base = renderScriptToJsonPromptTemplate({
    script,
    publishCategory,
    template: promptTemplate,
  });
  const tokenPlanBlock = buildScriptToJsonTokenPlanBlock(script, captionLayoutPolicy);
  if (mode !== "dialogue") {
    return [base, "", tokenPlanBlock].join("\n");
  }
  return [
    base,
    "",
    tokenPlanBlock,
    "",
    "[추가 모드 규칙]",
    "현재 mode=dialogue다.",
    "가능하면 slides[].dialogueSegments를 함께 반환해 나레이션/인용 대사를 분리한다.",
    "대사가 따옴표 안에 있고 화자 구분이 가능하면 dialogueSegments[].speakerId를 함께 넣는다.",
    "speakerId는 가능하면 male_1, female_1, unknown_1 같은 슬롯 ID를 쓰고, 같은 화자는 계속 같은 ID를 유지한다.",
    "speakerVoices는 선택이며, 있으면 화자별 voice id 매핑만 넣는다.",
  ].join("\n");
}

export function parseScriptToJsonResult(
  raw: string,
  sourceScript: string,
  modeHint?: DialogueMode,
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonParsed {
  const source = toScriptStructure(sourceScript);
  const jsonText = extractJsonObjectText(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON 파싱 실패: ${message}`);
  }

  const allowedTopLevelKeys = new Set(["title", "slideTexts", "slides", "mode", "narrationVoice", "quoteVoice", "speakerVoices"]);
  const unexpectedKeys = Object.keys(parsed).filter((key) => !allowedTopLevelKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`허용되지 않은 필드가 있습니다: ${unexpectedKeys.join(", ")}.`);
  }

  const declaredMode: DialogueMode = String(parsed.mode || "").trim().toLowerCase() === "dialogue" ? "dialogue" : "normal";
  const hasDialogueSegmentsField = Array.isArray(parsed.slides)
    ? parsed.slides.some((item) => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return Array.isArray(row.dialogueSegments) && row.dialogueSegments.length > 0;
      })
    : false;
  const inferredMode: DialogueMode = declaredMode === "dialogue" || hasDialogueSegmentsField ? "dialogue" : "normal";
  const mode: DialogueMode = modeHint === "dialogue" ? "dialogue" : modeHint === "normal" ? "normal" : inferredMode;

  const title = typeof parsed.title === "string" ? normalizeScriptWhitespace(parsed.title) : "";
  if (!title) {
    throw new Error("title이 비어 있습니다. 원본 첫 줄 hook을 그대로 넣으세요.");
  }
  if (toComparableText(title) !== toComparableText(source.title)) {
    throw new Error(`title이 원본 첫 줄과 다릅니다. expected="${source.title}" actual="${title}"`);
  }

  const narrationVoice =
    mode === "dialogue" ? normalizeScriptWhitespace(typeof parsed.narrationVoice === "string" ? parsed.narrationVoice : "") || undefined : undefined;
  const quoteVoice =
    mode === "dialogue" ? normalizeScriptWhitespace(typeof parsed.quoteVoice === "string" ? parsed.quoteVoice : "") || undefined : undefined;
  const speakerVoices = mode === "dialogue" ? toSpeakerVoiceMap(parsed.speakerVoices) : undefined;

  const parsedSlides =
    extractTokenRangeSlidesFromParsed(parsed, mode, source.bodyText, captionLayoutPolicy) ??
    extractSlidesFromParsed(parsed, mode, captionLayoutPolicy);
  if (parsedSlides.length > 0) {
    if (parsedSlides.some((slide) => toComparableText(slide.text) === toComparableText(title))) {
      throw new Error("title 문장이 slides에 다시 포함되었습니다.");
    }
    const joinedBody = toComparableText(parsedSlides.map((slide) => slide.text).join(" "));
    if (!joinedBody) {
      throw new Error("slides 본문이 비어 있습니다.");
    }
    if (joinedBody !== source.bodyText) {
      const titleBodyText = [toComparableText(source.title), source.bodyText].filter(Boolean).join(" ");
      if (joinedBody === titleBodyText || parsedSlides.some((slide) => toComparableText(slide.text) === toComparableText(source.title))) {
        throw new Error("slides에 title 문장이 다시 포함되었습니다. title leakage를 제거하세요.");
      }
      throw new Error(explainTextMismatch(source.bodyText, joinedBody));
    }
    assertCompactQuotesStayOnOneLine(parsedSlides, source.bodyText, captionLayoutPolicy);
    assertDependentPhrasesStayWithPredicate(parsedSlides, source.bodyText, captionLayoutPolicy);
    assertHanjaGlossPairsStayTogether(parsedSlides, source, captionLayoutPolicy);
    return {
      title,
      mode,
      ttsSourceText: parsedSlides.map((slide) => slide.text).join(" "),
      narrationVoice,
      quoteVoice,
      speakerVoices,
      slides: parsedSlides,
    };
  }

  const initialSlideTexts = extractSlideTextsFromParsed(parsed);
  if (initialSlideTexts.length <= 0) {
    throw new Error("slides가 비어 있습니다. title을 제외한 body/CTA 구간을 1개 이상 넣으세요.");
  }
  const slideTexts = stripExactTitleSlide(source, initialSlideTexts);
  const joinedBody = toComparableText(slideTexts.join(" "));
  if (!joinedBody) {
    throw new Error("slides 본문이 비어 있습니다.");
  }
  if (joinedBody !== source.bodyText) {
    const titleBodyText = [toComparableText(source.title), source.bodyText].filter(Boolean).join(" ");
    if (joinedBody === titleBodyText || slideTexts.some((item) => toComparableText(item) === toComparableText(source.title))) {
      throw new Error("slides에 title 문장이 다시 포함되었습니다. title leakage를 제거하세요.");
    }
    throw new Error(explainTextMismatch(source.bodyText, joinedBody));
  }

  let slides: ScriptToJsonSlide[];
  try {
    const candidateSlides = buildSlidesFromTexts(slideTexts, captionLayoutPolicy);
    if (shouldPreferDeterministicSlides(candidateSlides, source)) {
      slides = buildSlidesFromSourceBody(source, captionLayoutPolicy);
    } else {
      slides = candidateSlides;
    }
  } catch (error) {
    const fallbackSlides = buildSlidesFromSourceBody(source, captionLayoutPolicy);
    if (fallbackSlides.length <= 0 || hasInvalidSlideLines(fallbackSlides, captionLayoutPolicy)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`slide chunking failed: ${message}`);
    }
    slides = fallbackSlides;
  }

  if (slides.some((slide) => toComparableText(slide.text) === toComparableText(title))) {
    throw new Error("title 문장이 slides에 다시 포함되었습니다.");
  }

  const ttsSourceText = slides.map((slide) => slide.text).join(" ");
  if (toComparableText(ttsSourceText) !== source.bodyText) {
    throw new Error(explainTextMismatch(source.bodyText, toComparableText(ttsSourceText)));
  }
  assertCompactQuotesStayOnOneLine(slides, source.bodyText, captionLayoutPolicy);
  assertDependentPhrasesStayWithPredicate(slides, source.bodyText, captionLayoutPolicy);
  assertHanjaGlossPairsStayTogether(slides, source, captionLayoutPolicy);

  return {
    title,
    mode,
    ttsSourceText,
    narrationVoice,
    quoteVoice,
    speakerVoices,
    slides,
  };
}

export function buildScriptToJsonRepairUserPrompt(
  script: string,
  publishCategory: PublishCategory | undefined,
  previousRaw: string,
  errorMessage: string,
  promptTemplate?: string,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): string {
  const categoryLine = publishCategory ? `카테고리: ${publishCategory}` : "";
  const previous = extractJsonObjectText(previousRaw).trim() || previousRaw.trim() || "(empty)";
  const source = toScriptStructure(script);
  const modeLine = `mode: ${mode}`;
  const fieldRule =
    mode === "dialogue" ? "2. 허용 필드는 title, mode, narrationVoice, quoteVoice, speakerVoices, slides만" : "2. 허용 필드는 title, slides만";
  const slideRule =
    mode === "dialogue"
      ? "4. slides 각 항목은 lineTokenRanges를 기본으로 하고 dialogueSegments를 선택적으로 포함"
      : "4. slides 각 항목은 lineTokenRanges만";
  const dialogueRules =
    mode === "dialogue"
      ? [
          "15. mode는 dialogue로 고정",
          "16. dialogueSegments를 넣을 때는 type/text를 포함하고 speakerId는 선택",
          "17. speakerId를 넣으면 male_1, female_1, unknown_1 같은 슬롯 ID를 사용하고 같은 화자는 같은 ID를 재사용",
        ]
      : [];
  return [
    categoryLine,
    modeLine,
    "[기본 프롬프트]",
    buildScriptToJsonUserPrompt(script, publishCategory, promptTemplate, mode, captionLayoutPolicy),
    "[원본 title/hook]",
    source.title,
    "[원본 body+CTA]",
    source.bodyLines.join("\n"),
    "[직전 응답]",
    previous,
    "[검증 실패]",
    errorMessage,
    "[재작성 규칙]",
    "1. JSON 객체 1개만 반환",
    fieldRule,
    "3. title은 [원본 title/hook]과 완전히 동일",
    slideRule,
    "5. imageRequest, imageBeats, imageUrl 같은 이미지 관련 필드는 넣지 말 것",
    "6. lineTokenRanges는 0번부터 마지막 본문 토큰까지 누락·중복 없이 연속 사용",
    `7. 각 토큰 범위로 복원되는 줄은 ${describeCaptionLayoutBudget(captionLayoutPolicy)}을 만족하고 slide마다 범위 2~4개`,
    '8. "달 월(月)" 같은 한자 풀이 쌍은 한 줄에 두고 한자·괄호·공백도 표시 폭에 포함',
    "9. 한자 풀이 목록과 바로 다음 설명이 합쳐 4줄 이하이면 같은 slide에 배치",
    "10. 목록과 설명이 합쳐 4줄을 넘으면 원문을 줄이지 말고 다음 slide로 분리",
    "11. 줄 폭 예산 안에 드는 완결된 인용문은 반드시 한 토큰 범위로 유지",
    '12. "수 있어", "수 없어", "것 같아" 같은 의존 표현은 앞 핵심 동사와 합쳐 줄 폭 예산 안에 들면 반드시 한 토큰 범위로 유지',
    "13. 미완성 연결 구절은 페이지 끝에 두지 말고 다음 서술어와 함께 배치",
    "14. title 문장을 slides에 넣지 말 것",
    ...dialogueRules,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildDeterministicScriptToJson(
  script: string,
  modeHint: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): ScriptToJsonParsed {
  const source = toScriptStructure(script);
  let slides: ScriptToJsonSlide[];
  try {
    slides = buildSlidesFromSourceBody(source, captionLayoutPolicy);
  } catch {
    slides = buildSlidesFromTexts([source.bodyLines.join(" ")], captionLayoutPolicy);
  }
  if (slides.length <= 0) {
    throw new Error("deterministic script-to-json failed: no slides");
  }
  if (hasInvalidSlideLines(slides, captionLayoutPolicy)) {
    throw new Error("deterministic script-to-json failed: invalid slide lines");
  }
  assertCompactQuotesStayOnOneLine(slides, source.bodyText, captionLayoutPolicy);
  assertDependentPhrasesStayWithPredicate(slides, source.bodyText, captionLayoutPolicy);
  assertHanjaGlossPairsStayTogether(slides, source, captionLayoutPolicy);
  const ttsSourceText = slides.map((slide) => slide.text).join(" ");
  return {
    title: source.title,
    mode: modeHint === "dialogue" ? "dialogue" : "normal",
    ttsSourceText,
    slides,
  };
}

export function toStudioPayloadFromScriptToJson(
  parsed: ScriptToJsonParsed,
  publishCategory?: PublishCategory,
  modeHint?: DialogueMode
): StudioPrepareRequest {
  const dialogueRouting = buildDialogueRoutingPlan({
    slides: parsed.slides,
    modeHint: modeHint === "dialogue" ? "dialogue" : modeHint === "normal" ? "normal" : parsed.mode,
    narrationVoice: parsed.narrationVoice,
    quoteVoice: parsed.quoteVoice,
    speakerVoices: parsed.speakerVoices,
  });
  const slides: DialogueAwareSlide[] = parsed.slides.map((slide, index) => ({
    title: `슬라이드 ${index + 1}`,
    text: slide.text,
    lines: slide.lines,
    layout: "photo+body" as const,
  }));

  const payload: DialogueAwarePrepareRequest = {
    publishCategory,
    videoMode: "singleAudio",
    ttsProvider: "typecast",
    ttsSourceText: parsed.ttsSourceText,
    mode: dialogueRouting.mode,
    narrationVoice: dialogueRouting.narrationVoice,
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: slides.map((slide, slideIndex) => {
      const dialoguePlan = dialogueRouting.slides[slideIndex];
      if (!dialoguePlan || dialoguePlan.segments.length <= 0) return slide;
      return {
        ...slide,
        dialogueSegments: dialoguePlan.segments.map((segment) => ({
          type: segment.type,
          text: segment.text,
          speakerId: segment.speakerId,
          voice: segment.voice,
          speed: segment.speed,
          pauseAfterMs: segment.pauseAfterMs,
        })),
      };
    }),
  };
  if (dialogueRouting.mode === "dialogue") {
    payload.quoteVoice = dialogueRouting.quoteVoice;
    payload.speakerVoices = dialogueRouting.speakerVoices;
  }
  return payload;
}
