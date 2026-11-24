import type {
  DialogueMode,
  DialogueRoutingPlan,
  DialogueSegment,
  DialogueSegmentType,
  DialogueSlidePlan,
  ScriptToJsonSlide,
  SpeakerVoiceMap,
} from "@/lib/studio/codex-script-to-json";

function normalizeScriptWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstNonEmpty(values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = (value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function isQuoteBoundaryChar(char: string): boolean {
  return char === "\"" || char === "“" || char === "”";
}

function resolveDialogueVoices(): { narrationVoice: string; quoteVoice: string } {
  const defaultVoice = firstNonEmpty([
    process.env.STUDIO_TTS_DEFAULT_VOICE_ID,
    process.env.STUDIO_TTS_DEFAULT_VOICE,
    process.env.TYPECAST_DEFAULT_VOICE_ID,
    process.env.TYPECAST_VOICE_ID,
  ]);
  const narrationVoice = firstNonEmpty([
    process.env.STUDIO_DIALOGUE_NARRATION_VOICE_ID,
    process.env.STUDIO_NARRATION_VOICE_ID,
    process.env.STUDIO_DIALOGUE_NARRATION_VOICE,
    defaultVoice,
  ]);
  const quoteVoice = firstNonEmpty([
    process.env.STUDIO_DIALOGUE_QUOTE_VOICE_ID,
    process.env.STUDIO_QUOTE_VOICE_ID,
    process.env.STUDIO_DIALOGUE_QUOTE_VOICE,
    narrationVoice,
    defaultVoice,
  ]);
  return {
    narrationVoice,
    quoteVoice: quoteVoice || narrationVoice,
  };
}

type SpeakerSlotRole = "male" | "female" | "unknown";

export function normalizeSpeakerId(value: string): string {
  return normalizeScriptWhitespace(value)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

export function toSpeakerVoiceMap(value: unknown): SpeakerVoiceMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const speakerVoices: SpeakerVoiceMap = {};
  for (const [rawSpeakerId, rawVoiceId] of Object.entries(row)) {
    const speakerId = normalizeSpeakerId(rawSpeakerId);
    const voiceId = normalizeScriptWhitespace(typeof rawVoiceId === "string" ? rawVoiceId : "");
    if (!speakerId || !voiceId) continue;
    speakerVoices[speakerId] = voiceId;
    if (Object.keys(speakerVoices).length >= 16) break;
  }
  return Object.keys(speakerVoices).length > 0 ? speakerVoices : undefined;
}

function inferSpeakerSlotRole(value: string): SpeakerSlotRole {
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

function inferSpeakerRoleFromContext(value: string): SpeakerSlotRole {
  const normalized = normalizeScriptWhitespace(value).toLowerCase();
  if (!normalized) return "unknown";
  if (/(그 여자|여자였|여자였음|그녀|언니|누나|엄마|아내|딸|female|woman|girl|wife|mother|daughter)/u.test(normalized)) {
    return "female";
  }
  if (/(그 남자|남자였|남자였음|남편|아빠|아들|형|오빠|male|man|boy|husband|father|son)/u.test(normalized)) {
    return "male";
  }
  return "unknown";
}

function createSpeakerSlotAllocator() {
  const labelToSlot = new Map<string, string>();
  const roleCounts: Record<SpeakerSlotRole, number> = {
    male: 0,
    female: 0,
    unknown: 0,
  };

  const registerCanonicalSlot = (speakerId: string): string => {
    const normalized = normalizeSpeakerId(speakerId);
    const canonicalMatch = normalized.match(/^(male|female|unknown)_(\d+)$/u);
    if (canonicalMatch) {
      const role = canonicalMatch[1] as SpeakerSlotRole;
      const index = Number(canonicalMatch[2]);
      if (Number.isFinite(index) && index > 0) {
        roleCounts[role] = Math.max(roleCounts[role], index);
      }
      return normalized;
    }
    const legacyUnknownMatch = normalized.match(/^speaker_(\d+)$/u);
    if (legacyUnknownMatch) {
      const index = Number(legacyUnknownMatch[1]);
      if (Number.isFinite(index) && index > 0) {
        roleCounts.unknown = Math.max(roleCounts.unknown, index);
        return `unknown_${index}`;
      }
    }
    return "";
  };

  const allocateForRole = (role: SpeakerSlotRole): string => {
    roleCounts[role] += 1;
    return `${role}_${roleCounts[role]}`;
  };

  return {
    resolve(rawSpeakerId?: string, contextText?: string): string {
      const normalized = normalizeSpeakerId(rawSpeakerId || "");
      const canonical = registerCanonicalSlot(normalized);
      if (canonical) {
        if (normalized) labelToSlot.set(normalized, canonical);
        return canonical;
      }
      if (normalized && labelToSlot.has(normalized)) {
        return labelToSlot.get(normalized) || "";
      }
      const role =
        normalized && inferSpeakerSlotRole(normalized) !== "unknown"
          ? inferSpeakerSlotRole(normalized)
          : inferSpeakerRoleFromContext(contextText || "");
      const nextSpeakerId = allocateForRole(role);
      if (normalized) labelToSlot.set(normalized, nextSpeakerId);
      return nextSpeakerId;
    },
  };
}

function resolveSpeakerVoicePool(quoteVoice: string): string[] {
  const raw = [
    process.env.STUDIO_DIALOGUE_SPEAKER_VOICE_IDS,
    process.env.STUDIO_DIALOGUE_SPEAKER_VOICES,
    process.env.STUDIO_DIALOGUE_QUOTE_VOICE_IDS,
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(",");
  const pool = raw
    .split(",")
    .map((value) => normalizeScriptWhitespace(value))
    .filter(Boolean);
  if (pool.length <= 0 && quoteVoice) return [quoteVoice];
  if (quoteVoice && !pool.includes(quoteVoice)) {
    pool.unshift(quoteVoice);
  }
  return Array.from(new Set(pool)).slice(0, 8);
}

function splitQuoteSpeakerPrefix(text: string): { text: string; speakerId?: string } {
  const normalized = normalizeScriptWhitespace(text);
  if (!normalized) return { text: "" };
  const matched = normalized.match(/^([\p{L}\p{N}_-]{1,20}(?:\s+[\p{L}\p{N}_-]{1,20}){0,2})\s*[:：]\s*(.+)$/u);
  if (!matched) return { text: normalized };
  const speakerId = normalizeSpeakerId(matched[1] || "");
  const quoteText = normalizeScriptWhitespace(matched[2] || "");
  if (!speakerId || !quoteText) return { text: normalized };
  return {
    text: quoteText,
    speakerId,
  };
}

type DialogueTextSegment = Pick<
  DialogueSegment,
  "type" | "text" | "speakerId" | "voice" | "speed" | "pauseAfterMs"
>;

function mergeDialogueTextSegments(segments: DialogueTextSegment[]): DialogueTextSegment[] {
  const merged: DialogueTextSegment[] = [];
  for (const segment of segments) {
    const text = normalizeScriptWhitespace(segment.text);
    if (!text) continue;
    const speakerId = normalizeSpeakerId(segment.speakerId || "") || undefined;
    const voice = normalizeScriptWhitespace(segment.voice || "") || undefined;
    const previous = merged[merged.length - 1];
    const hasExplicitTiming =
      segment.speed !== undefined ||
      segment.pauseAfterMs !== undefined ||
      previous?.speed !== undefined ||
      previous?.pauseAfterMs !== undefined;
    if (
      previous &&
      !hasExplicitTiming &&
      previous.type === segment.type &&
      normalizeSpeakerId(previous.speakerId || "") === speakerId &&
      normalizeScriptWhitespace(previous.voice || "") === (voice || "")
    ) {
      previous.text = normalizeScriptWhitespace(`${previous.text} ${text}`);
      continue;
    }
    merged.push({
      type: segment.type,
      text,
      speakerId,
      voice,
      speed: segment.speed,
      pauseAfterMs: segment.pauseAfterMs,
    });
  }
  return merged;
}

function resolveDialogueSegmentVoice(
  segment: { type: DialogueSegmentType; speakerId?: string; voice?: string },
  voices: { narrationVoice: string; quoteVoice: string; speakerVoices?: SpeakerVoiceMap }
): string {
  const explicitVoice = normalizeScriptWhitespace(segment.voice || "");
  if (explicitVoice) return explicitVoice;
  const speakerId = normalizeSpeakerId(segment.speakerId || "");
  if (speakerId && voices.speakerVoices?.[speakerId]) {
    return voices.speakerVoices[speakerId];
  }
  return segment.type === "quote" ? voices.quoteVoice : voices.narrationVoice;
}

function splitDialogueSegmentsFromText(
  text: string,
  voices: { narrationVoice: string; quoteVoice: string; speakerVoices?: SpeakerVoiceMap }
): DialogueSlidePlan {
  const source = normalizeScriptWhitespace(text);
  if (!source) {
    return {
      hasQuote: false,
      segments: [],
    };
  }
  const parsed: Array<{ type: DialogueSegmentType; text: string; speakerId?: string }> = [];
  let buffer = "";
  let inQuote = false;
  let foundQuoteBoundary = false;
  const flushBuffer = () => {
    const normalized = normalizeScriptWhitespace(buffer);
    buffer = "";
    if (!normalized) return;
    if (inQuote) {
      const quotePart = splitQuoteSpeakerPrefix(normalized);
      parsed.push({
        type: "quote",
        text: quotePart.text,
        speakerId: quotePart.speakerId,
      });
      return;
    }
    parsed.push({
      type: "narration",
      text: normalized,
    });
  };

  for (const char of Array.from(source)) {
    if (isQuoteBoundaryChar(char)) {
      foundQuoteBoundary = true;
      flushBuffer();
      inQuote = !inQuote;
      continue;
    }
    buffer += char;
  }
  flushBuffer();

  const merged = mergeDialogueTextSegments(parsed);
  const hasQuote = foundQuoteBoundary && merged.some((segment) => segment.type === "quote");
  if (!hasQuote) {
    return {
      hasQuote: false,
      segments: [
        {
          type: "narration",
          text: source,
          voice: resolveDialogueSegmentVoice({ type: "narration" }, voices),
        },
      ],
    };
  }
  return {
    hasQuote: true,
    segments: merged.map((segment) => ({
      type: segment.type,
      text: segment.text,
      speakerId: segment.speakerId,
      voice: resolveDialogueSegmentVoice(segment, voices),
    })),
  };
}

function normalizeDialogueSegmentsFromSlide(
  slide: ScriptToJsonSlide,
  voices: { narrationVoice: string; quoteVoice: string; speakerVoices?: SpeakerVoiceMap }
): DialogueSlidePlan | null {
  if (!Array.isArray(slide.dialogueSegments) || slide.dialogueSegments.length <= 0) return null;
  const merged = mergeDialogueTextSegments(
    slide.dialogueSegments.map((segment) => ({
      type: segment.type === "quote" ? "quote" : "narration",
      text: normalizeScriptWhitespace(segment.text),
      speakerId: normalizeSpeakerId(segment.speakerId || "") || undefined,
      voice: normalizeScriptWhitespace(segment.voice || "") || undefined,
      speed: segment.speed,
      pauseAfterMs: segment.pauseAfterMs,
    }))
  );
  if (merged.length <= 0) return null;
  const hasQuote = merged.some((segment) => segment.type === "quote");
  return {
    hasQuote,
    segments: merged.map((segment) => ({
      type: segment.type,
      text: segment.text,
      speakerId: segment.speakerId,
      voice: resolveDialogueSegmentVoice(segment, voices),
      speed: segment.speed,
      pauseAfterMs: segment.pauseAfterMs,
    })),
  };
}

export function buildDialogueRoutingPlan(input: {
  slides: ScriptToJsonSlide[];
  modeHint?: DialogueMode;
  narrationVoice?: string;
  quoteVoice?: string;
  speakerVoices?: SpeakerVoiceMap;
}): DialogueRoutingPlan {
  const resolvedVoices = resolveDialogueVoices();
  const narrationVoice = firstNonEmpty([input.narrationVoice, resolvedVoices.narrationVoice, resolvedVoices.quoteVoice]);
  const quoteVoice = firstNonEmpty([input.quoteVoice, resolvedVoices.quoteVoice, narrationVoice]);
  const speakerVoices = toSpeakerVoiceMap(input.speakerVoices);
  const voices = {
    narrationVoice: narrationVoice || quoteVoice,
    quoteVoice: quoteVoice || narrationVoice,
    speakerVoices,
  };
  const shouldUseDialogueSplit = input.modeHint !== "normal";
  const plans = input.slides.map((slide) => {
    const explicitPlan = normalizeDialogueSegmentsFromSlide(slide, voices);
    if (explicitPlan) return explicitPlan;
    if (!shouldUseDialogueSplit) {
      const fallbackText = normalizeScriptWhitespace(slide.text);
      return {
        hasQuote: false,
        segments: fallbackText
          ? [
              {
                type: "narration" as const,
                text: fallbackText,
                voice: voices.narrationVoice,
              },
            ]
          : [],
      };
    }
    return splitDialogueSegmentsFromText(slide.text, voices);
  });
  const hasAnyQuote = plans.some((plan) => plan.hasQuote);
  const mode: DialogueMode =
    input.modeHint === "dialogue" ? "dialogue" : input.modeHint === "normal" ? "normal" : hasAnyQuote ? "dialogue" : "normal";
  if (mode === "normal") {
    return {
      mode,
      narrationVoice: voices.narrationVoice,
      quoteVoice: voices.narrationVoice,
      slides: plans.map((plan, index) => {
        const fallbackText = normalizeScriptWhitespace(input.slides[index]?.text || "");
        if (plan.segments.length > 0) {
          return {
            hasQuote: false,
            segments: plan.segments.map((segment) => ({
              ...segment,
              type: "narration",
              voice: voices.narrationVoice,
              speakerId: undefined,
            })),
          };
        }
        if (!fallbackText) {
          return {
            hasQuote: false,
            segments: [],
          };
        }
        return {
          hasQuote: false,
          segments: [
            {
              type: "narration",
              text: fallbackText,
              voice: voices.narrationVoice,
            },
          ],
        };
      }),
    };
  }
  const speakerVoicePool = resolveSpeakerVoicePool(voices.quoteVoice);
  const speakerSlotAllocator = createSpeakerSlotAllocator();
  const mergedSpeakerVoices: SpeakerVoiceMap = {};
  for (const [rawSpeakerId, voiceId] of Object.entries(voices.speakerVoices || {})) {
    const canonicalSpeakerId = speakerSlotAllocator.resolve(rawSpeakerId, rawSpeakerId);
    const normalizedVoiceId = normalizeScriptWhitespace(voiceId);
    if (!canonicalSpeakerId || !normalizedVoiceId) continue;
    mergedSpeakerVoices[canonicalSpeakerId] = normalizedVoiceId;
  }
  const plansWithSpeakerIds = plans.map((plan, slideIndex) => ({
    ...plan,
    segments: plan.segments.map((segment, segmentIndex) => {
      if (segment.type !== "quote") return segment;
      const previousNarration = segmentIndex > 0 && plan.segments[segmentIndex - 1]?.type === "narration" ? plan.segments[segmentIndex - 1]?.text : "";
      const nextNarration =
        segmentIndex + 1 < plan.segments.length && plan.segments[segmentIndex + 1]?.type === "narration"
          ? plan.segments[segmentIndex + 1]?.text
          : "";
      const contextText = [input.slides[slideIndex]?.text || "", previousNarration, nextNarration, segment.text].filter(Boolean).join(" ");
      const speakerId = speakerSlotAllocator.resolve(segment.speakerId, contextText);
      return {
        ...segment,
        speakerId: speakerId || "unknown_1",
      };
    }),
  }));
  for (const plan of plansWithSpeakerIds) {
    for (const segment of plan.segments) {
      if (segment.type !== "quote") continue;
      const speakerId = normalizeSpeakerId(segment.speakerId || "");
      if (!speakerId || mergedSpeakerVoices[speakerId]) continue;
      const suffixMatch = speakerId.match(/^(?:male|female|unknown)_(\d+)$/u);
      const suffix = Number(suffixMatch?.[1] || "");
      const poolIndex = Number.isFinite(suffix) && suffix > 0 ? (Math.floor(suffix) - 1) % Math.max(1, speakerVoicePool.length) : 0;
      mergedSpeakerVoices[speakerId] = speakerVoicePool[poolIndex] || voices.quoteVoice;
    }
  }
  return {
    mode,
    narrationVoice: voices.narrationVoice,
    quoteVoice: voices.quoteVoice || voices.narrationVoice,
    speakerVoices: Object.keys(mergedSpeakerVoices).length > 0 ? mergedSpeakerVoices : undefined,
    slides: plansWithSpeakerIds.map((plan, index) => {
      if (plan.segments.length > 0) {
        return {
          ...plan,
          segments: plan.segments.map((segment) => {
            if (segment.type !== "quote") return segment;
            const speakerId = normalizeSpeakerId(segment.speakerId || "");
            const mappedVoice = speakerId ? mergedSpeakerVoices[speakerId] : "";
            return {
              ...segment,
              speakerId: speakerId || undefined,
              voice: mappedVoice || segment.voice || voices.quoteVoice,
            };
          }),
        };
      }
      const fallbackText = normalizeScriptWhitespace(input.slides[index]?.text || "");
      if (!fallbackText) {
        return {
          hasQuote: false,
          segments: [],
        };
      }
      return {
        hasQuote: false,
        segments: [
          {
            type: "narration",
            text: fallbackText,
            voice: voices.narrationVoice,
          },
        ],
      };
    }),
  };
}
