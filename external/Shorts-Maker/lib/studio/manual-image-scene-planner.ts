import {
  classifyLocalCodexCliError,
  resolveDefaultLocalCodexCliModel,
  runLocalCodexCliPrompt,
} from "@/lib/auth/codex-local-cli";
import type { PublishCategory } from "@/lib/publish/types";
import { runCodexPlannerWithRetry } from "@/lib/studio/codex-planner-retry";
import {
  canUseLocalCodexCliBridge,
  getCodexModel,
  requestCodexChatCompletion,
} from "@/lib/studio/codex-script-transport";
import {
  buildStudioManualImagePrompt,
  buildStudioManualMascotBasePrompt,
  resolveManualImagePromptCharacterIds,
  toPromptSafeAnchorUrl,
  type StudioManualImageCharacterProfile,
  type StudioManualImageMascotMetadata,
} from "@/lib/studio/manual-image-prompt";
import type { PreparedSlide, SlideManualImagePrompt } from "@/types/studio-json";

const DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE = 4;
const DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_TIMEOUT_MS = 1000 * 60 * 3;
const DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_PARTIAL_RETRY_ATTEMPTS = 2;
const MANUAL_IMAGE_SCENE_PLANNER_RETRY_OPTIONS = { maxAttempts: 2, initialDelayMs: 900 } as const;
const MANUAL_IMAGE_SCENE_PLANNER_FAST_CONFIG_OVERRIDES = ['service_tier="fast"'];

type ManualImageScenePlanItem = {
  slideIndex: number;
  characterIds?: string[];
  scenePrompt: string;
  emotion?: string;
  action?: string;
  background?: string;
  props?: string;
  composition?: string;
};

type PlannedManualImageSceneResponse = {
  items: ManualImageScenePlanItem[];
};

type PlannerSlideRow = {
  slideIndex: number;
  title: string;
  text: string;
  lines: string[];
  characterIds: string[];
  imageSceneHint?: string;
  imageQueryHint?: string;
};

type SceneCharacterHeuristicOptions = {
  availableCharacterIds: string[];
  narratorCharacterId?: string;
};

export type PlannedSlideManualImagePrompt = SlideManualImagePrompt & {
  slideIndex: number;
};

export type ManualImageScenePlannerResult = {
  items: PlannedSlideManualImagePrompt[];
  warnings: string[];
};

type ManualImageScenePlannerFailureCode =
  | "cli_unavailable"
  | "timeout"
  | "execution_failed"
  | "parse_failed"
  | "incomplete";

type ManualImageScenePlannerFailureSummary = {
  code: ManualImageScenePlannerFailureCode;
  warning: string;
  logDetail?: string;
};

type ManualImageScenePlannerPromptOptions = {
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  characterProfiles?: StudioManualImageCharacterProfile[] | null;
  imageStylePrompt?: string;
  preferStyleOnlyBasePrompt?: boolean;
  codexModel?: string;
};

type ManualImageScenePlannerTransportOverrides = {
  canUseLocalCliBridge?: (codexAccessToken?: string) => boolean;
  planByCodexCli?: (
    slides: PlannerSlideRow[],
    options: ManualImageScenePlannerPromptOptions
  ) => Promise<PlannedManualImageSceneResponse>;
  planByCodexApi?: (
    slides: PlannerSlideRow[],
    codexAccessToken: string,
    options: ManualImageScenePlannerPromptOptions
  ) => Promise<PlannedManualImageSceneResponse>;
};

const MANUAL_IMAGE_SCENE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideIndex", "characterIds", "scenePrompt", "emotion", "action", "background", "props", "composition"],
        properties: {
          slideIndex: { type: "integer", minimum: 0 },
          characterIds: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          scenePrompt: { type: "string", minLength: 1 },
          emotion: { type: ["string", "null"] },
          action: { type: ["string", "null"] },
          background: { type: ["string", "null"] },
          props: { type: ["string", "null"] },
          composition: { type: ["string", "null"] },
        },
      },
    },
  },
};

function normalizeWhitespace(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildManualImageProjectSeed(publishCategory: PublishCategory, slides: PreparedSlide[]): string {
  const slideParts = slides.map((slide, slideIndex) =>
    [
      slideIndex,
      normalizeWhitespace(slide.title),
      normalizeWhitespace(slide.text),
      Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean).join(" | ") : "",
      resolveManualImagePromptCharacterIds(slide).join(","),
    ].join("::")
  );
  return [publishCategory, ...slideParts].join("||");
}

function collectProjectCharacterIds(
  slides: PreparedSlide[],
  characterProfiles?: StudioManualImageCharacterProfile[] | null
): string[] {
  const ids: string[] = [];
  for (const profile of Array.isArray(characterProfiles) ? characterProfiles : []) {
    const characterId = normalizeWhitespace(profile?.characterId);
    if (!characterId || ids.includes(characterId)) continue;
    ids.push(characterId);
  }
  for (const slide of slides) {
    for (const characterId of resolveManualImagePromptCharacterIds(slide)) {
      if (!characterId || ids.includes(characterId)) continue;
      ids.push(characterId);
    }
  }
  return ids;
}

function normalizeOptionalText(value: unknown, maxLength: number | null = 220): string | undefined {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return undefined;
  if (maxLength === null) return normalized;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function filterCharacterIdsByPrefix(characterIds: string[], prefix: "male_" | "female_" | "unknown_"): string[] {
  return characterIds.filter((characterId) => normalizeWhitespace(characterId).toLowerCase().startsWith(prefix));
}

function sortCanonicalCharacterIds(characterIds: string[]): string[] {
  return [...characterIds].sort((left, right) => {
    const leftMatch = normalizeWhitespace(left).match(/^(male|female|unknown)_(\d+)$/u);
    const rightMatch = normalizeWhitespace(right).match(/^(male|female|unknown)_(\d+)$/u);
    const rank = (value: RegExpMatchArray | null) => {
      if (!value) return 99;
      if (value[1] === "male") return 0;
      if (value[1] === "female") return 1;
      if (value[1] === "unknown") return 2;
      return 99;
    };
    const rankDiff = rank(leftMatch) - rank(rightMatch);
    if (rankDiff !== 0) return rankDiff;
    const leftNumber = Number(leftMatch?.[2] || 999);
    const rightNumber = Number(rightMatch?.[2] || 999);
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return left.localeCompare(right);
  });
}

function buildSlideNarrationCorpus(slide: PreparedSlide): string {
  return [
    slide.title,
    slide.text,
    Array.isArray(slide.lines) ? slide.lines.join(" ") : "",
    slide.imageRequest?.scene,
    slide.imageRequest?.query,
  ]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferNarratorCharacterId(slides: PreparedSlide[], availableCharacterIds: string[]): string | undefined {
  const maleIds = sortCanonicalCharacterIds(filterCharacterIdsByPrefix(availableCharacterIds, "male_"));
  const femaleIds = sortCanonicalCharacterIds(filterCharacterIdsByPrefix(availableCharacterIds, "female_"));
  const unknownIds = sortCanonicalCharacterIds(filterCharacterIdsByPrefix(availableCharacterIds, "unknown_"));
  if (maleIds.length === 1 && femaleIds.length === 0 && unknownIds.length === 0) return maleIds[0];
  if (femaleIds.length === 1 && maleIds.length === 0 && unknownIds.length === 0) return femaleIds[0];

  const projectCorpus = slides.map((slide) => buildSlideNarrationCorpus(slide)).join(" ");
  const femaleReferenceScore = ["여자", "그녀", "여학생", "그 여자", "여자애"].reduce(
    (total, token) => total + (projectCorpus.split(token).length - 1),
    0
  );
  const maleReferenceScore = ["남자", "그 남자", "남학생", "남자애"].reduce(
    (total, token) => total + (projectCorpus.split(token).length - 1),
    0
  );

  if (femaleReferenceScore > maleReferenceScore && maleIds.length > 0) return maleIds[0];
  if (maleReferenceScore > femaleReferenceScore && femaleIds.length > 0) return femaleIds[0];
  if (maleIds.length > 0) return maleIds[0];
  if (femaleIds.length > 0) return femaleIds[0];
  return unknownIds[0];
}

function inferSceneCharacterIdsFromSlide(
  slide: PreparedSlide,
  options: SceneCharacterHeuristicOptions
): string[] {
  const availableCharacterIds = sortCanonicalCharacterIds(
    Array.from(new Set(options.availableCharacterIds.map((characterId) => normalizeWhitespace(characterId)).filter(Boolean)))
  );
  if (availableCharacterIds.length <= 0) return [];
  const explicitCharacterIds = resolveManualImagePromptCharacterIds(slide);
  if (explicitCharacterIds.length > 0) return explicitCharacterIds;

  const corpus = buildSlideNarrationCorpus(slide);
  const maleIds = filterCharacterIdsByPrefix(availableCharacterIds, "male_");
  const femaleIds = filterCharacterIdsByPrefix(availableCharacterIds, "female_");
  const unknownIds = filterCharacterIdsByPrefix(availableCharacterIds, "unknown_");
  const hasFemaleCue = /(여자|그녀|여학생|그 여자|여자애)/u.test(corpus);
  const hasMaleCue = /(남자|그 남자|남학생|남자애)/u.test(corpus);
  const hasFirstPersonCue = /(내가|나는|난 |나도|나를|나한테|내 자리|내 책|내 옆|내가 늘|제가|저는)/u.test(corpus);
  const hasGenericPersonCue = /(학생|인물|주인공|사람|화자)/u.test(corpus);

  if (hasFemaleCue && hasMaleCue && maleIds[0] && femaleIds[0]) {
    return [maleIds[0], femaleIds[0]];
  }
  if (hasFemaleCue && femaleIds[0]) return [femaleIds[0]];
  if (hasMaleCue && maleIds[0]) return [maleIds[0]];
  if ((hasFirstPersonCue || hasGenericPersonCue) && options.narratorCharacterId) return [options.narratorCharacterId];
  if (availableCharacterIds.length === 1) return [availableCharacterIds[0]!];
  if (options.narratorCharacterId) return [options.narratorCharacterId];
  return unknownIds[0] ? [unknownIds[0]] : [];
}

function normalizePlannedCharacterIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeWhitespace(item)).filter(Boolean)));
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

function stripTrailingJsonCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonStringValue(raw: string, propertyName: string): string {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "s");
  const match = raw.match(pattern);
  if (!match?.[1]) return "";
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return "";
  }
}

function extractJsonIntegerValue(raw: string, propertyName: string): number | undefined {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*(-?\\d+)`, "s");
  const match = raw.match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractJsonStringArrayValue(raw: string, propertyName: string): string[] {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*(\\[(?:[^\\[\\]]|\\[[^\\[\\]]*\\])*\\])`, "s");
  const match = raw.match(pattern);
  if (!match?.[1]) return [];
  try {
    return normalizePlannedCharacterIds(JSON.parse(match[1]) as unknown[]);
  } catch {
    return [];
  }
}

function extractItemsArrayContent(raw: string): string {
  const itemsStart = raw.search(/"items"\s*:\s*\[/);
  if (itemsStart === -1) return "";
  const bracketStart = raw.indexOf("[", itemsStart);
  if (bracketStart === -1) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = bracketStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(bracketStart + 1, index);
      }
    }
  }
  return "";
}

function extractTopLevelObjectFragments(raw: string): string[] {
  const fragments: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (depth <= 0 && char !== "{") continue;
    current += char;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && current.trim()) {
        fragments.push(current.trim());
        current = "";
      }
    }
  }

  return fragments;
}

function normalizePlannedManualImageSceneResponse(itemsRaw: unknown): PlannedManualImageSceneResponse {
  const itemsSource = Array.isArray(itemsRaw) ? itemsRaw : [];
  const items = itemsSource
    .map((item): ManualImageScenePlanItem | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slideIndexRaw = Number(row.slideIndex);
      const scenePrompt = normalizeWhitespace(row.scenePrompt);
      if (!Number.isFinite(slideIndexRaw) || !scenePrompt) return null;
      return {
        slideIndex: Math.max(0, Math.floor(slideIndexRaw)),
        characterIds: normalizePlannedCharacterIds(row.characterIds),
        scenePrompt,
        emotion: normalizeOptionalText(row.emotion),
        action: normalizeOptionalText(row.action),
        background: normalizeOptionalText(row.background),
        props: normalizeOptionalText(row.props),
        composition: normalizeOptionalText(row.composition),
      };
    })
    .filter((item): item is ManualImageScenePlanItem => Boolean(item));
  return { items };
}

function parseLoosePlannedManualImageSceneItem(raw: string): ManualImageScenePlanItem | null {
  const strictParsed = (() => {
    try {
      return JSON.parse(stripTrailingJsonCommas(raw)) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (strictParsed) {
    return normalizePlannedManualImageSceneResponse([strictParsed]).items[0] || null;
  }
  const slideIndexRaw = extractJsonIntegerValue(raw, "slideIndex");
  const scenePrompt = extractJsonStringValue(raw, "scenePrompt");
  if (!Number.isFinite(slideIndexRaw) || !normalizeWhitespace(scenePrompt)) return null;
  return {
    slideIndex: Math.max(0, Math.floor(Number(slideIndexRaw))),
    characterIds: extractJsonStringArrayValue(raw, "characterIds"),
    scenePrompt: normalizeWhitespace(scenePrompt),
    emotion: normalizeOptionalText(extractJsonStringValue(raw, "emotion")),
    action: normalizeOptionalText(extractJsonStringValue(raw, "action")),
    background: normalizeOptionalText(extractJsonStringValue(raw, "background")),
    props: normalizeOptionalText(extractJsonStringValue(raw, "props")),
    composition: normalizeOptionalText(extractJsonStringValue(raw, "composition")),
  };
}

function parseLoosePlannedManualImageSceneResponse(raw: string): PlannedManualImageSceneResponse | null {
  const itemsContent = extractItemsArrayContent(raw);
  if (!itemsContent) return null;
  const items = extractTopLevelObjectFragments(itemsContent)
    .map((fragment) => parseLoosePlannedManualImageSceneItem(fragment))
    .filter((item): item is ManualImageScenePlanItem => Boolean(item));
  return items.length > 0 ? { items } : null;
}

function parsePlannedManualImageSceneResponse(raw: string): PlannedManualImageSceneResponse {
  const jsonText = extractJsonObjectText(raw);
  const strictCandidates = Array.from(new Set([jsonText, stripTrailingJsonCommas(jsonText)]));
  let lastError: unknown = null;

  for (const candidate of strictCandidates) {
    try {
      const parsed = JSON.parse(candidate) as { items?: unknown };
      return normalizePlannedManualImageSceneResponse(parsed.items);
    } catch (error) {
      lastError = error;
    }
  }

  const looseParsed = parseLoosePlannedManualImageSceneResponse(jsonText);
  if (looseParsed) return looseParsed;
  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Failed to parse manual image scene response."));
}

function chunkItems<T>(items: T[], batchSize: number): T[][] {
  if (items.length <= 0) return [];
  const resolvedBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += resolvedBatchSize) {
    batches.push(items.slice(index, index + resolvedBatchSize));
  }
  return batches;
}

function resolvePlannerBatchSize(explicitBatchSize?: number): number {
  if (Number.isFinite(explicitBatchSize)) {
    return Math.max(1, Math.min(12, Math.floor(Number(explicitBatchSize))));
  }
  const envValue = normalizeWhitespace(process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE);
  const envRaw = Number(envValue);
  if (envValue && Number.isFinite(envRaw)) {
    return Math.max(1, Math.min(12, Math.floor(envRaw)));
  }
  return DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE;
}

function resolvePlannerTimeoutMs(): number {
  const envValue = normalizeWhitespace(process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_TIMEOUT_MS);
  const envRaw = Number(envValue);
  if (envValue && Number.isFinite(envRaw)) {
    return Math.max(15_000, Math.min(10 * 60 * 1000, Math.floor(envRaw)));
  }
  return DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_TIMEOUT_MS;
}

function resolvePlannerPartialRetryAttempts(): number {
  const envValue = normalizeWhitespace(process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_PARTIAL_RETRY_ATTEMPTS);
  const envRaw = Number(envValue);
  if (envValue && Number.isFinite(envRaw)) {
    return Math.max(1, Math.min(6, Math.floor(envRaw)));
  }
  return DEFAULT_MANUAL_IMAGE_SCENE_PLANNER_PARTIAL_RETRY_ATTEMPTS;
}

function resolveManualImageScenePlannerCliModel(requestedModel?: string): string {
  return (
    normalizeWhitespace(requestedModel) ||
    normalizeWhitespace(process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_CODEX_MODEL) ||
    resolveDefaultLocalCodexCliModel()
  );
}

function buildManualImageScenePlannerFallbackWarning(code: ManualImageScenePlannerFailureCode): string {
  switch (code) {
    case "cli_unavailable":
      return "Codex local scene planner를 사용할 수 없어 규칙 기반 scene prompt로 대체했습니다.";
    case "timeout":
      return "Codex local scene planner 응답 시간 초과로 규칙 기반 scene prompt로 대체했습니다.";
    case "parse_failed":
      return "Codex local scene planner 결과 파싱 실패로 규칙 기반 scene prompt로 대체했습니다.";
    case "incomplete":
      return "Codex local scene planner 결과 일부가 누락되어 규칙 기반 scene prompt로 대체했습니다.";
    case "execution_failed":
    default:
      return "Codex local scene planner 실행 실패로 규칙 기반 scene prompt로 대체했습니다.";
  }
}

function summarizeManualImageScenePlannerFailure(
  input:
    | { code: Exclude<ManualImageScenePlannerFailureCode, "timeout" | "execution_failed" | "parse_failed">; logDetail?: string }
    | { error: unknown; logDetail?: string }
): ManualImageScenePlannerFailureSummary {
  if ("code" in input) {
    return {
      code: input.code,
      warning: buildManualImageScenePlannerFallbackWarning(input.code),
      logDetail: normalizeWhitespace(input.logDetail),
    };
  }

  const error = input.error;
  if (error instanceof SyntaxError) {
    return {
      code: "parse_failed",
      warning: buildManualImageScenePlannerFallbackWarning("parse_failed"),
      logDetail: normalizeWhitespace(error.message),
    };
  }

  const message = normalizeWhitespace(error instanceof Error ? error.message : String(error));
  if (/invalid_json_schema/i.test(message)) {
    return {
      code: "execution_failed",
      warning: buildManualImageScenePlannerFallbackWarning("execution_failed"),
      logDetail: message,
    };
  }
  if (/\bjson\b/i.test(message) || /parse/i.test(message) || /unexpected token/i.test(message)) {
    return {
      code: "parse_failed",
      warning: buildManualImageScenePlannerFallbackWarning("parse_failed"),
      logDetail: message,
    };
  }

  const code = classifyLocalCodexCliError(error) === "timeout" ? "timeout" : "execution_failed";
  return {
    code,
    warning: buildManualImageScenePlannerFallbackWarning(code),
    logDetail: message || normalizeWhitespace(input.logDetail),
  };
}

function formatManualImageSceneWarningSlides(slidesToPlan: PlannerSlideRow[]): string {
  return slidesToPlan.map((slide) => slide.slideIndex + 1).join(", ");
}

function appendUniqueWarning(warnings: string[], warning: string) {
  if (!warning || warnings.includes(warning)) return;
  warnings.push(warning);
}

function logManualImageScenePlannerDebug(message: string, detail?: string) {
  const normalizedDetail = normalizeWhitespace(detail);
  if (normalizedDetail) {
    console.warn(`[manual-image] ${message} | detail=${normalizedDetail}`);
    return;
  }
  console.warn(`[manual-image] ${message}`);
}

function toPrompt(slides: PlannerSlideRow[], options: ManualImageScenePlannerPromptOptions): string {
  const mascotName = normalizeWhitespace(options.metadata?.mascotName) || `${options.publishCategory} 채널 마스코트`;
  const mascotDescription =
    normalizeOptionalText(options.metadata?.mascotDescription, 220) ||
    `${options.publishCategory} 채널을 대표하는 친근한 싱글 마스코트 캐릭터`;
  const mascotStyle = normalizeOptionalText(options.metadata?.mascotStyle, 180) || "깔끔한 디지털 일러스트, 정돈된 라이팅";
  const mascotTone = normalizeOptionalText(options.metadata?.mascotTone, 160) || "밝은 라이트 톤, 블루/시안 포인트";
  const characterProfiles = Array.isArray(options.characterProfiles) ? options.characterProfiles : [];
  const characterProfileRows = characterProfiles
    .map((profile) => {
      const characterId = normalizeWhitespace(profile.characterId);
      if (!characterId) return "";
      return [
        `characterId=${JSON.stringify(characterId)}`,
        `displayName=${JSON.stringify(normalizeOptionalText(profile.displayName, 80) || characterId)}`,
        `identityPrompt=${JSON.stringify(normalizeOptionalText(profile.identityPrompt, null) || "")}`,
        `anchorImageUrl=${JSON.stringify(toPromptSafeAnchorUrl(profile.anchorImageUrl))}`,
        `anchorAssetId=${JSON.stringify(normalizeOptionalText(profile.anchorAssetId, 120) || "")}`,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  const mascotBasePrompt = normalizeOptionalText(
    buildStudioManualMascotBasePrompt({
      publishCategory: options.publishCategory,
      metadata: options.metadata,
      imageStylePrompt: options.imageStylePrompt,
    }),
    1400
  );
  const slideRows = slides
    .map(
      (slide) =>
        `slideIndex=${slide.slideIndex}\n` +
        `title=${JSON.stringify(slide.title)}\n` +
        `text=${JSON.stringify(slide.text)}\n` +
        `lines=${JSON.stringify(slide.lines)}\n` +
        `characterIds=${JSON.stringify(slide.characterIds)}\n` +
        `imageSceneHint=${JSON.stringify(slide.imageSceneHint || "")}\n` +
        `imageQueryHint=${JSON.stringify(slide.imageQueryHint || "")}`
    )
    .join("\n\n");
  return [
    "너는 숏폼 슬라이드용 AI 이미지 scene prompt planner다.",
    "중요: base character/style prompt는 이미 별도로 deterministic하게 고정되어 있다. 너는 per-slide scene prompt 핵심만 만든다.",
    "반드시 JSON 객체 하나만 반환한다. 설명문, 마크다운, 코드블록 금지.",
    "반환 스키마:",
    '{"items":[{"slideIndex":0,"characterIds":["male_1"],"scenePrompt":"...", "emotion":"...", "action":"...", "background":"...", "props":"...", "composition":"..."}]}',
    "규칙:",
    "- 모든 입력 slideIndex를 정확히 한 번씩 반환한다.",
    "- 모든 items.characterIds는 빈 배열 또는 [작업 캐릭터]와 입력 슬라이드들에 이미 등장한 characterId만 사용한다. 새로운 characterId를 만들지 않는다.",
    "- scenePrompt는 1~3문장 정도의 간결한 장면 지시문으로 작성한다.",
    "- scenePrompt는 장면/행동/배경/구도에 집중하고, 전체 base prompt를 다시 길게 복붙하지 않는다.",
    "- final full prompt를 만들지 않는다. negative prompt, ChatGPT 사용법, 카메라 파라미터 나열 금지.",
    "- 텍스트 없는 이미지, square 1:1 구도를 전제로 생각한다.",
    "- slide.characterIds가 있으면 선택된 캐릭터를 누락하지 말고 모두 장면 주연으로 사용한다.",
    "- slide.characterIds가 비어 있으면 slide title/text/lines와 전체 슬라이드 흐름을 보고 이번 장면 주연 characterIds를 추론한다. 1인칭 화자/주인공은 프로젝트 전체에서 같은 characterId로 일관되게 유지한다.",
    "- scenePrompt는 반드시 items.characterIds와 일치하는 인물만 주연으로 묘사한다. characterIds가 빈 배열이면 특정 recurring character를 주연으로 확정하지 않는다.",
    "- items.characterIds가 비어 있지 않으면 scenePrompt 안에서 익명의 학생, 어떤 여자, 한 남자 같은 generic 표현을 쓰지 말고 선택된 characterId 또는 그 캐릭터 displayName이 드러나게 쓴다.",
    "- recurring character identity는 캐릭터별로 반드시 유지한다. hair/outfit/silhouette를 슬라이드마다 바꾸지 않는다.",
    "- 팔/손/다리는 정상적인 개수로만 보이게 한다. extra limbs, extra hands, duplicated body parts를 유발하는 설명 금지.",
    "- 한 장면에서 동시에 두 행동을 수행하게 쓰지 않는다. 투잡/병행 상황은 한 가지 핵심 동작 + 배경 소품/의상/주변 오브젝트로만 암시한다.",
    "- 복잡한 멀티태스킹 포즈 대신 읽기 쉬운 단일 포즈와 명확한 실루엣을 우선한다.",
    "- slide title/text/lines/imageSceneHint가 있으면 장면화에 반영한다.",
    "- CTA/구독 유도 슬라이드는 친근한 손짓/정리된 배경처럼 행동 유도 장면으로 만든다.",
    "",
    `[스타일 컨텍스트]`,
    `publishCategory=${options.publishCategory}`,
    `imageStylePrompt=${JSON.stringify(normalizeOptionalText(options.imageStylePrompt, 1400) || "")}`,
    `mascotName=${JSON.stringify(mascotName)}`,
    `mascotDescription=${JSON.stringify(mascotDescription)}`,
    `mascotStyle=${JSON.stringify(mascotStyle)}`,
    `mascotTone=${JSON.stringify(mascotTone)}`,
    `mascotBasePrompt=${JSON.stringify(mascotBasePrompt)}`,
    "",
    "[작업 캐릭터]",
    characterProfileRows || "없음",
    `projectCharacterIds=${JSON.stringify(
      Array.from(
        new Set([
          ...characterProfiles.map((profile) => normalizeWhitespace(profile.characterId)).filter(Boolean),
          ...slides.flatMap((slide) => slide.characterIds.map((characterId) => normalizeWhitespace(characterId)).filter(Boolean)),
        ])
      )
    )}`,
    "",
    "[입력 슬라이드]",
    slideRows,
  ]
    .filter(Boolean)
    .join("\n");
}

async function planByCodexCli(
  slides: PlannerSlideRow[],
  options: ManualImageScenePlannerPromptOptions
): Promise<PlannedManualImageSceneResponse> {
  const prompt = toPrompt(slides, options);
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-manual-image-scene-plan",
    timeoutMs: resolvePlannerTimeoutMs(),
    maxBufferBytes: 1024 * 1024 * 8,
    model: options.codexModel,
    configOverrides: MANUAL_IMAGE_SCENE_PLANNER_FAST_CONFIG_OVERRIDES,
    outputSchema: MANUAL_IMAGE_SCENE_RESPONSE_SCHEMA,
  });
  if (!text) {
    throw new Error("Codex CLI manual image scene planner returned empty content");
  }
  return parsePlannedManualImageSceneResponse(text);
}

/**
 * API transport (OpenAI or DeepSeek, via requestCodexChatCompletion) for
 * environments without the local Codex CLI bridge. Without this, DeepSeek
 * deployments always fell back to the rule-based scene prompts below, since
 * planByCodexCli had no API equivalent.
 */
async function planByCodexApi(
  slides: PlannerSlideRow[],
  codexAccessToken: string,
  options: ManualImageScenePlannerPromptOptions
): Promise<PlannedManualImageSceneResponse> {
  const prompt = toPrompt(slides, options);
  const completion = await requestCodexChatCompletion({
    accessToken: codexAccessToken,
    messages: [
      { role: "system", content: "Return JSON only, matching the requested schema exactly." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    model: options.codexModel || getCodexModel(),
  });
  if (!completion.text) {
    throw new Error("Codex API manual image scene planner returned empty content");
  }
  return parsePlannedManualImageSceneResponse(completion.text);
}

function normalizeBatchPlannedResponse(
  planned: PlannedManualImageSceneResponse,
  batchSlides: PlannerSlideRow[]
): {
  items: ManualImageScenePlanItem[];
  rawSlideIndexes: number[];
  remappedRawSlideIndexes: number[];
} {
  const expectedSet = new Set(batchSlides.map((slide) => slide.slideIndex));
  const normalizedItems: ManualImageScenePlanItem[] = [];
  const seenSlideIndexes = new Set<number>();
  const rawSlideIndexes = planned.items.map((item) => item.slideIndex);
  const remappedRawSlideIndexes: number[] = [];

  for (const item of planned.items) {
    const rawSlideIndex = item.slideIndex;
    let resolvedSlideIndex = rawSlideIndex;
    if (!expectedSet.has(rawSlideIndex) && rawSlideIndex >= 0 && rawSlideIndex < batchSlides.length) {
      const batchSlideIndex = batchSlides[rawSlideIndex]?.slideIndex;
      if (Number.isFinite(batchSlideIndex)) {
        resolvedSlideIndex = Number(batchSlideIndex);
        if (resolvedSlideIndex !== rawSlideIndex) remappedRawSlideIndexes.push(rawSlideIndex);
      }
    }
    if (!expectedSet.has(resolvedSlideIndex) || seenSlideIndexes.has(resolvedSlideIndex)) continue;
    normalizedItems.push(
      resolvedSlideIndex === rawSlideIndex
        ? item
        : {
            ...item,
            slideIndex: resolvedSlideIndex,
          }
    );
    seenSlideIndexes.add(resolvedSlideIndex);
  }

  return {
    items: normalizedItems,
    rawSlideIndexes,
    remappedRawSlideIndexes,
  };
}

function buildFallbackPromptForSlide(input: {
  slide: PreparedSlide;
  slideIndex: number;
  totalSlides: number;
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  characterProfiles?: StudioManualImageCharacterProfile[] | null;
  availableCharacterIds?: string[];
  imageStylePrompt?: string;
  preferStyleOnlyBasePrompt?: boolean;
  projectSeed?: string;
  narratorCharacterId?: string;
  warning: string;
  plannerModel?: string;
}): PlannedSlideManualImagePrompt {
  return {
    slideIndex: input.slideIndex,
    ...buildStudioManualImagePrompt({
      slide: input.slide,
      slideIndex: input.slideIndex,
      totalSlides: input.totalSlides,
      publishCategory: input.publishCategory,
      metadata: input.metadata,
      characterProfiles: input.characterProfiles,
      availableCharacterIds: input.availableCharacterIds,
      sceneCharacterIds: inferSceneCharacterIdsFromSlide(input.slide, {
        availableCharacterIds: input.availableCharacterIds || [],
        narratorCharacterId: input.narratorCharacterId,
      }),
      imageStylePrompt: input.imageStylePrompt,
      preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
      projectSeed: input.projectSeed,
      source: "fallback",
      warning: input.warning,
      plannerModel: input.plannerModel,
    }),
  };
}

function buildCodexPromptForSlide(input: {
  slide: PreparedSlide;
  slideIndex: number;
  totalSlides: number;
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  characterProfiles?: StudioManualImageCharacterProfile[] | null;
  availableCharacterIds?: string[];
  imageStylePrompt?: string;
  preferStyleOnlyBasePrompt?: boolean;
  projectSeed?: string;
  narratorCharacterId?: string;
  plannerModel?: string;
  planItem: ManualImageScenePlanItem;
}): PlannedSlideManualImagePrompt {
  const explicitSceneCharacterIds = resolveManualImagePromptCharacterIds(input.slide);
  const allowedCharacterIds = new Set(
    (input.availableCharacterIds && input.availableCharacterIds.length > 0
      ? input.availableCharacterIds
      : [
          ...explicitSceneCharacterIds,
          ...(Array.isArray(input.characterProfiles) ? input.characterProfiles.map((profile) => normalizeWhitespace(profile.characterId)) : []),
        ]
    ).map((characterId) => normalizeWhitespace(characterId)).filter(Boolean)
  );
  const plannedCharacterIds =
    explicitSceneCharacterIds.length > 0
      ? explicitSceneCharacterIds
      : normalizePlannedCharacterIds(input.planItem.characterIds).filter(
          (characterId) => allowedCharacterIds.size <= 0 || allowedCharacterIds.has(characterId)
        );
  const resolvedSceneCharacterIds =
    plannedCharacterIds.length > 0
      ? plannedCharacterIds
      : inferSceneCharacterIdsFromSlide(input.slide, {
          availableCharacterIds: input.availableCharacterIds || [],
          narratorCharacterId: input.narratorCharacterId,
        });
  return {
    slideIndex: input.slideIndex,
    ...buildStudioManualImagePrompt({
      slide: input.slide,
      slideIndex: input.slideIndex,
      totalSlides: input.totalSlides,
      publishCategory: input.publishCategory,
      metadata: input.metadata,
      characterProfiles: input.characterProfiles,
      availableCharacterIds: input.availableCharacterIds,
      imageStylePrompt: input.imageStylePrompt,
      preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
      projectSeed: input.projectSeed,
      source: "codex",
      sceneCharacterIds: resolvedSceneCharacterIds,
      scenePromptOverride: input.planItem.scenePrompt,
      emotion: input.planItem.emotion,
      action: input.planItem.action,
      background: input.planItem.background,
      props: input.planItem.props,
      composition: input.planItem.composition,
      plannerModel: input.plannerModel,
    }),
  };
}

export async function planManualImageScenePrompts(
  input: {
    publishCategory: PublishCategory;
    slides: PreparedSlide[];
    metadata?: StudioManualImageMascotMetadata | null;
    characterProfiles?: StudioManualImageCharacterProfile[] | null;
    imageStylePrompt?: string;
    preferStyleOnlyBasePrompt?: boolean;
    codexModel?: string;
  },
  options?: {
    codexAccessToken?: string;
    batchSize?: number;
    transportOverrides?: ManualImageScenePlannerTransportOverrides;
  }
): Promise<ManualImageScenePlannerResult> {
  const warnings: string[] = [];
  const totalSlides = Math.max(1, input.slides.length);
  const projectSeed = buildManualImageProjectSeed(input.publishCategory, input.slides);
  const availableCharacterIds = collectProjectCharacterIds(input.slides, input.characterProfiles);
  const narratorCharacterId = inferNarratorCharacterId(input.slides, availableCharacterIds);
  const codexAccessToken = (options?.codexAccessToken || "").trim();
  const useLocalCli = options?.transportOverrides?.canUseLocalCliBridge
    ? options.transportOverrides.canUseLocalCliBridge(codexAccessToken)
    : canUseLocalCodexCliBridge(codexAccessToken);
  const useApi = !useLocalCli && Boolean(codexAccessToken);
  const plannerAvailable = useLocalCli || useApi;
  const plannerModel = useLocalCli
    ? resolveManualImageScenePlannerCliModel(input.codexModel)
    : normalizeWhitespace(input.codexModel) || getCodexModel();
  const requestSlides: PlannerSlideRow[] = input.slides.map((slide, slideIndex) => ({
    slideIndex,
    title: normalizeWhitespace(slide.title),
    text: normalizeWhitespace(slide.text),
    lines: Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean).slice(0, 6) : [],
    characterIds: resolveManualImagePromptCharacterIds(slide),
    imageSceneHint: normalizeOptionalText(slide.imageRequest?.scene, 180),
    imageQueryHint: normalizeOptionalText(slide.imageRequest?.query, 120),
  }));
  const planMap = new Map<number, PlannedSlideManualImagePrompt>();
  const plannerFailureMessages: string[] = [];
  const plannerBatches = chunkItems(requestSlides, resolvePlannerBatchSize(options?.batchSize));
  const partialRetryAttempts = resolvePlannerPartialRetryAttempts();
  const plannerOptions: ManualImageScenePlannerPromptOptions = {
    publishCategory: input.publishCategory,
    metadata: input.metadata,
    characterProfiles: input.characterProfiles,
    imageStylePrompt: input.imageStylePrompt,
    preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
    codexModel: plannerModel,
  };
  const planWithCli = options?.transportOverrides?.planByCodexCli || planByCodexCli;
  const planWithApi = options?.transportOverrides?.planByCodexApi || planByCodexApi;
  const toBatchLabel = (batchIndex: number) =>
    plannerBatches.length > 1 ? ` batch ${batchIndex + 1}/${plannerBatches.length}` : "";
  const applyFallbackForSlides = (
    slidesToPlan: PlannerSlideRow[],
    failure: ManualImageScenePlannerFailureSummary,
    extraDetail?: string
  ) => {
    if (slidesToPlan.length <= 0) return;
    const warning = `${failure.warning} (슬라이드 ${formatManualImageSceneWarningSlides(slidesToPlan)})`;
    appendUniqueWarning(warnings, warning);
    plannerFailureMessages.push(failure.warning);
    logManualImageScenePlannerDebug(
      `${failure.code} fallback for slides ${slidesToPlan.map((slide) => slide.slideIndex).join(", ")}${extraDetail ? ` | ${extraDetail}` : ""}`,
      failure.logDetail
    );
    for (const row of slidesToPlan) {
      const slide = input.slides[row.slideIndex];
      if (!slide) continue;
      planMap.set(
        row.slideIndex,
        buildFallbackPromptForSlide({
          slide,
          slideIndex: row.slideIndex,
          totalSlides,
          publishCategory: input.publishCategory,
          metadata: input.metadata,
          characterProfiles: input.characterProfiles,
          availableCharacterIds,
          imageStylePrompt: input.imageStylePrompt,
          preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
          projectSeed,
          narratorCharacterId,
          warning: failure.warning,
          plannerModel,
        })
      );
    }
  };
  const applyCodexItems = (items: ManualImageScenePlanItem[]) => {
    for (const item of items) {
      const slide = input.slides[item.slideIndex];
      if (!slide) continue;
      planMap.set(
        item.slideIndex,
        buildCodexPromptForSlide({
          slide,
          slideIndex: item.slideIndex,
          totalSlides,
          publishCategory: input.publishCategory,
          metadata: input.metadata,
          characterProfiles: input.characterProfiles,
          availableCharacterIds,
          imageStylePrompt: input.imageStylePrompt,
          preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
          projectSeed,
          narratorCharacterId,
          plannerModel,
          planItem: item,
        })
      );
    }
  };

  if (!plannerAvailable) {
    applyFallbackForSlides(
      requestSlides,
      summarizeManualImageScenePlannerFailure({
        code: "cli_unavailable",
        logDetail: "neither the local Codex CLI bridge nor an API access token is available",
      })
    );
  } else {
    for (const [batchIndex, batch] of plannerBatches.entries()) {
      let pendingSlides = batch;
      for (let partialAttempt = 1; partialAttempt <= partialRetryAttempts; partialAttempt += 1) {
        try {
          const planned = await runCodexPlannerWithRetry(
            () =>
              useLocalCli
                ? planWithCli(pendingSlides, plannerOptions)
                : planWithApi(pendingSlides, codexAccessToken, plannerOptions),
            MANUAL_IMAGE_SCENE_PLANNER_RETRY_OPTIONS
          );
          const normalized = normalizeBatchPlannedResponse(planned, pendingSlides);
          if (normalized.remappedRawSlideIndexes.length > 0) {
            logManualImageScenePlannerDebug(
              `remapped local slideIndex${toBatchLabel(batchIndex)} raw [${normalized.rawSlideIndexes.join(", ")}] -> resolved [${normalized.items
                .map((item) => item.slideIndex)
                .join(", ")}]`
            );
          }
          applyCodexItems(normalized.items);
          const unresolvedPendingSlides = pendingSlides.filter(
            (slide) => !normalized.items.some((item) => item.slideIndex === slide.slideIndex)
          );
          if (unresolvedPendingSlides.length <= 0) break;
          const partialMessage =
            `Codex scene plan partial${toBatchLabel(batchIndex)} attempt ${partialAttempt}/${partialRetryAttempts}: expected [` +
            `${pendingSlides.map((slide) => slide.slideIndex).join(", ")}], received [` +
            `${normalized.items.map((item) => item.slideIndex).join(", ") || "none"}]` +
            `${normalized.rawSlideIndexes.length > 0 ? `, raw [${normalized.rawSlideIndexes.join(", ")}]` : ""}`;
          if (partialAttempt >= partialRetryAttempts) {
            applyFallbackForSlides(
              unresolvedPendingSlides,
              summarizeManualImageScenePlannerFailure({
                code: "incomplete",
                logDetail: `${partialMessage}; still missing [${unresolvedPendingSlides.map((slide) => slide.slideIndex).join(", ")}]`,
              }),
              `batch=${batchIndex + 1}/${plannerBatches.length}`
            );
            break;
          }
          logManualImageScenePlannerDebug(
            `${partialMessage}; retrying missing [${unresolvedPendingSlides.map((slide) => slide.slideIndex).join(", ")}]`
          );
          pendingSlides = unresolvedPendingSlides;
        } catch (error) {
          applyFallbackForSlides(
            pendingSlides,
            summarizeManualImageScenePlannerFailure({
              error,
            }),
            `batch=${batchIndex + 1}/${plannerBatches.length}`
          );
          break;
        }
      }
    }
  }

  const unresolvedSlideIndexes = requestSlides
    .map((slide) => slide.slideIndex)
    .filter((slideIndex) => !planMap.has(slideIndex));
  if (unresolvedSlideIndexes.length > 0) {
    applyFallbackForSlides(
      requestSlides.filter((slide) => unresolvedSlideIndexes.includes(slide.slideIndex)),
      summarizeManualImageScenePlannerFailure({
        code: "incomplete",
        logDetail: `no planMap entry for slide indexes [${unresolvedSlideIndexes.join(", ")}]`,
      })
    );
  }

  return {
    items: input.slides.map((_, slideIndex) => {
      const planned = planMap.get(slideIndex);
      if (planned) return planned;
      return buildFallbackPromptForSlide({
        slide: input.slides[slideIndex]!,
        slideIndex,
        totalSlides,
        publishCategory: input.publishCategory,
        metadata: input.metadata,
        characterProfiles: input.characterProfiles,
        availableCharacterIds,
        imageStylePrompt: input.imageStylePrompt,
        preferStyleOnlyBasePrompt: input.preferStyleOnlyBasePrompt,
        projectSeed,
        narratorCharacterId,
        warning: plannerFailureMessages.join(" | ") || "Codex local scene planner returned no result.",
        plannerModel,
      });
    }),
    warnings,
  };
}

export const __internal = {
  manualImageSceneResponseSchema: MANUAL_IMAGE_SCENE_RESPONSE_SCHEMA,
  parsePlannedManualImageSceneResponse,
  summarizeManualImageScenePlannerFailure,
  toPrompt,
};
