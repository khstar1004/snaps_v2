import { isCodexCliNotFoundError, resolveDefaultLocalCodexCliModel, runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { runCodexPlannerWithRetry } from "@/lib/studio/codex-planner-retry";
import {
  canUseLocalCodexCliBridge,
  getCodexModel,
  requestCodexChatCompletion,
} from "@/lib/studio/codex-script-transport";
import type { DialogueSegment, SpeakerVoiceMap } from "@/types/studio-json";

type PlannerDialogueSegment = {
  type: "narration" | "quote";
  text: string;
  speakerId?: string;
};

type PlannerSlide = {
  slideIndex: number;
  text: string;
  lines: string[];
  existingDialogueSegments?: PlannerDialogueSegment[];
};

type PlannedSlide = {
  slideIndex: number;
  dialogueSegments: PlannerDialogueSegment[];
};

type PlannedDialogueSpeakerResponse = {
  slides: PlannedSlide[];
};

type DialogueSpeakerRole = "male" | "female" | "unknown";

type DialogueSpeakerPlannerTransportOverrides = {
  canUseLocalCliBridge?: (codexAccessToken?: string) => boolean;
  planByCodexCli?: (slides: PlannerSlide[], options?: { codexModel?: string }) => Promise<PlannedDialogueSpeakerResponse>;
  planByCodexApi?: (
    slides: PlannerSlide[],
    codexAccessToken: string,
    options?: { codexModel?: string }
  ) => Promise<PlannedDialogueSpeakerResponse>;
};

export class DialogueSpeakerPlannerError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, options?: { code?: string; status?: number; retryable?: boolean }) {
    super(message);
    this.name = "DialogueSpeakerPlannerError";
    this.code = options?.code || "DIALOGUE_SPEAKER_PLAN_FAILED";
    this.status = options?.status || 500;
    this.retryable = typeof options?.retryable === "boolean" ? options.retryable : true;
  }
}

export function isDialogueSpeakerPlannerError(error: unknown): error is DialogueSpeakerPlannerError {
  return error instanceof DialogueSpeakerPlannerError;
}

const DIALOGUE_SPEAKER_PLAN_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slides"],
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slideIndex", "dialogueSegments"],
        properties: {
          slideIndex: { type: "integer", minimum: 0 },
          dialogueSegments: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "text"],
              properties: {
                type: { type: "string", enum: ["narration", "quote"] },
                text: { type: "string", minLength: 1 },
                speakerId: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Record<string, unknown>;

function normalizeWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeSpeakerId(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

function inferSpeakerRoleFromSpeakerId(value: string): DialogueSpeakerRole {
  const normalized = normalizeSpeakerId(value);
  if (!normalized) return "unknown";
  if (/^male_\d+$/u.test(normalized)) return "male";
  if (/^female_\d+$/u.test(normalized)) return "female";
  if (/^unknown_\d+$/u.test(normalized) || /^speaker_\d+$/u.test(normalized)) return "unknown";
  if (/(^|[_-])(male|man|boy|guy|dad|father|husband|son|bro|남|남자|남성|오빠|형|아빠|아들)([_-]|$)/u.test(normalized)) {
    return "male";
  }
  if (/(^|[_-])(female|woman|girl|mom|mother|wife|daughter|sis|여|여자|여성|언니|누나|엄마|아내|딸|그녀)([_-]|$)/u.test(normalized)) {
    return "female";
  }
  return "unknown";
}

function createSpeakerSlotAllocator(rawReservedSpeakerIds: string[] = []) {
  const labelToSlot = new Map<string, string>();
  const usedSlots = new Set<string>();
  for (const rawSpeakerId of rawReservedSpeakerIds) {
    const normalized = normalizeSpeakerId(rawSpeakerId);
    if (!/^(?:male|female|unknown)_\d+$/u.test(normalized)) continue;
    labelToSlot.set(normalized, normalized);
    usedSlots.add(normalized);
  }

  return {
    resolve(rawSpeakerId: string): string {
      const normalized = normalizeSpeakerId(rawSpeakerId);
      if (!normalized) {
        throw new DialogueSpeakerPlannerError("Codex 화자 지정 결과에 quote speakerId가 비어 있습니다.", {
          code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
          status: 502,
          retryable: true,
        });
      }
      const existing = labelToSlot.get(normalized);
      if (existing) return existing;
      if (/^(?:male|female|unknown)_\d+$/u.test(normalized)) {
        labelToSlot.set(normalized, normalized);
        usedSlots.add(normalized);
        return normalized;
      }
      const role = inferSpeakerRoleFromSpeakerId(normalized);
      let slotIndex = 1;
      while (usedSlots.has(`${role}_${slotIndex}`)) slotIndex += 1;
      const nextSpeakerId = `${role}_${slotIndex}`;
      labelToSlot.set(normalized, nextSpeakerId);
      usedSlots.add(nextSpeakerId);
      return nextSpeakerId;
    },
  };
}

function normalizeDialogueSegments(value: unknown): PlannerDialogueSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PlannerDialogueSegment | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = row.type === "quote" ? "quote" : "narration";
      const text = normalizeWhitespace(row.text);
      if (!text) return null;
      const speakerId = normalizeWhitespace(row.speakerId);
      if (type === "quote" && !speakerId) {
        throw new DialogueSpeakerPlannerError("Codex 화자 지정 결과에 quote speakerId가 비어 있습니다.", {
          code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
          status: 502,
          retryable: true,
        });
      }
      return {
        type,
        text,
        speakerId: speakerId || undefined,
      };
    })
    .filter((item): item is PlannerDialogueSegment => Boolean(item));
}

function buildSourceText(slide: Record<string, unknown>): string {
  const rawLines = Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean) : [];
  return normalizeWhitespace(slide.text) || rawLines.join("\n") || normalizeWhitespace(slide.narrationText) || normalizeWhitespace(slide.body);
}

function buildSourceLines(slide: Record<string, unknown>, text: string): string[] {
  const rawLines = Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean) : [];
  if (rawLines.length > 0) return rawLines;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractPlannerSlides(sourceJson: Record<string, unknown>): PlannerSlide[] {
  const slides = Array.isArray(sourceJson.slides) ? sourceJson.slides : [];
  return slides
    .map((item, slideIndex): PlannerSlide | null => {
      if (typeof item === "string") {
        const text = normalizeWhitespace(item);
        if (!text) return null;
        return {
          slideIndex,
          text,
          lines: [text],
        };
      }
      if (!item || typeof item !== "object") return null;
      const slide = item as Record<string, unknown>;
      const text = buildSourceText(slide);
      const lines = buildSourceLines(slide, text);
      if (!text && lines.length <= 0) return null;
      return {
        slideIndex,
        text: text || lines.join("\n"),
        lines,
        existingDialogueSegments: normalizeDialogueSegments(slide.dialogueSegments),
      };
    })
    .filter((item): item is PlannerSlide => Boolean(item));
}

function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return stripped;
  return stripped.slice(first, last + 1);
}

function parsePlannedDialogueSpeakerResponse(raw: string): PlannedDialogueSpeakerResponse {
  const jsonText = extractJsonObjectText(raw);
  const parsed = JSON.parse(jsonText) as { slides?: unknown };
  const slidesRaw = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides = slidesRaw
    .map((item): PlannedSlide | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slideIndex = Number(row.slideIndex);
      if (!Number.isFinite(slideIndex) || slideIndex < 0) return null;
      const dialogueSegments = normalizeDialogueSegments(row.dialogueSegments);
      if (dialogueSegments.length <= 0) {
        throw new DialogueSpeakerPlannerError(`slides[${slideIndex}] dialogueSegments가 비어 있습니다.`, {
          code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
          status: 502,
          retryable: true,
        });
      }
      return {
        slideIndex: Math.max(0, Math.floor(slideIndex)),
        dialogueSegments,
      };
    })
    .filter((item): item is PlannedSlide => Boolean(item));
  return { slides };
}

function toPrompt(slides: PlannerSlide[]): string {
  const slideRows = slides
    .map((slide) =>
      JSON.stringify({
        slideIndex: slide.slideIndex,
        text: slide.text,
        lines: slide.lines,
        existingDialogueSegments: slide.existingDialogueSegments,
      })
    )
    .join("\n");
  return [
    "너는 한국어 숏폼 대본의 화자 분리 플래너다.",
    "입력 슬라이드를 읽고 각 slideIndex마다 dialogueSegments를 다시 구성한다.",
    "반드시 JSON 객체 하나만 반환한다. 설명문, 마크다운, 코드펜스 금지.",
    "",
    "반환 스키마:",
    '{"slides":[{"slideIndex":0,"dialogueSegments":[{"type":"narration","text":"..."},{"type":"quote","speakerId":"female_1","text":"..."}]}]}',
    "",
    "규칙:",
    "- 모든 입력 slideIndex를 정확히 한 번씩 반환한다.",
    "- dialogueSegments.type은 narration 또는 quote만 사용한다.",
    "- 따옴표 안 대사, 직접 발화, 이름: 대사 형태는 quote로 분리한다.",
    "- 나머지 설명 문장은 narration으로 둔다.",
    "- 같은 인물은 여러 슬라이드에서 반드시 같은 speakerId를 재사용한다.",
    "- speakerId는 반드시 canonical slot 형식만 사용한다: male_1, female_1, unknown_1 같은 형식.",
    "- 성별을 확실히 알 수 없으면 unknown_n을 사용한다.",
    "- 추정이 가능한 경우에만 male/female을 사용하고, 애매하면 unknown으로 남긴다.",
    "- quote segment에는 반드시 speakerId를 넣는다.",
    "- narration segment에는 speakerId를 넣지 않는다.",
    "- text는 원문 의미를 유지하되 불필요한 공백만 정리한다.",
    "- 입력에 existingDialogueSegments가 있으면 참고하되, 잘못됐다고 판단되면 수정한다.",
    "- voice, speakerVoices, narrationVoice, quoteVoice 같은 필드는 절대 반환하지 않는다.",
    "",
    "[입력 슬라이드]",
    slideRows,
  ].join("\n");
}

async function planByCodexCli(
  slides: PlannerSlide[],
  options?: {
    codexModel?: string;
  }
): Promise<PlannedDialogueSpeakerResponse> {
  const prompt = toPrompt(slides);
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-dialogue-speaker-plan",
    timeoutMs: 1000 * 60 * 4,
    maxBufferBytes: 1024 * 1024 * 8,
    model: options?.codexModel,
    outputSchema: DIALOGUE_SPEAKER_PLAN_RESPONSE_SCHEMA,
  });
  if (!text) {
    throw new DialogueSpeakerPlannerError("Codex CLI 화자 지정 결과가 비어 있습니다.", {
      code: "DIALOGUE_SPEAKER_PLAN_FAILED",
      status: 502,
      retryable: true,
    });
  }
  return parsePlannedDialogueSpeakerResponse(text);
}

/**
 * API transport (OpenAI or DeepSeek, via requestCodexChatCompletion) for
 * environments without the local Codex CLI bridge. Without this, dialogue
 * speaker planning hard-failed with DIALOGUE_SPEAKER_PLAN_CLI_UNAVAILABLE on
 * DeepSeek deployments — there is no heuristic fallback for this stage.
 */
async function planByCodexApi(
  slides: PlannerSlide[],
  codexAccessToken: string,
  options?: {
    codexModel?: string;
  }
): Promise<PlannedDialogueSpeakerResponse> {
  const prompt = toPrompt(slides);
  const completion = await requestCodexChatCompletion({
    accessToken: codexAccessToken,
    messages: [
      { role: "system", content: "Return JSON only, matching the requested schema exactly." },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    model: options?.codexModel || getCodexModel(),
  });
  if (!completion.text) {
    throw new DialogueSpeakerPlannerError("Codex API 화자 지정 결과가 비어 있습니다.", {
      code: "DIALOGUE_SPEAKER_PLAN_FAILED",
      status: 502,
      retryable: true,
    });
  }
  return parsePlannedDialogueSpeakerResponse(completion.text);
}

function normalizePlannedSlides(planned: PlannedDialogueSpeakerResponse, expectedSlides: PlannerSlide[]): PlannedSlide[] {
  const expectedByIndex = new Map(expectedSlides.map((slide) => [slide.slideIndex, slide]));
  const allocator = createSpeakerSlotAllocator(
    planned.slides.flatMap((slide) =>
      slide.dialogueSegments
        .filter((segment) => segment.type === "quote")
        .map((segment) => String(segment.speakerId || ""))
    )
  );
  const normalizedByIndex = new Map<number, PlannedSlide>();

  for (const item of planned.slides) {
    if (!expectedByIndex.has(item.slideIndex)) continue;
    if (normalizedByIndex.has(item.slideIndex)) {
      throw new DialogueSpeakerPlannerError(`slides[${item.slideIndex}]가 중복 반환되었습니다.`, {
        code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
        status: 502,
        retryable: true,
      });
    }
    const dialogueSegments = item.dialogueSegments.map((segment) => {
      if (segment.type !== "quote") {
        return {
          type: "narration" as const,
          text: normalizeWhitespace(segment.text),
        };
      }
      return {
        type: "quote" as const,
        text: normalizeWhitespace(segment.text),
        speakerId: allocator.resolve(String(segment.speakerId || "")),
      };
    });
    if (dialogueSegments.length <= 0) {
      throw new DialogueSpeakerPlannerError(`slides[${item.slideIndex}] dialogueSegments가 비어 있습니다.`, {
        code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
        status: 502,
        retryable: true,
      });
    }
    normalizedByIndex.set(item.slideIndex, {
      slideIndex: item.slideIndex,
      dialogueSegments,
    });
  }

  const missingIndexes = expectedSlides.map((slide) => slide.slideIndex).filter((slideIndex) => !normalizedByIndex.has(slideIndex));
  if (missingIndexes.length > 0) {
    throw new DialogueSpeakerPlannerError(`Codex 화자 지정 결과가 일부 슬라이드를 누락했습니다: ${missingIndexes.join(", ")}`, {
      code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
      status: 502,
      retryable: true,
    });
  }

  return expectedSlides.map((slide) => normalizedByIndex.get(slide.slideIndex)!);
}

function preserveSpeakerVoiceMap(
  source: Record<string, unknown>,
  plannedSlides: PlannedSlide[],
  renameMap: Record<string, string>
): SpeakerVoiceMap | undefined {
  if (!source.speakerVoices || typeof source.speakerVoices !== "object" || Array.isArray(source.speakerVoices)) return undefined;
  const existing = source.speakerVoices as Record<string, unknown>;
  const activeSpeakerIds = new Set(
    plannedSlides.flatMap((slide) =>
      slide.dialogueSegments
        .filter((segment) => segment.type === "quote")
        .map((segment) => normalizeSpeakerId(String(segment.speakerId || "")))
        .filter(Boolean)
    )
  );
  const next: SpeakerVoiceMap = {};
  const entries = Object.entries(existing)
    .map(([rawSpeakerId, rawVoiceId]) => ({
      speakerId: normalizeSpeakerId(rawSpeakerId),
      voiceId: normalizeWhitespace(rawVoiceId),
    }))
    .filter((entry) => entry.speakerId && entry.voiceId);
  for (const entry of entries.filter((candidate) => !renameMap[candidate.speakerId])) {
    const speakerId = entry.speakerId;
    if (!activeSpeakerIds.has(speakerId)) continue;
    next[speakerId] = entry.voiceId;
  }
  for (const entry of entries.filter((candidate) => Boolean(renameMap[candidate.speakerId]))) {
    const speakerId = renameMap[entry.speakerId];
    if (!activeSpeakerIds.has(speakerId) || next[speakerId]) continue;
    const voiceId = entry.voiceId;
    if (!voiceId) continue;
    next[speakerId] = voiceId;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function toSpeakerMatchText(value: unknown): string {
  return normalizeWhitespace(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function resolveSpeakerRenameMap(source: Record<string, unknown>, plannedSlides: PlannedSlide[]): Record<string, string> {
  const sourceSlides = Array.isArray(source.slides) ? source.slides : [];
  const candidateTargets = new Map<string, Set<string>>();
  for (const plannedSlide of plannedSlides) {
    const sourceSlide = sourceSlides[plannedSlide.slideIndex];
    if (!sourceSlide || typeof sourceSlide !== "object" || Array.isArray(sourceSlide)) continue;
    const sourceSegments = Array.isArray((sourceSlide as Record<string, unknown>).dialogueSegments)
      ? ((sourceSlide as Record<string, unknown>).dialogueSegments as unknown[])
      : [];
    const previousQuotes = sourceSegments
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .filter((segment) => normalizeWhitespace(segment.type).toLowerCase() === "quote")
      .map((segment) => ({
        text: normalizeWhitespace(segment.text),
        matchText: toSpeakerMatchText(segment.text),
        speakerId: normalizeSpeakerId(String(segment.speakerId || "")),
      }))
      .filter((segment) => segment.text && segment.speakerId);
    const plannedQuotes = plannedSlide.dialogueSegments
      .filter((segment) => segment.type === "quote")
      .map((segment) => ({
        text: normalizeWhitespace(segment.text),
        matchText: toSpeakerMatchText(segment.text),
        speakerId: normalizeSpeakerId(String(segment.speakerId || "")),
      }))
      .filter((segment) => segment.text && segment.speakerId);
    const usedPreviousIndexes = new Set<number>();
    const singlePreviousSpeaker = new Set(previousQuotes.map((quote) => quote.speakerId)).size === 1;
    const singlePlannedSpeaker = new Set(plannedQuotes.map((quote) => quote.speakerId)).size === 1;
    for (let plannedIndex = 0; plannedIndex < plannedQuotes.length; plannedIndex += 1) {
      const plannedQuote = plannedQuotes[plannedIndex];
      let previousIndex = previousQuotes.findIndex(
        (quote, index) =>
          !usedPreviousIndexes.has(index) &&
          (quote.text === plannedQuote.text || (quote.matchText && quote.matchText === plannedQuote.matchText))
      );
      if (previousIndex < 0 && previousQuotes.length === plannedQuotes.length && previousQuotes[plannedIndex]) {
        previousIndex = plannedIndex;
      }
      if (previousIndex < 0 && singlePreviousSpeaker && singlePlannedSpeaker && previousQuotes[0]) {
        previousIndex = 0;
      }
      if (previousIndex < 0) continue;
      usedPreviousIndexes.add(previousIndex);
      const previousSpeakerId = previousQuotes[previousIndex]?.speakerId || "";
      const nextSpeakerId = plannedQuote.speakerId;
      if (!previousSpeakerId || !nextSpeakerId || previousSpeakerId === nextSpeakerId) continue;
      const targets = candidateTargets.get(previousSpeakerId) || new Set<string>();
      targets.add(nextSpeakerId);
      candidateTargets.set(previousSpeakerId, targets);
    }
  }
  const renameMap: Record<string, string> = {};
  for (const [previousSpeakerId, targets] of candidateTargets) {
    if (targets.size !== 1) continue;
    renameMap[previousSpeakerId] = Array.from(targets)[0];
  }
  return renameMap;
}

function hasMeaningfulProfileValue(value: unknown): boolean {
  return typeof value === "string" ? Boolean(value.trim()) : value !== undefined && value !== null;
}

function remapCharacterProfiles(source: Record<string, unknown>, renameMap: Record<string, string>): unknown {
  if (!Array.isArray(source.characterProfiles) || Object.keys(renameMap).length <= 0) return source.characterProfiles;
  const canonical = new Map<string, Record<string, unknown>>();
  const renamed: Array<{ characterId: string; row: Record<string, unknown> }> = [];
  const passthrough: unknown[] = [];
  for (const item of source.characterProfiles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      passthrough.push(item);
      continue;
    }
    const row = item as Record<string, unknown>;
    const characterId = normalizeSpeakerId(String(row.characterId || ""));
    if (!characterId) {
      passthrough.push(item);
      continue;
    }
    const nextCharacterId = renameMap[characterId] || characterId;
    const mapped = { ...row, characterId: nextCharacterId };
    if (nextCharacterId === characterId) {
      canonical.set(characterId, mapped);
    } else {
      renamed.push({ characterId: nextCharacterId, row: mapped });
    }
  }
  for (const item of renamed) {
    const preferred = canonical.get(item.characterId);
    if (!preferred) {
      canonical.set(item.characterId, item.row);
      continue;
    }
    const merged = { ...item.row };
    for (const [key, value] of Object.entries(preferred)) {
      if (key === "characterId" || !hasMeaningfulProfileValue(value)) continue;
      merged[key] = value;
    }
    merged.characterId = item.characterId;
    canonical.set(item.characterId, merged);
  }
  return [...canonical.values(), ...passthrough];
}

function resolvePlannedCharacterIds(
  sourceSlide: Record<string, unknown>,
  plannedSegments: PlannerDialogueSegment[],
  renameMap: Record<string, string>
): string[] {
  const plannedSpeakerIds = plannedSegments
    .filter((segment) => segment.type === "quote")
    .map((segment) => normalizeSpeakerId(String(segment.speakerId || "")))
    .filter(Boolean);
  const plannedSpeakerSet = new Set(plannedSpeakerIds);
  const preservedCharacterIds = (Array.isArray(sourceSlide.characterIds) ? sourceSlide.characterIds : [])
    .map((value) => normalizeSpeakerId(String(value || "")))
    .map((characterId) => renameMap[characterId] || characterId)
    .filter((characterId) => {
      if (!characterId) return false;
      if (!/^unknown_\d+$/u.test(characterId) && !/^speaker_\d+$/u.test(characterId)) return true;
      return plannedSpeakerSet.has(characterId);
    });
  return Array.from(new Set([...preservedCharacterIds, ...plannedSpeakerIds]));
}

function applyPlannedSlidesToSource(source: Record<string, unknown>, plannedSlides: PlannedSlide[]): Record<string, unknown> {
  const plannedByIndex = new Map(plannedSlides.map((slide) => [slide.slideIndex, slide]));
  const sourceSlides = Array.isArray(source.slides) ? source.slides : [];
  const renameMap = resolveSpeakerRenameMap(source, plannedSlides);
  const nextSlides = sourceSlides.map((item, slideIndex) => {
    const planned = plannedByIndex.get(slideIndex);
    if (!planned) return item;
    if (typeof item === "string") {
      const text = normalizeWhitespace(item);
      const characterIds = resolvePlannedCharacterIds({}, planned.dialogueSegments, renameMap);
      return {
        text,
        lines: text ? [text] : [],
        dialogueSegments: planned.dialogueSegments,
        ...(characterIds.length > 0 ? { characterIds } : {}),
      };
    }
    if (!item || typeof item !== "object") {
      const characterIds = resolvePlannedCharacterIds({}, planned.dialogueSegments, renameMap);
      return {
        text: planned.dialogueSegments.map((segment) => segment.text).join(" "),
        lines: planned.dialogueSegments.map((segment) => segment.text),
        dialogueSegments: planned.dialogueSegments,
        ...(characterIds.length > 0 ? { characterIds } : {}),
      };
    }
    const sourceSlide = item as Record<string, unknown>;
    const characterIds = resolvePlannedCharacterIds(sourceSlide, planned.dialogueSegments, renameMap);
    const { characterIds: _characterIds, ...rest } = sourceSlide;
    return {
      ...rest,
      dialogueSegments: planned.dialogueSegments,
      ...(characterIds.length > 0 ? { characterIds } : {}),
    };
  });
  const preservedSpeakerVoices = preserveSpeakerVoiceMap(source, plannedSlides, renameMap);
  const remappedCharacterProfiles = remapCharacterProfiles(source, renameMap);
  const nextSource: Record<string, unknown> = {
    ...source,
    mode: "dialogue",
    slides: nextSlides,
  };
  if (Array.isArray(remappedCharacterProfiles)) {
    nextSource.characterProfiles = remappedCharacterProfiles;
  }
  if (preservedSpeakerVoices) {
    nextSource.speakerVoices = preservedSpeakerVoices;
  } else if (Object.prototype.hasOwnProperty.call(nextSource, "speakerVoices")) {
    delete nextSource.speakerVoices;
  }
  return nextSource;
}

export async function assignDialogueSpeakersByCodex(
  input: {
    sourceJson: Record<string, unknown>;
    codexModel?: string;
    codexAccessToken?: string;
  },
  options?: {
    transportOverrides?: DialogueSpeakerPlannerTransportOverrides;
  }
): Promise<{
  json: Record<string, unknown>;
  usage?: {
    model?: string;
  };
}> {
  const sourceJson = input.sourceJson && typeof input.sourceJson === "object" ? input.sourceJson : null;
  if (!sourceJson) {
    throw new DialogueSpeakerPlannerError("화자 지정을 위한 JSON 입력이 올바르지 않습니다.", {
      code: "DIALOGUE_SPEAKER_PLAN_INPUT_INVALID",
      status: 400,
      retryable: false,
    });
  }
  const plannerSlides = extractPlannerSlides(sourceJson);
  if (plannerSlides.length <= 0) {
    throw new DialogueSpeakerPlannerError("화자 지정을 위한 slides가 비어 있습니다.", {
      code: "DIALOGUE_SPEAKER_PLAN_INPUT_INVALID",
      status: 400,
      retryable: false,
    });
  }

  const codexAccessToken = (input.codexAccessToken || "").trim();
  const useLocalCli = options?.transportOverrides?.canUseLocalCliBridge
    ? options.transportOverrides.canUseLocalCliBridge(codexAccessToken)
    : canUseLocalCodexCliBridge(codexAccessToken);
  const useApi = !useLocalCli && Boolean(codexAccessToken);
  if (!useLocalCli && !useApi) {
    throw new DialogueSpeakerPlannerError(
      "로컬 Codex CLI bridge와 API 접근 토큰을 모두 사용할 수 없습니다. Codex 연결 상태를 확인해 주세요.",
      {
        code: "DIALOGUE_SPEAKER_PLAN_CLI_UNAVAILABLE",
        status: 503,
        retryable: false,
      }
    );
  }

  const planWithCli = options?.transportOverrides?.planByCodexCli || planByCodexCli;
  const planWithApi = options?.transportOverrides?.planByCodexApi || planByCodexApi;
  let planned: PlannedDialogueSpeakerResponse;
  try {
    planned = await runCodexPlannerWithRetry(() =>
      useLocalCli
        ? planWithCli(plannerSlides, {
            codexModel: input.codexModel,
          })
        : planWithApi(plannerSlides, codexAccessToken, {
            codexModel: input.codexModel,
          })
    );
  } catch (error) {
    if (error instanceof DialogueSpeakerPlannerError) {
      throw error;
    }
    const message = isCodexCliNotFoundError(error)
      ? "로컬 Codex CLI를 찾지 못했습니다. Codex CLI 설치와 실행 경로를 확인해 주세요."
      : `Codex ${useLocalCli ? "CLI" : "API"} 화자 지정 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
    throw new DialogueSpeakerPlannerError(message, {
      code: "DIALOGUE_SPEAKER_PLAN_FAILED",
      status: 502,
      retryable: !isCodexCliNotFoundError(error),
    });
  }

  const normalizedPlannedSlides = normalizePlannedSlides(planned, plannerSlides);
  const quoteCount = normalizedPlannedSlides.reduce(
    (count, slide) => count + slide.dialogueSegments.filter((segment) => segment.type === "quote").length,
    0
  );
  if (quoteCount <= 0) {
    throw new DialogueSpeakerPlannerError("Codex가 화자 대사 구간을 찾지 못했습니다. 따옴표 대사나 발화 구간이 있는지 확인해 주세요.", {
      code: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
      status: 422,
      retryable: false,
    });
  }

  return {
    json: applyPlannedSlidesToSource(sourceJson, normalizedPlannedSlides),
    usage: {
      model: input.codexModel || (useLocalCli ? resolveDefaultLocalCodexCliModel() : getCodexModel()),
    },
  };
}
