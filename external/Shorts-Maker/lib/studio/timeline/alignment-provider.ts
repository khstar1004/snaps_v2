import { getGroupNarrationText, getSlideNarrationText } from "@/lib/studio/narration-text";
import {
  concatStudioAudioSegments,
  estimateDurationsFromStudioAudioSegments,
  estimateStudioAudioDurationSec,
  synthesizeStudioSpeechSegments,
} from "@/lib/studio/tts-service";
import type { PreparedSlide } from "@/types/studio-json";

export type AlignmentProviderId = "heuristic";

export type AlignmentCanaryConfig = {
  enabled: boolean;
  percent: number;
  categories: string[];
  voices: string[];
};

export type ResolvedTimelineResult = {
  fullAudio: string;
  fullAudioMimeType: "audio/wav";
  fullAudioFormat: "wav";
  frameDurationsSec: number[];
  speechDurationSec: number;
  ttsChars: number;
  provider: AlignmentProviderId;
  requestedProvider: AlignmentProviderId;
  resolvedProvider: AlignmentProviderId;
  canaryApplied: boolean;
  fallbackUsed: boolean;
};

type SlideTtsGroup = {
  groupId: number;
  frames: PreparedSlide[];
  text: string;
};

function toLineWeight(text: string): number {
  const normalized = String(text || "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
  return Math.max(1, normalized.length);
}

function splitDurationByWeights(totalSec: number, weights: number[], minLineSec: number): number[] {
  const count = weights.length;
  if (count <= 0) return [];
  const safeTotal = Math.max(0.001, Number.isFinite(totalSec) ? totalSec : 0.001);
  if (count === 1) return [safeTotal];

  const safeWeights = weights.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  const sumWeights = safeWeights.reduce((acc, cur) => acc + cur, 0) || count;
  const base = safeWeights.map((value) => (safeTotal * value) / sumWeights);
  const minSec = Math.max(0.001, Math.min(minLineSec, safeTotal / count));

  let deficit = 0;
  let donorPool = 0;
  for (const value of base) {
    if (value < minSec) {
      deficit += minSec - value;
    } else {
      donorPool += value - minSec;
    }
  }

  const next = [...base];
  if (deficit > 0 && donorPool > 0) {
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] < minSec) next[i] = minSec;
    }
    let remaining = deficit;
    for (let i = 0; i < next.length; i += 1) {
      const spare = Math.max(0, next[i] - minSec);
      if (spare <= 0) continue;
      const cut = Math.min(spare, (deficit * spare) / donorPool);
      next[i] -= cut;
      remaining -= cut;
    }
    if (remaining > 0) {
      for (let i = next.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const spare = Math.max(0, next[i] - minSec);
        if (spare <= 0) continue;
        const cut = Math.min(spare, remaining);
        next[i] -= cut;
        remaining -= cut;
      }
    }
  }

  for (let i = 0; i < next.length; i += 1) {
    next[i] = Math.max(0.001, next[i]);
  }
  const sum = next.reduce((acc, cur) => acc + cur, 0);
  const drift = safeTotal - sum;
  next[next.length - 1] = Math.max(0.001, next[next.length - 1] + drift);
  return next;
}

function buildSlideTtsGroups(frames: PreparedSlide[]): SlideTtsGroup[] {
  if (!frames.length) return [];
  const hasGroupMetadata = frames.every((frame) => Number.isFinite(frame.groupId) && Number.isFinite(frame.stepIndex));
  if (!hasGroupMetadata) {
    return frames.map((frame, index) => ({
      groupId: index,
      frames: [frame],
      text: getSlideNarrationText(frame),
    }));
  }

  const grouped = new Map<number, PreparedSlide[]>();
  for (const frame of frames) {
    const key = Number(frame.groupId);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(frame);
    } else {
      grouped.set(key, [frame]);
    }
  }

  const orderedGroupIds = Array.from(grouped.keys()).sort((a, b) => a - b);
  return orderedGroupIds.map((groupId) => {
    const groupFrames = (grouped.get(groupId) || []).slice().sort((a, b) => Number(a.stepIndex || 0) - Number(b.stepIndex || 0));
    const slideText = getGroupNarrationText(groupFrames);
    return {
      groupId,
      frames: groupFrames,
      text: slideText || " ",
    };
  });
}

function expandFrameDurationsFromSlideGroups(groups: SlideTtsGroup[], slideDurations: number[], minLineSec: number): number[] {
  const frameDurations: number[] = [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const slideDuration = Number.isFinite(slideDurations[i]) && slideDurations[i] > 0 ? slideDurations[i] : 0.001;
    const weights = group.frames.map((frame) => toLineWeight(getSlideNarrationText(frame)));
    const perFrame = splitDurationByWeights(slideDuration, weights, minLineSec);
    frameDurations.push(...perFrame);
  }
  return frameDurations;
}

export function resolveAlignmentCanaryConfigFromEnv(): AlignmentCanaryConfig {
  return {
    enabled: false,
    percent: 0,
    categories: [],
    voices: [],
  };
}

export function resolveAlignmentProviderDecision(): {
  requestedProvider: AlignmentProviderId;
  canaryApplied: boolean;
} {
  return {
    requestedProvider: "heuristic",
    canaryApplied: false,
  };
}

async function resolveByHeuristic(input: {
  frames: PreparedSlide[];
  ttsVoiceId?: string;
  typecastEmotionType?: string;
  typecastSpeed?: number;
}): Promise<ResolvedTimelineResult> {
  const groups = buildSlideTtsGroups(input.frames);
  const groupTexts = groups.map((group) => group.text || " ");
  const audioSegments = await synthesizeStudioSpeechSegments(groupTexts, input.ttsVoiceId, {
    typecastEmotionType: input.typecastEmotionType,
    typecastSpeed: input.typecastSpeed,
  });
  const joinedAudio = concatStudioAudioSegments(audioSegments);
  const fullAudio = joinedAudio.audioBase64;
  if (!fullAudio) {
    throw new Error("슬라이드 단위 TTS 합성 결과가 비어 있습니다.");
  }

  const slideDurationsSec = estimateDurationsFromStudioAudioSegments(audioSegments).map((duration) =>
    Number.isFinite(duration) && duration > 0 ? duration : 0.001
  );
  const frameDurationsSec = expandFrameDurationsFromSlideGroups(groups, slideDurationsSec, 0.18);
  if (frameDurationsSec.length !== input.frames.length) {
    throw new Error("휴리스틱 프레임 타이밍 계산 결과가 프레임 수와 다릅니다.");
  }

  const speechDurationSec =
    frameDurationsSec.reduce((acc, cur) => acc + cur, 0) || estimateStudioAudioDurationSec(fullAudio, joinedAudio.format);
  return {
    fullAudio,
    fullAudioMimeType: joinedAudio.mimeType,
    fullAudioFormat: joinedAudio.format,
    frameDurationsSec,
    speechDurationSec,
    ttsChars: groupTexts.reduce((acc, text) => acc + String(text || "").trim().length, 0),
    provider: "heuristic",
    requestedProvider: "heuristic",
    resolvedProvider: "heuristic",
    canaryApplied: false,
    fallbackUsed: false,
  };
}

export async function resolveSingleAudioTimeline(input: {
  frames: PreparedSlide[];
  ttsVoiceId?: string;
  typecastEmotionType?: string;
  typecastSpeed?: number;
  publishCategory?: string;
  providerOverride?: AlignmentProviderId;
  disableCanary?: boolean;
  disableFallbackToHeuristic?: boolean;
}): Promise<ResolvedTimelineResult> {
  return resolveByHeuristic(input);
}
