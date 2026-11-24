import { isCodexCliNotFoundError, resolveDefaultLocalCodexCliModel, runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { runCodexPlannerWithRetry } from "@/lib/studio/codex-planner-retry";
import { allowFallbackToApiWhenCliFails, canUseLocalCodexCliBridge, getCodexModel } from "@/lib/studio/codex-script-transport";
import { DEEPSEEK_API_BASE_URL, isDeepseekConfigured } from "@/lib/studio/ai-provider";
import type { SlideInput, SlideSfxPlanItem, StudioPrepareRequest } from "@/types/studio-json";
const SFX_PLANNER_FAST_CONFIG_OVERRIDES = ['service_tier="fast"'];

type PlannedSfxPlanItem = {
  lineIndex: number;
  tag?: string;
  gainDb?: number;
  offsetMs?: number;
};

type PlannedSfxItem = {
  slideIndex: number;
  sfxPlan?: PlannedSfxPlanItem[];
};

type PlannedSfxResponse = {
  items: PlannedSfxItem[];
};

type PlanResult = {
  payload: StudioPrepareRequest;
  warnings: string[];
};

type PlannerSlide = {
  slideIndex: number;
  groupId: number;
  stepIndex: number;
  text: string;
  lines: string[];
};

type PlannerPromptOptions = {
  hint?: string;
  category?: string;
  mode?: DialogueMode;
  codexModel?: string;
};

type SfxPlannerTransportOverrides = {
  canUseLocalCliBridge?: (codexAccessToken?: string) => boolean;
  allowFallbackToApiWhenCliFails?: () => boolean;
  planByCodexCli?: (
    slides: PlannerSlide[],
    allowedTags: string[],
    options?: PlannerPromptOptions
  ) => Promise<PlannedSfxResponse>;
  planByCodexApi?: (
    slides: PlannerSlide[],
    allowedTags: string[],
    codexAccessToken: string,
    options?: PlannerPromptOptions
  ) => Promise<PlannedSfxResponse>;
};

type DialogueMode = "normal" | "dialogue";
type DialogueSegmentType = "narration" | "quote";
type DialogueSegment = {
  type: DialogueSegmentType;
  text: string;
  speakerId?: string;
};

type TimelineSfxCue = {
  groupId: number;
  lineIndex: number;
  tag: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasPreparedFrameMetadata(slide: SlideInput): boolean {
  return Number.isFinite(slide.groupId) && Number.isFinite(slide.stepIndex);
}

function resolvePreparedFrameText(slide: SlideInput): string {
  const stepIndex = Number.isFinite(slide.stepIndex) ? Math.max(0, Math.floor(Number(slide.stepIndex))) : 0;
  const lineAtStep = Array.isArray(slide.lines) ? normalizeWhitespace(slide.lines[stepIndex] || "") : "";
  if (lineAtStep) return lineAtStep;
  return normalizeWhitespace(slide.text || "");
}

function resolvePlannerLines(slide: SlideInput): string[] {
  if (hasPreparedFrameMetadata(slide)) {
    const frameText = resolvePreparedFrameText(slide);
    return frameText ? [frameText] : [];
  }
  return (slide.lines || []).map((line) => normalizeWhitespace(line)).filter(Boolean).slice(0, 6);
}

function resolveSlideGroupId(slide: SlideInput, slideIndex: number): number {
  const groupIdRaw = Number(slide.groupId);
  return Number.isFinite(groupIdRaw) ? Math.max(0, Math.floor(groupIdRaw)) : slideIndex;
}

function resolveSlideStepIndex(slide: SlideInput): number {
  const stepIndexRaw = Number(slide.stepIndex);
  return Number.isFinite(stepIndexRaw) ? Math.max(0, Math.floor(stepIndexRaw)) : 0;
}

function resolvePayloadMode(payload: StudioPrepareRequest): DialogueMode {
  const mode = payload && typeof payload === "object" ? (payload as Record<string, unknown>).mode : undefined;
  return mode === "dialogue" ? "dialogue" : "normal";
}

function parseDialogueSegments(value: unknown): DialogueSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: DialogueSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const typeRaw = normalizeWhitespace(typeof row.type === "string" ? row.type : "").toLowerCase();
    const text = normalizeWhitespace(typeof row.text === "string" ? row.text : "");
    if (!text) continue;
    segments.push({
      type: typeRaw === "quote" ? "quote" : "narration",
      text,
      speakerId: normalizeWhitespace(typeof row.speakerId === "string" ? row.speakerId : "") || undefined,
    });
  }
  return segments;
}

function toSlidePromptText(slide: SlideInput): string {
  const row = slide as SlideInput & { dialogueSegments?: unknown };
  const dialogueSegments = parseDialogueSegments(row.dialogueSegments);
  if (dialogueSegments.length > 0) {
    return normalizeWhitespace(
      dialogueSegments
        .map((segment) => {
          if (segment.type !== "quote") return segment.text;
          const speakerLabel = segment.speakerId ? `[${segment.speakerId}] ` : "";
          return `${speakerLabel}"${segment.text}"`;
        })
        .join(" ")
    );
  }
  const narrationText = normalizeWhitespace(slide.narrationText || "");
  if (narrationText) return narrationText;
  return normalizeWhitespace(slide.text || "");
}

function extractAssistantText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const textParts = value
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as Record<string, unknown>;
        return typeof row.text === "string" ? row.text : "";
      })
      .filter(Boolean);
    return textParts.join("\n").trim();
  }
  return "";
}

function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return stripped;
  }
  return stripped.slice(first, last + 1);
}

function parsePlannedResponse(raw: string): PlannedSfxResponse {
  const jsonText = extractJsonObjectText(raw);
  const parsed = JSON.parse(jsonText) as { items?: unknown };
  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
  const items = itemsRaw
    .map((item): PlannedSfxItem | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slideIndexRaw = Number(row.slideIndex);
      if (!Number.isFinite(slideIndexRaw)) return null;
      const sfxPlanRaw = Array.isArray(row.sfxPlan) ? row.sfxPlan : [];
      const sfxPlan: PlannedSfxPlanItem[] = [];
      for (const planItem of sfxPlanRaw) {
        if (!planItem || typeof planItem !== "object") continue;
        const planRow = planItem as Record<string, unknown>;
        const lineIndexRaw = Number(planRow.lineIndex);
        const tag = typeof planRow.tag === "string" ? normalizeWhitespace(planRow.tag) : "";
        if (!Number.isFinite(lineIndexRaw)) continue;
        const gainDbRaw = Number(planRow.gainDb);
        const offsetMsRaw = Number(planRow.offsetMs);
        const next: PlannedSfxPlanItem = {
          lineIndex: Math.max(0, Math.floor(lineIndexRaw)),
        };
        if (tag) next.tag = tag;
        if (Number.isFinite(gainDbRaw)) next.gainDb = gainDbRaw;
        if (Number.isFinite(offsetMsRaw)) next.offsetMs = offsetMsRaw;
        sfxPlan.push(next);
      }
      return {
        slideIndex: Math.max(0, Math.floor(slideIndexRaw)),
        sfxPlan,
      };
    })
    .filter((item): item is PlannedSfxItem => item !== null);
  return { items };
}

function toPrompt(
  slides: PlannerSlide[],
  allowedTags: string[],
  options?: PlannerPromptOptions
): string {
  const slideRows = slides
    .map(
      (slide) =>
        `${slide.slideIndex}. groupId=${slide.groupId} stepIndex=${slide.stepIndex} text=${slide.text}\nlines=${JSON.stringify(slide.lines)}`
    )
    .join("\n\n");
  const category = normalizeWhitespace(options?.category || "");
  const hint = normalizeWhitespace(options?.hint || "");
  const mode: DialogueMode = options?.mode === "dialogue" ? "dialogue" : "normal";
  const categoryLine = category ? `카테고리: ${category}` : "";
  const hintLine = hint ? `추가 가이드: ${hint}` : "";
  const allowedTagLine = `허용 태그: ${JSON.stringify(allowedTags)}`;
  const modeLine =
    mode === "dialogue"
      ? "모드: dialogue (따옴표 내부 대사는 발화 인용 구간으로 보고, 과한 남발 없이 한 번의 리액션 포인트만 잡는다.)"
      : "모드: normal";
  return [
    "너는 숏폼 영상 효과음(SFX) 배정 플래너다.",
    "입력 순서가 최종 타임라인 순서이며, 같은 groupId는 하나의 묶음이다.",
    "각 슬라이드마다 효과음을 넣지 않을지, 넣는다면 어느 line에 어떤 tag/gainDb/offsetMs로 넣을지 직접 결정한다.",
    "반드시 JSON 객체 하나만 반환한다. 설명문 금지.",
    "반환 스키마:",
    '{"items":[{"slideIndex":0,"sfxPlan":[]},{"slideIndex":1,"sfxPlan":[{"lineIndex":0,"tag":"일반 효과음","gainDb":0,"offsetMs":-40}]}]}',
    "규칙:",
    "- 모든 입력 slideIndex를 정확히 한 번씩 반환한다.",
    "- 같은 groupId에 들어가는 효과음은 반드시 최소 1개, 최대 2개다.",
    "- 최종 타임라인에서 인접하게 배치되는 효과음끼리는 같은 tag를 연속 반복하지 않는다.",
    "- 정보 전달만 하는 설명, 잔잔한 연결, CTA, 인사말, 의미가 약한 연결 문장은 가능하면 sfxPlan을 []로 두되, 해당 groupId가 전부 비게 되면 가장 강한 한 순간에만 1개 넣는다.",
    "- 효과음은 당황, 반전, 실수, 충격, 웃음 포인트, 강한 강조처럼 실제로 도움이 되는 순간에만 넣는다.",
    "- 여러 line이 있어도 정말 필요한 순간만 고르고, 한 묶음(groupId) 안에서 1~2개만 고른다.",
    "- tag는 허용 태그 목록에서 정확히 하나를 복사한다.",
    "- lineIndex는 0-based 인덱스이며 반드시 해당 슬라이드 lines 범위 안이어야 한다.",
    "- gainDb는 -12~6 범위, offsetMs는 -400~250 범위만 사용한다.",
    "- 애매하면 넣지 말고 []를 반환한다.",
    modeLine,
    allowedTagLine,
    categoryLine,
    hintLine,
    "",
    "[입력 슬라이드]",
    slideRows,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizePlannedSfxPlan(slide: SlideInput, plan: PlannedSfxPlanItem[], allowedTags: Set<string>): SlideSfxPlanItem[] {
  const lineCount = Math.max(
    1,
    Array.isArray(slide.lines) ? slide.lines.filter((line) => normalizeWhitespace(line).length > 0).length : 0
  );
  const dedupLineIndexes = new Set<number>();
  const normalized: SlideSfxPlanItem[] = [];
  for (const item of plan) {
    const tag = normalizeWhitespace(item.tag || "");
    if (!tag || !allowedTags.has(tag)) continue;
    const lineIndex = Math.max(0, Math.min(lineCount - 1, Math.floor(item.lineIndex)));
    if (dedupLineIndexes.has(lineIndex)) continue;
    dedupLineIndexes.add(lineIndex);
    const gainDb = Number.isFinite(item.gainDb) ? Math.max(-24, Math.min(12, Number(item.gainDb))) : undefined;
    const offsetMs = Number.isFinite(item.offsetMs) ? Math.max(-1200, Math.min(1200, Math.floor(Number(item.offsetMs)))) : undefined;
    normalized.push({
      lineIndex,
      tag,
      gainDb,
      offsetMs,
    });
  }
  return normalized.sort((left, right) => left.lineIndex - right.lineIndex).slice(0, 2);
}

function resolveTimelineCuesFromSlide(
  slide: SlideInput,
  slideIndex: number,
  allowedTags: Set<string>
): TimelineSfxCue[] {
  const groupId = resolveSlideGroupId(slide, slideIndex);
  const cueTag = normalizeWhitespace(slide.sfxCue?.tag || "");
  const hasExplicitCue = Boolean(slide.sfxCue && cueTag);
  const hasEnabledAllowedExplicitCue = Boolean(
    hasExplicitCue && slide.sfxCue?.enabled !== false && allowedTags.has(cueTag)
  );
  const planItems = (Array.isArray(slide.sfxPlan) ? slide.sfxPlan : [])
    .map((item) => {
      const tag = normalizeWhitespace(item?.tag || "");
      const lineIndex = Number(item?.lineIndex);
      if (!tag || item?.enabled === false || !allowedTags.has(tag) || !Number.isFinite(lineIndex)) return null;
      return {
        groupId,
        lineIndex: Math.max(0, Math.floor(lineIndex)),
        tag,
      } satisfies TimelineSfxCue;
    })
    .filter((item): item is TimelineSfxCue => Boolean(item))
    .sort((left, right) => left.lineIndex - right.lineIndex)
    .filter((item, index, items) => index === 0 || items[index - 1]?.lineIndex !== item.lineIndex);

  if (hasPreparedFrameMetadata(slide)) {
    if (hasExplicitCue) {
      return hasEnabledAllowedExplicitCue
        ? [
            {
              groupId,
              lineIndex: resolveSlideStepIndex(slide),
              tag: cueTag,
            },
          ]
        : [];
    }
    const matchedPlanCue = planItems.find((item) => item.lineIndex === resolveSlideStepIndex(slide));
    return matchedPlanCue ? [matchedPlanCue] : [];
  }

  const cues = hasExplicitCue ? planItems.filter((item) => item.lineIndex !== 0) : [...planItems];
  if (hasEnabledAllowedExplicitCue) {
    cues.push({
      groupId,
      lineIndex: 0,
      tag: cueTag,
    });
  }
  return cues.sort((left, right) => left.lineIndex - right.lineIndex);
}

function pickAlternativeTag(allowedTags: string[], excludedTags: Set<string>): string | undefined {
  return allowedTags.find((tag) => !excludedTags.has(tag));
}

function resolveFallbackPlanLineIndex(slide: SlideInput): number {
  return hasPreparedFrameMetadata(slide) ? resolveSlideStepIndex(slide) : 0;
}

function buildFallbackPlanItem(
  slide: SlideInput,
  seedItem: SlideSfxPlanItem | undefined,
  allowedTags: string[],
  lastResolvedTag: string
): SlideSfxPlanItem | null {
  const fallbackTag = pickAlternativeTag(allowedTags, lastResolvedTag ? new Set([lastResolvedTag]) : new Set()) || allowedTags[0];
  if (!fallbackTag) return null;
  return {
    lineIndex:
      seedItem && Number.isFinite(seedItem.lineIndex)
        ? Math.max(0, Math.floor(seedItem.lineIndex))
        : resolveFallbackPlanLineIndex(slide),
    tag: fallbackTag,
    gainDb: seedItem?.gainDb,
    offsetMs: seedItem?.offsetMs,
  };
}

function enforceGroupedSfxConstraints(
  slides: SlideInput[],
  normalizedPlans: Map<number, SlideSfxPlanItem[]>,
  allowedTags: string[]
): Map<number, SlideSfxPlanItem[]> {
  const allowedTagSet = new Set(allowedTags);
  const constrainedPlans = new Map<number, SlideSfxPlanItem[]>();
  const groupedSlides = new Map<number, number[]>();
  for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
    const groupId = resolveSlideGroupId(slides[slideIndex], slideIndex);
    const groupSlideIndexes = groupedSlides.get(groupId);
    if (groupSlideIndexes) groupSlideIndexes.push(slideIndex);
    else groupedSlides.set(groupId, [slideIndex]);
  }
  let lastResolvedTag = "";

  for (const [, slideIndexes] of groupedSlides) {
    let groupCueCount = 0;
    let groupHasResolvedCue = false;
    const plannedSlideIndexes: number[] = [];

    for (const slideIndex of slideIndexes) {
      const slide = slides[slideIndex];
      const plannedItems = normalizedPlans.get(slideIndex);
      if (plannedItems) {
        plannedSlideIndexes.push(slideIndex);
        continue;
      }
      for (const cue of resolveTimelineCuesFromSlide(slide, slideIndex, allowedTagSet)) {
        groupCueCount += 1;
        groupHasResolvedCue = true;
        lastResolvedTag = cue.tag;
      }
    }

    for (const slideIndex of plannedSlideIndexes) {
      const plannedItems = normalizedPlans.get(slideIndex) || [];
      const accepted: SlideSfxPlanItem[] = [];
      for (const item of plannedItems) {
        if (groupCueCount >= 2) break;

        let tag = normalizeWhitespace(item.tag || "");
        if (!tag || !allowedTagSet.has(tag)) continue;

        if (tag === lastResolvedTag) {
          const replacementTag = pickAlternativeTag(allowedTags, new Set([lastResolvedTag]));
          if (!replacementTag) continue;
          tag = replacementTag;
        }

        accepted.push({
          ...item,
          tag,
        });
        groupCueCount += 1;
        groupHasResolvedCue = true;
        lastResolvedTag = tag;
      }
      constrainedPlans.set(slideIndex, accepted);
    }

    if (!groupHasResolvedCue && plannedSlideIndexes.length > 0) {
      const fallbackSlideIndex =
        plannedSlideIndexes.find((slideIndex) => (normalizedPlans.get(slideIndex) || []).length > 0) ?? plannedSlideIndexes[0];
      const fallbackSlide = slides[fallbackSlideIndex];
      const fallbackSeed = (normalizedPlans.get(fallbackSlideIndex) || [])[0];
      const fallbackItem = buildFallbackPlanItem(fallbackSlide, fallbackSeed, allowedTags, lastResolvedTag);
      if (fallbackItem) {
        constrainedPlans.set(fallbackSlideIndex, [fallbackItem]);
        lastResolvedTag = fallbackItem.tag;
      }
    }
  }

  return constrainedPlans;
}

function resolveSfxPlannerCliModel(): string {
  return (process.env.STUDIO_SFX_PLANNER_CODEX_MODEL || "").trim() || resolveDefaultLocalCodexCliModel();
}

async function planByCodexApi(
  slides: PlannerSlide[],
  allowedTags: string[],
  codexAccessToken: string,
  options?: PlannerPromptOptions
): Promise<PlannedSfxResponse> {
  const prompt = toPrompt(slides, allowedTags, options);
  const useDeepseek = isDeepseekConfigured();
  const endpoint = useDeepseek
    ? `${DEEPSEEK_API_BASE_URL}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${codexAccessToken}`,
    },
    body: JSON.stringify({
      model: getCodexModel(),
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${useDeepseek ? "DeepSeek" : "OpenAI"} API SFX planner failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new Error("Codex API SFX planner returned empty choices");
  }
  const message = (first as Record<string, unknown>).message;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : "";
  const text = extractAssistantText(content);
  if (!text) {
    throw new Error("Codex API SFX planner returned empty content");
  }
  return parsePlannedResponse(text);
}

async function planByCodexCli(
  slides: PlannerSlide[],
  allowedTags: string[],
  options?: PlannerPromptOptions
): Promise<PlannedSfxResponse> {
  const prompt = toPrompt(slides, allowedTags, options);
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-sfx-plan",
    timeoutMs: 1000 * 60 * 3,
    maxBufferBytes: 1024 * 1024 * 8,
    model: options?.codexModel,
    configOverrides: SFX_PLANNER_FAST_CONFIG_OVERRIDES,
  });
  if (!text) {
    throw new Error("Codex CLI SFX planner returned empty content");
  }
  return parsePlannedResponse(text);
}

export async function planMissingSlideSfx(
  payload: StudioPrepareRequest,
  options?: {
    codexAccessToken?: string;
    transportOverrides?: SfxPlannerTransportOverrides;
    bestEffort?: boolean;
    targetSlideIndexes?: number[];
  }
): Promise<PlanResult> {
  const warnings: string[] = [];
  const mode = resolvePayloadMode(payload);
  const allowedTags = Array.from(new Set((payload.sfxCategories || []).map((tag) => normalizeWhitespace(tag)).filter(Boolean))).slice(0, 24);
  if (allowedTags.length <= 0) {
    warnings.push("[sfx-planner] sfxCategories가 비어 있어 자동 배정을 건너뜁니다.");
    return { payload, warnings };
  }

  const hasExistingSfxAssignment = (slide: SlideInput): boolean => {
    const cueTag = normalizeWhitespace(slide.sfxCue?.tag || "");
    const hasCueDecision = Boolean(
      slide.sfxCue && cueTag && (slide.sfxCue.enabled !== false || slide.sfxCue.source === "manual")
    );
    const hasPlan = Array.isArray(slide.sfxPlan) && slide.sfxPlan.length > 0;
    return hasCueDecision || hasPlan;
  };

  const targetSlideIndexSet = Array.isArray(options?.targetSlideIndexes)
    ? new Set(
        options.targetSlideIndexes.filter(
          (slideIndex) => Number.isInteger(slideIndex) && slideIndex >= 0 && slideIndex < payload.slides.length
        )
      )
    : null;
  const missingSlides = payload.slides
    .map((slide, slideIndex) => ({ slide, slideIndex }))
    .filter(
      ({ slide, slideIndex }) =>
        (!targetSlideIndexSet || targetSlideIndexSet.has(slideIndex)) && !hasExistingSfxAssignment(slide)
    );

  if (missingSlides.length <= 0) {
    return { payload, warnings };
  }

  const codexAccessToken = (options?.codexAccessToken || "").trim();
  const transportOverrides = options?.transportOverrides;
  const useLocalCli = transportOverrides?.canUseLocalCliBridge
    ? transportOverrides.canUseLocalCliBridge(codexAccessToken)
    : canUseLocalCodexCliBridge(codexAccessToken);
  const allowCliApiFallback = transportOverrides?.allowFallbackToApiWhenCliFails
    ? transportOverrides.allowFallbackToApiWhenCliFails()
    : allowFallbackToApiWhenCliFails();
  const requestSlides = missingSlides.map(({ slide, slideIndex }) => ({
    slideIndex,
    groupId: resolveSlideGroupId(slide, slideIndex),
    stepIndex: resolveSlideStepIndex(slide),
    text: hasPreparedFrameMetadata(slide) ? resolvePreparedFrameText(slide) || toSlidePromptText(slide) : toSlidePromptText(slide),
    lines: resolvePlannerLines(slide),
  }));
  const plannedMap = new Map<number, PlannedSfxItem>();
  const handlePlannerFailure = (message: string): void => {
    if (!options?.bestEffort) {
      throw new Error(message);
    }
    warnings.push(`[sfx-planner] ${message}`);
  };
  const applyPlannedItems = (planned: PlannedSfxResponse) => {
    for (const item of planned.items) {
      if (!requestSlides.some((slide) => slide.slideIndex === item.slideIndex)) continue;
      plannedMap.set(item.slideIndex, item);
    }
  };
  const assertCompleteCoverage = () => {
    const missingDecisionSlides = requestSlides
      .map((slide) => slide.slideIndex)
      .filter((slideIndex) => !plannedMap.has(slideIndex));
    if (missingDecisionSlides.length <= 0) return;
    throw new Error(`Codex SFX planner did not return decisions for slides ${missingDecisionSlides.join(", ")}.`);
  };
  if (!codexAccessToken && !useLocalCli) {
    handlePlannerFailure("Codex 연결이 없어 자동 SFX 배정을 시작할 수 없습니다. 로컬 Codex CLI 또는 OAuth 연결을 확인해 주세요.");
  }
  const planWithCli = transportOverrides?.planByCodexCli || planByCodexCli;
  const planWithApi = transportOverrides?.planByCodexApi || planByCodexApi;
  const plannerOptions = {
    hint: payload.imagePlannerHint,
    category: payload.publishCategory,
    mode,
    codexModel: resolveSfxPlannerCliModel(),
  } satisfies PlannerPromptOptions;
  const summarizePlannerError = (error: unknown): string => {
    const raw = String(error instanceof Error ? error.message : error)
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
    for (let index = raw.length - 1; index >= 0; index -= 1) {
      const candidate = raw[index] || "";
      if (/failed to connect|http error|timed out|timeout|returned empty|enoent|spawn|failed \(/i.test(candidate)) {
        return candidate;
      }
    }
    return raw[raw.length - 1] || "unknown";
  };
  const toCliFailureMessage = (error: unknown): string =>
    isCodexCliNotFoundError(error)
      ? "로컬 Codex CLI를 찾지 못했습니다. Codex CLI 설치와 실행 경로를 확인해 주세요."
      : `로컬 Codex CLI SFX planner 실행 실패: ${summarizePlannerError(error)}`;
  const toApiFailureMessage = (error: unknown): string =>
    `Codex API SFX planner 실행 실패: ${summarizePlannerError(error)}`;

  if (useLocalCli) {
    try {
      const planned = await runCodexPlannerWithRetry(() =>
        planWithCli(requestSlides, allowedTags, {
          ...plannerOptions,
        })
      );
      applyPlannedItems(planned);
      assertCompleteCoverage();
    } catch (cliError) {
      const cliFailureMessage = toCliFailureMessage(cliError);
      if (codexAccessToken && allowCliApiFallback) {
        try {
          const planned = await runCodexPlannerWithRetry(() =>
            planWithApi(requestSlides, allowedTags, codexAccessToken, plannerOptions)
          );
          applyPlannedItems(planned);
          assertCompleteCoverage();
        } catch (apiError) {
          handlePlannerFailure(`${cliFailureMessage} | ${toApiFailureMessage(apiError)}`);
        }
      } else {
        handlePlannerFailure(cliFailureMessage);
      }
    }
  } else if (codexAccessToken) {
    try {
      const planned = await runCodexPlannerWithRetry(() =>
        planWithApi(requestSlides, allowedTags, codexAccessToken, plannerOptions)
      );
      applyPlannedItems(planned);
      assertCompleteCoverage();
    } catch (apiError) {
      handlePlannerFailure(toApiFailureMessage(apiError));
    }
  }

  const allowedTagSet = new Set(allowedTags);
  const normalizedPlannedMap = new Map<number, SlideSfxPlanItem[]>();
  for (const { slide, slideIndex } of missingSlides) {
    const planned = plannedMap.get(slideIndex);
    if (!planned) continue;
    normalizedPlannedMap.set(
      slideIndex,
      sanitizePlannedSfxPlan(
        hasPreparedFrameMetadata(slide)
          ? {
              ...slide,
              lines: resolvePlannerLines(slide),
            }
          : slide,
        Array.isArray(planned.sfxPlan) ? planned.sfxPlan : [],
        allowedTagSet
      )
    );
  }
  const constrainedPlannedMap = enforceGroupedSfxConstraints(payload.slides, normalizedPlannedMap, allowedTags);
  const slides = payload.slides.map((slide, slideIndex) => {
    if (hasExistingSfxAssignment(slide)) return slide;
    const normalized = constrainedPlannedMap.get(slideIndex) || [];
    if (normalized.length <= 0) return slide;
    if (hasPreparedFrameMetadata(slide)) {
      const primaryCue = normalized[0];
      return {
        ...slide,
        sfxPlan: undefined,
        sfxCue: {
          enabled: true,
          tag: primaryCue.tag,
          gainDb: primaryCue.gainDb,
          offsetMs: primaryCue.offsetMs,
          source: "auto" as const,
        },
      };
    }
    return {
      ...slide,
      sfxPlan: normalized,
    };
  });

  return {
    payload: {
      ...payload,
      slides,
    },
    warnings,
  };
}

export const __internal = {
  resolveTimelineCuesFromSlide,
};
