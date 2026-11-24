const MB = 1024 * 1024;

const DEFAULT_RENDER_SOFT_LIMIT_MB = 850;
const DEFAULT_RENDER_HARD_LIMIT_MB = 1200;
const DEFAULT_CAPTURE_SOFT_LIMIT_MB = 700;
const DEFAULT_CAPTURE_HARD_LIMIT_MB = 1024;

const MIN_SOFT_LIMIT_MB = 256;
const MAX_SOFT_LIMIT_MB = 4096;
const MIN_HARD_LIMIT_MB = 384;
const MAX_HARD_LIMIT_MB = 6144;

const AUDIO_WORKING_SET_MULTIPLIER = 2.4;
const CAPTURE_WORKING_SET_MULTIPLIER = 2.6;
const ESTIMATED_BGM_BYTES = 12 * MB;
const ESTIMATED_SFX_BYTES_PER_CUE = 650_000;
const PER_FRAME_RENDER_OVERHEAD_BYTES = 900_000;
const PER_FRAME_CAPTURE_OVERHEAD_BYTES = 700_000;
const DEFAULT_CAPTURE_SCALES = [4, 3, 2];

export type MemoryBudgetLimits = {
  softLimitMb: number;
  hardLimitMb: number;
};

export type RenderAudioMemoryDegradeLevel = "none" | "reduce_sfx" | "disable_bgm_sfx" | "blocked";

export type RenderAudioMemoryBudgetPlan = {
  softLimitMb: number;
  hardLimitMb: number;
  estimatedMb: number;
  degradeLevel: RenderAudioMemoryDegradeLevel;
  degraded: boolean;
  blocked: boolean;
  softLimitExceeded: boolean;
  bgmEnabled: boolean;
  maxSfxCues: number;
};

export type CaptureScaleMemoryDegradeLevel = "none" | "lower_scale" | "blocked";

export type CaptureScaleMemoryPlan = {
  softLimitMb: number;
  hardLimitMb: number;
  estimatedMb: number;
  captureScale: number;
  degradeLevel: CaptureScaleMemoryDegradeLevel;
  degraded: boolean;
  blocked: boolean;
  softLimitExceeded: boolean;
};

function parseLimitMb(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const normalized = String(rawValue || "").trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeLimits(input: MemoryBudgetLimits): MemoryBudgetLimits {
  const softLimitMb = Math.max(MIN_SOFT_LIMIT_MB, Math.min(MAX_SOFT_LIMIT_MB, Math.round(input.softLimitMb)));
  const hardMinBySoft = softLimitMb + 128;
  const hardLimitMb = Math.max(
    hardMinBySoft,
    Math.min(MAX_HARD_LIMIT_MB, Math.round(input.hardLimitMb))
  );
  return {
    softLimitMb,
    hardLimitMb,
  };
}

export function resolveRenderMemoryBudgetLimits(): MemoryBudgetLimits {
  return normalizeLimits({
    softLimitMb: parseLimitMb(
      process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB,
      DEFAULT_RENDER_SOFT_LIMIT_MB,
      MIN_SOFT_LIMIT_MB,
      MAX_SOFT_LIMIT_MB
    ),
    hardLimitMb: parseLimitMb(
      process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB,
      DEFAULT_RENDER_HARD_LIMIT_MB,
      MIN_HARD_LIMIT_MB,
      MAX_HARD_LIMIT_MB
    ),
  });
}

export function resolveCaptureMemoryBudgetLimits(): MemoryBudgetLimits {
  return normalizeLimits({
    softLimitMb: parseLimitMb(
      process.env.NEXT_PUBLIC_STUDIO_CAPTURE_MEMORY_SOFT_LIMIT_MB,
      DEFAULT_CAPTURE_SOFT_LIMIT_MB,
      MIN_SOFT_LIMIT_MB,
      MAX_SOFT_LIMIT_MB
    ),
    hardLimitMb: parseLimitMb(
      process.env.NEXT_PUBLIC_STUDIO_CAPTURE_MEMORY_HARD_LIMIT_MB,
      DEFAULT_CAPTURE_HARD_LIMIT_MB,
      MIN_HARD_LIMIT_MB,
      MAX_HARD_LIMIT_MB
    ),
  });
}

export function estimateBase64Bytes(base64: string): number {
  const compact = String(base64 || "").trim();
  if (!compact) return 0;
  const padding =
    compact.endsWith("==") ? 2 :
    compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function estimateRenderAudioWorkingSetMb(input: {
  frameCount: number;
  imageBytes: number;
  narrationAudioBytes: number;
  bgmEnabled: boolean;
  sfxCueCount: number;
}): number {
  const frameCount = Math.max(0, Math.floor(input.frameCount));
  const imageBytes = Math.max(0, Math.floor(input.imageBytes));
  const narrationAudioBytes = Math.max(0, Math.floor(input.narrationAudioBytes));
  const sfxCueCount = Math.max(0, Math.floor(input.sfxCueCount));
  const bgmBytes = input.bgmEnabled ? ESTIMATED_BGM_BYTES : 0;
  const sfxBytes = sfxCueCount * ESTIMATED_SFX_BYTES_PER_CUE;
  const baseBytes = imageBytes + narrationAudioBytes + bgmBytes + sfxBytes;
  const workingBytes = baseBytes * AUDIO_WORKING_SET_MULTIPLIER + frameCount * PER_FRAME_RENDER_OVERHEAD_BYTES;
  return Number((workingBytes / MB).toFixed(2));
}

export function planRenderAudioMemoryBudget(input: {
  frameCount: number;
  imageBytes: number;
  narrationAudioBytes: number;
  bgmEnabled: boolean;
  sfxCueCount: number;
  softLimitMb: number;
  hardLimitMb: number;
}): RenderAudioMemoryBudgetPlan {
  const limits = normalizeLimits({
    softLimitMb: input.softLimitMb,
    hardLimitMb: input.hardLimitMb,
  });
  const baseEstimate = estimateRenderAudioWorkingSetMb({
    frameCount: input.frameCount,
    imageBytes: input.imageBytes,
    narrationAudioBytes: input.narrationAudioBytes,
    bgmEnabled: input.bgmEnabled,
    sfxCueCount: input.sfxCueCount,
  });
  const sfxCueCount = Math.max(0, Math.floor(input.sfxCueCount));
  if (baseEstimate > limits.hardLimitMb) {
    return {
      ...limits,
      estimatedMb: baseEstimate,
      degradeLevel: "blocked",
      degraded: false,
      blocked: true,
      softLimitExceeded: true,
      bgmEnabled: input.bgmEnabled,
      maxSfxCues: sfxCueCount,
    };
  }

  return {
    ...limits,
    estimatedMb: baseEstimate,
    degradeLevel: "none",
    degraded: false,
    blocked: false,
    softLimitExceeded: baseEstimate > limits.softLimitMb,
    bgmEnabled: input.bgmEnabled,
    maxSfxCues: sfxCueCount,
  };
}

function estimateCaptureWorkingSetMb(input: {
  frameCount: number;
  baseWidthPx: number;
  baseHeightPx: number;
  scale: number;
}): number {
  const frameCount = Math.max(0, Math.floor(input.frameCount));
  const scale = Math.max(1, Math.floor(input.scale));
  const width = Math.max(1, Math.round(input.baseWidthPx * scale));
  const height = Math.max(1, Math.round(input.baseHeightPx * scale));
  const rawBytes = width * height * 4 * frameCount;
  const workingBytes = rawBytes * CAPTURE_WORKING_SET_MULTIPLIER + frameCount * PER_FRAME_CAPTURE_OVERHEAD_BYTES;
  return Number((workingBytes / MB).toFixed(2));
}

export function planCaptureScaleMemoryBudget(input: {
  frameCount: number;
  baseWidthPx: number;
  baseHeightPx: number;
  preferredScale: number;
  softLimitMb: number;
  hardLimitMb: number;
  candidateScales?: number[];
}): CaptureScaleMemoryPlan {
  const limits = normalizeLimits({
    softLimitMb: input.softLimitMb,
    hardLimitMb: input.hardLimitMb,
  });
  const preferredScale = Math.max(1, Math.floor(input.preferredScale));
  const candidatesRaw = Array.isArray(input.candidateScales) && input.candidateScales.length > 0
    ? input.candidateScales
    : DEFAULT_CAPTURE_SCALES;
  const candidates = Array.from(
    new Set(
      candidatesRaw
        .map((value) => Math.max(1, Math.floor(Number(value))))
        .filter((value) => value <= preferredScale)
    )
  ).sort((a, b) => b - a);
  const safeCandidates = candidates.length > 0 ? candidates : [preferredScale];

  let selectedScale = safeCandidates[safeCandidates.length - 1];
  let selectedEstimate = estimateCaptureWorkingSetMb({
    frameCount: input.frameCount,
    baseWidthPx: input.baseWidthPx,
    baseHeightPx: input.baseHeightPx,
    scale: selectedScale,
  });

  for (const scale of safeCandidates) {
    const estimate = estimateCaptureWorkingSetMb({
      frameCount: input.frameCount,
      baseWidthPx: input.baseWidthPx,
      baseHeightPx: input.baseHeightPx,
      scale,
    });
    selectedScale = scale;
    selectedEstimate = estimate;
    if (estimate <= limits.softLimitMb) {
      break;
    }
  }

  if (selectedEstimate > limits.hardLimitMb) {
    return {
      ...limits,
      estimatedMb: selectedEstimate,
      captureScale: selectedScale,
      degradeLevel: "blocked",
      degraded: selectedScale < preferredScale,
      blocked: true,
      softLimitExceeded: true,
    };
  }

  if (selectedScale < preferredScale) {
    return {
      ...limits,
      estimatedMb: selectedEstimate,
      captureScale: selectedScale,
      degradeLevel: "lower_scale",
      degraded: true,
      blocked: false,
      softLimitExceeded: selectedEstimate > limits.softLimitMb,
    };
  }

  return {
    ...limits,
    estimatedMb: selectedEstimate,
    captureScale: selectedScale,
    degradeLevel: "none",
    degraded: false,
    blocked: false,
    softLimitExceeded: selectedEstimate > limits.softLimitMb,
  };
}
