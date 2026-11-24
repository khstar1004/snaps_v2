import { classifyRenderError, shouldRecycleFfmpegSession, type RenderErrorCode } from "@/lib/studio/render-errors";
import { selectDeterministicSfxFile } from "@/lib/studio/sfx-deterministic";
import { getStudioAudioMixPreset } from "@/lib/studio/audio-mix-presets";
import { STUDIO_BGM_VOLUME_BOOST, STUDIO_SFX_VOLUME_TRIM_DB } from "@/lib/studio/audio-mix-constants";
import { canonicalizeStudioSfxTag } from "@/lib/studio/audio-options";
import { estimateBase64Bytes, planRenderAudioMemoryBudget, resolveRenderMemoryBudgetLimits } from "@/lib/studio/render-memory-budget";
import { loadRequiredStudioSfxAssets } from "@/lib/studio/required-sfx-asset";
import type { SfxTag } from "@/types/studio-json";
import type { StudioRenderNarrationInput, StudioRenderNarrationSegment } from "@/types/studio-renderer";

export type RenderProgress = (stage: string, percent?: number) => void;

const FIXED_BGM_PUBLIC_PATH = "/bgm/Tango de la Noche - Wayne Jones.mp3";
const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const FFMPEG_EXEC_TIMEOUT_MS = 180_000;
const FFMPEG_RENDER_RETRY_LIMIT = 1;
const FFMPEG_MAX_RENDERS_PER_SESSION = 8;
const JOBS_ROOT_DIR = "/jobs";
const MAX_FFMPEG_LOG_LINES = 160;

type FfmpegSession = {
  ffmpeg: any;
  sessionId: number;
  renderCount: number;
  poisoned: boolean;
};

let ffmpegSingletonPromise: Promise<FfmpegSession> | null = null;
let ffmpegSessionSeq = 0;
let renderMutex: Promise<void> = Promise.resolve();

const bgmBytesByPath = new Map<string, Promise<Uint8Array>>();
const sfxBytesByPath = new Map<string, Promise<Uint8Array>>();
const ffmpegRecentLogs: string[] = [];

type RenderSfxCue = {
  cueId?: string;
  frameIndex?: number;
  startMs?: number;
  enabled?: boolean;
  tag: SfxTag;
  gainDb?: number;
  offsetMs?: number;
};

type RenderSfxCatalogCategory = {
  id: string;
  files: Array<{
    id?: string;
    path: string;
    defaultGainDb?: number;
  }>;
};

type RenderNarrationInput = string | StudioRenderNarrationInput;
type ResolvedNarrationInput = Exclude<StudioRenderNarrationInput, { mode: "segmentsRef" }>;
type SupportedNarrationExt = ".mp3" | ".wav" | ".ogg";

type NormalizedSfxCue = {
  path: string;
  startSec: number;
  gainDb: number;
};

type RenderAudioConfig = {
  bgmEnabled: boolean;
  bgmPath: string;
  mixPresetId: string;
  narrationGainLinear: number;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  sfxPresetOffsetDb: number;
  ducking: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
  };
  rawSfxCues: RenderSfxCue[];
  rawSfxCatalog: RenderSfxCatalogCategory[];
};

export type RenderAudioDiagnostics = {
  mixPresetId: string;
  peakRisk: "low" | "medium" | "high";
  previewLoudnessIndex: number;
  finalLoudnessIndex: number;
  loudnessMismatchRatio: number;
  loudnessMismatchDelta: number;
  loudnessMismatchLevel: "low" | "medium" | "high";
  expectedSfxCues: number;
  effectiveSfxCues: number;
  expectedBgmEnabled: boolean;
  effectiveBgmEnabled: boolean;
};

export type RenderShortsVideoResult = {
  blob: Blob;
  audioDiagnostics: RenderAudioDiagnostics;
  memoryBudget: {
    softLimitMb: number;
    hardLimitMb: number;
    estimatedMb: number;
    degradeLevel: "none" | "reduce_sfx" | "disable_bgm_sfx" | "blocked";
    degraded: boolean;
    blocked: boolean;
    softLimitExceeded: boolean;
    expectedSfxCues: number;
    maxSfxCues: number;
    expectedBgmEnabled: boolean;
    effectiveBgmEnabled: boolean;
    inputImageMb: number;
    inputNarrationMb: number;
  };
};

export type RenderAudioOptions = {
  bgmEnabled?: boolean;
  bgmPath?: string;
  mixPresetId?: string;
  bgmVolume?: number;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  sfxCues?: RenderSfxCue[];
  sfxCatalog?: RenderSfxCatalogCategory[];
};

function pushFfmpegLog(line: string): void {
  const compact = String(line || "").trim();
  if (!compact) return;
  ffmpegRecentLogs.push(compact);
  if (ffmpegRecentLogs.length > MAX_FFMPEG_LOG_LINES) {
    ffmpegRecentLogs.splice(0, ffmpegRecentLogs.length - MAX_FFMPEG_LOG_LINES);
  }
}

function getFfmpegLogTail(limit = 40): string {
  if (ffmpegRecentLogs.length <= 0) return "(no ffmpeg log)";
  return ffmpegRecentLogs.slice(-Math.max(1, limit)).join("\n");
}

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toStepErrorCode(step: string): RenderErrorCode {
  if (step === "slideshow") return "SLIDESHOW_ENCODE_FAILED";
  if (
    step === "mix-bgm-sfx" ||
    step === "mux-narration" ||
    step === "mix-narration-segments" ||
    step === "concat-narration-segments"
  ) {
    return "AUDIO_MIX_FAILED";
  }
  return "UNKNOWN";
}

function toNarrationExt(input: { format?: string; mimeType?: string }, fallback: SupportedNarrationExt = ".mp3"): SupportedNarrationExt {
  const format = String(input.format || "").trim().toLowerCase();
  if (format === "wav") return ".wav";
  if (format === "ogg") return ".ogg";
  if (format === "mp3") return ".mp3";
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave") return ".wav";
  if (mimeType === "audio/ogg") return ".ogg";
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return ".mp3";
  return fallback;
}

function segmentsToNarrationExt(segments: StudioRenderNarrationSegment[]): SupportedNarrationExt {
  const first = segments[0];
  return toNarrationExt(
    {
      format: first?.format,
      mimeType: first?.mimeType,
    },
    ".mp3"
  );
}

function normalizeAudioOptions(audioOptions?: RenderAudioOptions): RenderAudioConfig {
  const mixPreset = getStudioAudioMixPreset(audioOptions?.mixPresetId);
  const narrationGainLinear = Math.pow(10, mixPreset.narrationGainDb / 20);
  const baseBgmVolume = Number.isFinite(audioOptions?.bgmVolume)
    ? Number(audioOptions?.bgmVolume)
    : mixPreset.bgmVolume;
  const boostedBgmVolume = Math.max(0, Math.min(1, baseBgmVolume * STUDIO_BGM_VOLUME_BOOST));
  return {
    bgmEnabled: audioOptions?.bgmEnabled !== false,
    bgmPath: (audioOptions?.bgmPath || "").trim() || FIXED_BGM_PUBLIC_PATH,
    mixPresetId: mixPreset.id,
    narrationGainLinear: Math.max(0.1, Math.min(2, narrationGainLinear)),
    bgmVolume: boostedBgmVolume,
    sfxEnabled: audioOptions?.sfxEnabled !== false,
    sfxMasterGainDb: Number.isFinite(audioOptions?.sfxMasterGainDb) ? Math.max(-24, Math.min(12, Number(audioOptions?.sfxMasterGainDb))) : 2,
    sfxPresetOffsetDb: Math.max(-12, Math.min(12, mixPreset.sfxGainOffsetDb)),
    ducking: {
      enabled: false,
      threshold: Math.max(0.001, Math.min(1, mixPreset.ducking.threshold)),
      ratio: Math.max(1, Math.min(20, mixPreset.ducking.ratio)),
      attackMs: Math.max(1, Math.min(2000, Math.round(mixPreset.ducking.attackMs))),
      releaseMs: Math.max(10, Math.min(4000, Math.round(mixPreset.ducking.releaseMs))),
    },
    rawSfxCues: Array.isArray(audioOptions?.sfxCues) ? audioOptions.sfxCues : [],
    rawSfxCatalog: Array.isArray(audioOptions?.sfxCatalog) ? audioOptions.sfxCatalog : [],
  };
}

function toFrameStartsSec(frameDurationsSec: number[]): number[] {
  const frameStartsSec: number[] = [];
  let frameCursor = 0;
  for (let i = 0; i < frameDurationsSec.length; i += 1) {
    frameStartsSec.push(frameCursor);
    frameCursor += Math.max(0, Number(frameDurationsSec[i]) || 0);
  }
  return frameStartsSec;
}

function toSfxFilesByTag(rawSfxCatalog: RenderSfxCatalogCategory[]): Map<string, Array<{ path: string; defaultGainDb: number }>> {
  const byTag = new Map<string, Array<{ path: string; defaultGainDb: number }>>();
  for (const category of rawSfxCatalog) {
    const categoryId = canonicalizeStudioSfxTag(String(category?.id || "").trim());
    if (!categoryId || !Array.isArray(category?.files)) continue;
    const files = category.files
      .map((file) => {
        const fileId = canonicalizeStudioSfxTag(String(file?.id || "").trim());
        const path = String(file?.path || "").trim();
        const defaultGainDbRaw = Number(file?.defaultGainDb);
        return {
          fileId,
          path,
          defaultGainDb: Number.isFinite(defaultGainDbRaw) ? Math.max(-24, Math.min(12, defaultGainDbRaw)) : -3,
        };
      })
      .filter((file): file is { fileId: string; path: string; defaultGainDb: number } => Boolean(file));
    if (files.length <= 0) continue;
    byTag.set(
      categoryId,
      files.map(({ path, defaultGainDb }) => ({ path, defaultGainDb }))
    );
    for (const file of files) {
      if (!file.fileId) continue;
      byTag.set(file.fileId, [{ path: file.path, defaultGainDb: file.defaultGainDb }]);
    }
  }
  return byTag;
}

function normalizeSfxCues(
  frameCount: number,
  frameDurationsSec: number[],
  audioConfig: RenderAudioConfig
): NormalizedSfxCue[] {
  if (!audioConfig.sfxEnabled) return [];
  const sfxFilesByTag = toSfxFilesByTag(audioConfig.rawSfxCatalog);
  const frameStartsSec = toFrameStartsSec(frameDurationsSec);
  return audioConfig.rawSfxCues
    .map((cue) => {
      if (!cue || cue.enabled === false) return null;
      const startMsRaw = Number(cue.startMs);
      const hasStartMs = Number.isFinite(startMsRaw);
      const frameIndex = Number(cue.frameIndex);
      const safeFrameIndex = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : -1;
      if (!hasStartMs && (safeFrameIndex < 0 || safeFrameIndex >= frameCount)) return null;
      const tag = canonicalizeStudioSfxTag(String(cue.tag || "").trim());
      if (!tag) return null;
      const files = sfxFilesByTag.get(tag);
      if (!files || files.length <= 0) return null;
      const offsetMs = Number.isFinite(cue.offsetMs) ? Math.max(-1200, Math.min(1200, Math.floor(Number(cue.offsetMs)))) : 0;
      const gainDbRaw = Number.isFinite(cue.gainDb) ? Number(cue.gainDb) : undefined;
      const picked = selectDeterministicSfxFile(files, {
        cueId: cue.cueId,
        tag,
        frameIndex: safeFrameIndex >= 0 ? safeFrameIndex : undefined,
        startMs: hasStartMs ? startMsRaw : undefined,
        offsetMs,
        gainDb: gainDbRaw,
      });
      const startSec = hasStartMs
        ? Math.max(0, startMsRaw / 1000)
        : Math.max(0, (frameStartsSec[safeFrameIndex] || 0) + offsetMs / 1000);
      const gainDb = Math.max(
        -24,
        Math.min(
          12,
          audioConfig.sfxMasterGainDb + audioConfig.sfxPresetOffsetDb + STUDIO_SFX_VOLUME_TRIM_DB + (gainDbRaw ?? picked.defaultGainDb)
        )
      );
      return {
        path: picked.path,
        startSec,
        gainDb,
      };
    })
    .filter((cue): cue is NormalizedSfxCue => Boolean(cue))
    .slice(0, 24);
}

function estimateAudioPeakRisk(audioConfig: RenderAudioConfig, normalizedSfxCues: NormalizedSfxCue[]): "low" | "medium" | "high" {
  const maxSfxGainDb = normalizedSfxCues.reduce((max, cue) => Math.max(max, cue.gainDb), -24);
  let score = 0;
  if (audioConfig.narrationGainLinear > 1.2) score += 1;
  if (audioConfig.bgmEnabled && audioConfig.bgmVolume > 0.32) score += 1;
  if (maxSfxGainDb > 4) score += 1;
  if (!audioConfig.ducking.enabled && audioConfig.bgmEnabled) score += 1;
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function toExpectedSfxGainsLinear(audioConfig: RenderAudioConfig): number[] {
  if (!audioConfig.sfxEnabled) return [];
  return audioConfig.rawSfxCues
    .map((cue) => {
      if (!cue || cue.enabled === false) return null;
      const tag = canonicalizeStudioSfxTag(String(cue.tag || "").trim());
      if (!tag) return null;
      const gainDbRaw = Number(cue.gainDb);
      const cueGainDb = Number.isFinite(gainDbRaw) ? gainDbRaw : -3;
      const gainDb = Math.max(
        -24,
        Math.min(12, audioConfig.sfxMasterGainDb + audioConfig.sfxPresetOffsetDb + STUDIO_SFX_VOLUME_TRIM_DB + cueGainDb)
      );
      return dbToLinear(gainDb);
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .slice(0, 24);
}

function estimateLoudnessIndex(params: {
  narrationGainLinear: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxGainsLinear: number[];
}): number {
  const narrationComponent = Math.max(0, params.narrationGainLinear);
  const bgmComponent = params.bgmEnabled ? Math.max(0, params.bgmVolume) * 0.85 : 0;
  const sfxAvg = params.sfxGainsLinear.length
    ? params.sfxGainsLinear.reduce((acc, value) => acc + value, 0) / params.sfxGainsLinear.length
    : 0;
  const sfxDensity = Math.min(1, params.sfxGainsLinear.length / 6);
  const sfxComponent = sfxAvg * sfxDensity * 0.55;
  return Number((narrationComponent + bgmComponent + sfxComponent).toFixed(6));
}

function toMismatchLevel(ratio: number): "low" | "medium" | "high" {
  if (ratio >= 0.3) return "high";
  if (ratio >= 0.15) return "medium";
  return "low";
}

async function fetchAsUint8Array(url: string, assetLabel: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`[ASSET_FETCH_FAILED] Failed to load ${assetLabel} (${response.status}) from ${url}`);
  }
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function normalizeClientNarrationSegment(
  segment: StudioRenderNarrationSegment | null | undefined,
  index: number
): StudioRenderNarrationSegment | null {
  const audioBase64 = String(segment?.audioBase64 || "").trim();
  if (!audioBase64) return null;
  const durationMsRaw = Number(segment?.durationMs);
  const groupIdRaw = Number(segment?.groupId);
  return {
    segmentId: String(segment?.segmentId || `segment-${index + 1}`),
    groupId: Number.isFinite(groupIdRaw) ? groupIdRaw : index,
    audioBase64,
    durationMs: Number.isFinite(durationMsRaw) ? Math.max(1, Math.floor(durationMsRaw)) : 1,
    pauseAfterMs: Number.isFinite(Number(segment?.pauseAfterMs))
      ? Math.max(0, Math.min(3000, Math.floor(Number(segment?.pauseAfterMs))))
      : 0,
    mimeType: segment?.mimeType,
    format: segment?.format,
    trimStartMs: Number.isFinite(segment?.trimStartMs) ? Math.max(0, Math.floor(Number(segment?.trimStartMs))) : undefined,
    trimEndMs: Number.isFinite(segment?.trimEndMs) ? Math.max(1, Math.floor(Number(segment?.trimEndMs))) : undefined,
  };
}

function normalizeNarrationInput(input: RenderNarrationInput): ResolvedNarrationInput {
  if (typeof input === "string") {
    return {
      mode: "singleAudio",
      fullAudio: String(input || "").trim(),
    };
  }
  if (input.mode === "segments") {
    const segments = (Array.isArray(input.segments) ? input.segments : [])
      .map(normalizeClientNarrationSegment)
      .filter((segment): segment is StudioRenderNarrationSegment => Boolean(segment));
    return {
      mode: "segments",
      segments,
      crossfadeMsByBoundary: Array.isArray(input.crossfadeMsByBoundary) ? input.crossfadeMsByBoundary : [],
    };
  }
  if (input.mode === "segmentsRef") {
    throw new Error("[UNKNOWN] narration segmentsRef is not supported in client renderer");
  }
  return {
    mode: "singleAudio",
    fullAudio: String(input.fullAudio || "").trim(),
    fullAudioMimeType: input.fullAudioMimeType,
    fullAudioFormat: input.fullAudioFormat,
  };
}

function estimateNarrationBytes(input: ResolvedNarrationInput): number {
  if (input.mode === "singleAudio") {
    return estimateBase64Bytes(input.fullAudio);
  }
  return input.segments.reduce((acc, segment) => acc + estimateBase64Bytes(segment.audioBase64), 0);
}

function resolveCrossfadeMsByBoundary(
  segments: StudioRenderNarrationSegment[],
  raw: number[] | undefined
): number[] {
  const list = Array.isArray(raw) ? raw : [];
  const safe: number[] = [];
  for (let i = 0; i < Math.max(0, segments.length - 1); i += 1) {
    const requestedRaw = Number(list[i]);
    const requestedMs = Number.isFinite(requestedRaw) ? Math.max(0, Math.floor(requestedRaw)) : 0;
    const leftMs = Math.max(1, Number(segments[i]?.durationMs) || 1);
    const rightMs = Math.max(1, Number(segments[i + 1]?.durationMs) || 1);
    const maxAllowedMs = Math.max(0, Math.min(leftMs, rightMs) - 20);
    safe.push(Math.max(0, Math.min(400, requestedMs, maxAllowedMs)));
  }
  return safe;
}

export function buildClientNarrationSegmentInputFilter(segment: StudioRenderNarrationSegment, index: number): string {
  const trimStartMsRaw = Number(segment.trimStartMs);
  const trimEndMsRaw = Number(segment.trimEndMs);
  const durationMsRaw = Number(segment.durationMs);
  const pauseAfterMsRaw = Number(segment.pauseAfterMs);
  const trimStartSec = Number.isFinite(trimStartMsRaw) ? Math.max(0, trimStartMsRaw / 1000) : 0;
  const trimEndSec = Number.isFinite(trimEndMsRaw) ? Math.max(trimStartSec + 0.001, trimEndMsRaw / 1000) : null;
  const durationSec = (Number.isFinite(durationMsRaw) ? Math.max(1, durationMsRaw) : 1) / 1000;
  const pauseAfterSec = (Number.isFinite(pauseAfterMsRaw) ? Math.max(0, Math.min(3000, pauseAfterMsRaw)) : 0) / 1000;
  const trimArgs: string[] = [];
  if (trimStartSec > 0) trimArgs.push(`start=${trimStartSec.toFixed(3)}`);
  if (trimEndSec !== null) trimArgs.push(`end=${trimEndSec.toFixed(3)}`);
  const filters: string[] = [];
  if (trimArgs.length > 0) filters.push(`atrim=${trimArgs.join(":")}`);
  if (pauseAfterSec > 0) filters.push(`apad=pad_dur=${pauseAfterSec.toFixed(3)}`);
  filters.push(`atrim=duration=${durationSec.toFixed(3)}`, "asetpts=PTS-STARTPTS");
  return `[${index}:a]${filters.join(",")}[s${index}]`;
}

async function writeNarrationTrack(
  ffmpeg: any,
  jobDir: string,
  remember: (path: string) => string,
  narrationInput: ResolvedNarrationInput
): Promise<{ narrationPath: string; narrationBytes: number }> {
  if (narrationInput.mode === "singleAudio") {
    const narrationPath = remember(
      `${jobDir}/full_audio${toNarrationExt({
        format: narrationInput.fullAudioFormat,
        mimeType: narrationInput.fullAudioMimeType,
      })}`
    );
    const fullAudio = String(narrationInput.fullAudio || "").trim();
    if (!fullAudio) {
      throw new Error("[UNKNOWN] Missing narration fullAudio");
    }
    await ffmpeg.writeFile(narrationPath, base64ToUint8Array(fullAudio));
    return {
      narrationPath,
      narrationBytes: estimateBase64Bytes(fullAudio),
    };
  }

  const segments = narrationInput.segments;
  if (!Array.isArray(segments) || segments.length <= 0) {
    throw new Error("[UNKNOWN] Missing narration segments");
  }

  const segmentPaths: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segmentPath = remember(
      `${jobDir}/narration_segment_${String(i + 1).padStart(3, "0")}${toNarrationExt({
        format: segments[i].format,
        mimeType: segments[i].mimeType,
      })}`
    );
    await ffmpeg.writeFile(segmentPath, base64ToUint8Array(segments[i].audioBase64));
    segmentPaths.push(segmentPath);
  }

  const narrationPath = remember(`${jobDir}/full_audio${segmentsToNarrationExt(segments)}`);

  const crossfadeMsByBoundary = resolveCrossfadeMsByBoundary(segments, narrationInput.crossfadeMsByBoundary);
  const hasCrossfade = crossfadeMsByBoundary.some((value) => value > 0);
  const inputArgs = segmentPaths.flatMap((path) => ["-i", path]);
  const filterParts: string[] = [];
  for (let i = 0; i < segmentPaths.length; i += 1) {
    filterParts.push(buildClientNarrationSegmentInputFilter(segments[i], i));
  }

  if (segmentPaths.length === 1) {
    filterParts.push("[s0]anull[narrout]");
    await runFfmpegExec(
      ffmpeg,
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[narrout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        narrationPath,
      ],
      "trim-narration-segment"
    );
  } else if (hasCrossfade) {
    for (let i = 0; i < segmentPaths.length - 1; i += 1) {
      const leftLabel = i === 0 ? "[s0]" : `[xf${i - 1}]`;
      const rightLabel = `[s${i + 1}]`;
      const outLabel = i === segmentPaths.length - 2 ? "[narrout]" : `[xf${i}]`;
      const durationSec = Math.max(0.001, crossfadeMsByBoundary[i] / 1000);
      filterParts.push(`${leftLabel}${rightLabel}acrossfade=d=${durationSec.toFixed(3)}:c1=tri:c2=tri${outLabel}`);
    }
    await runFfmpegExec(
      ffmpeg,
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[narrout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        narrationPath,
      ],
      "mix-narration-segments"
    );
  } else {
    const inputLabels = segmentPaths.map((_, index) => `[s${index}]`).join("");
    await runFfmpegExec(
      ffmpeg,
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        [...filterParts, `${inputLabels}concat=n=${segmentPaths.length}:v=0:a=1[narrout]`].join(";"),
        "-map",
        "[narrout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        narrationPath,
      ],
      "concat-narration-segments"
    );
  }

  return {
    narrationPath,
    narrationBytes: estimateNarrationBytes(narrationInput),
  };
}

async function withRenderMutex<T>(task: () => Promise<T>): Promise<T> {
  const previous = renderMutex;
  let release!: () => void;
  renderMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
  }
}

async function getFfmpegSingleton(): Promise<FfmpegSession> {
  if (ffmpegSingletonPromise) return ffmpegSingletonPromise;
  ffmpegSingletonPromise = (async () => {
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      try {
        ffmpeg.on("log", ({ message }: { message?: string }) => {
          if (typeof message === "string") pushFfmpegLog(message);
        });
      } catch {
        // ignore logger hook failures
      }
      return {
        ffmpeg,
        sessionId: (ffmpegSessionSeq += 1),
        renderCount: 0,
        poisoned: false,
      };
    } catch (error) {
      ffmpegSingletonPromise = null;
      throw new Error(`[LOAD_CORE_FAILED] ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
  return ffmpegSingletonPromise;
}

async function recycleFfmpegSingleton(reason: string): Promise<void> {
  if (!ffmpegSingletonPromise) return;
  try {
    const session = await ffmpegSingletonPromise;
    try {
      if (typeof session.ffmpeg?.terminate === "function") {
        session.ffmpeg.terminate();
      }
    } catch {
      // ignore terminate failures
    }
  } catch {
    // ignore pending load failures
  } finally {
    ffmpegSingletonPromise = null;
  }
  console.info(`[studio] FFmpeg session recycled (${reason})`);
}

async function runFfmpegExec(ffmpeg: any, args: string[], step: string, timeoutMs = FFMPEG_EXEC_TIMEOUT_MS): Promise<void> {
  let exitCode: number;
  try {
    exitCode = await ffmpeg.exec(args, timeoutMs);
  } catch (error) {
    throw new Error(`[FS_WRITE_FAILED] FFmpeg ${step} failed during exec: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof exitCode === "number" && exitCode !== 0) {
    if (exitCode === 1 && timeoutMs > 0) {
      throw new Error(`[TIMEOUT] FFmpeg ${step} exceeded timeout(${timeoutMs}ms)\n${getFfmpegLogTail(60)}`);
    }
    throw new Error(`[${toStepErrorCode(step)}] FFmpeg ${step} failed (exit=${exitCode})\n${getFfmpegLogTail(60)}`);
  }
}

async function ensureDir(ffmpeg: any, path: string): Promise<void> {
  try {
    await ffmpeg.createDir(path);
  } catch (error) {
    const message = String(error || "");
    if (message.toLowerCase().includes("file exists")) return;
    throw error;
  }
}

async function safeDeleteFile(ffmpeg: any, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path);
  } catch {
    // ignore cleanup failures
  }
}

async function safeDeleteDir(ffmpeg: any, path: string): Promise<void> {
  try {
    await ffmpeg.deleteDir(path);
  } catch {
    // ignore cleanup failures
  }
}

async function cleanupJobArtifacts(ffmpeg: any, jobDir: string, files: Set<string>): Promise<void> {
  const sortedFiles = Array.from(files.values()).sort((a, b) => b.length - a.length);
  for (const filePath of sortedFiles) {
    await safeDeleteFile(ffmpeg, filePath);
  }
  await safeDeleteDir(ffmpeg, jobDir);
}

async function getBgmBytesCached(path: string): Promise<Uint8Array> {
  const safePath = path.trim() || FIXED_BGM_PUBLIC_PATH;
  const cached = bgmBytesByPath.get(safePath);
  if (cached) {
    const cachedBytes = await cached;
    if (cachedBytes.byteLength > 0) return cachedBytes;
    bgmBytesByPath.delete(safePath);
  }
  const next = fetchAsUint8Array(safePath, "BGM");
  bgmBytesByPath.set(safePath, next);
  return next;
}

async function getSfxBytesCached(path: string): Promise<Uint8Array> {
  const safePath = path.trim();
  if (!safePath) {
    throw new Error("[ASSET_FETCH_FAILED] SFX path is empty");
  }
  const cached = sfxBytesByPath.get(safePath);
  const loader = cached || fetchAsUint8Array(safePath, "SFX");
  if (!cached) sfxBytesByPath.set(safePath, loader);
  try {
    const bytes = await loader;
    if (bytes.byteLength <= 0) throw new Error("[ASSET_FETCH_FAILED] SFX file is empty");
    return bytes;
  } catch (error) {
    if (sfxBytesByPath.get(safePath) === loader) sfxBytesByPath.delete(safePath);
    throw error;
  }
}

async function renderShortsVideoOnce(
  session: FfmpegSession,
  narrationInputRaw: RenderNarrationInput,
  imageSegments: string[],
  durationMs: number,
  frameDurationsSec: number[],
  onProgress: ((stage: string, percent?: number) => void) | undefined,
  audioOptions?: RenderAudioOptions
): Promise<RenderShortsVideoResult> {
  const ffmpeg = session.ffmpeg;
  const report = (stage: string, percent?: number) => onProgress?.(stage, percent);
  const frameCount = imageSegments.length;
  const narrationInput = normalizeNarrationInput(narrationInputRaw);
  const audioConfig = normalizeAudioOptions(audioOptions);
  const normalizedSfxCues = normalizeSfxCues(frameCount, frameDurationsSec, audioConfig);
  const renderMemoryLimits = resolveRenderMemoryBudgetLimits();
  const estimatedImageBytes = imageSegments.reduce((acc, segment) => acc + estimateBase64Bytes(segment), 0);
  const estimatedNarrationBytes = estimateNarrationBytes(narrationInput);
  const memoryBudgetPlan = planRenderAudioMemoryBudget({
    frameCount,
    imageBytes: estimatedImageBytes,
    narrationAudioBytes: estimatedNarrationBytes,
    bgmEnabled: audioConfig.bgmEnabled,
    sfxCueCount: normalizedSfxCues.length,
    softLimitMb: renderMemoryLimits.softLimitMb,
    hardLimitMb: renderMemoryLimits.hardLimitMb,
  });
  if (memoryBudgetPlan.blocked) {
    throw new Error(
      `[MEMORY_BUDGET_EXCEEDED] render estimate ${memoryBudgetPlan.estimatedMb.toFixed(1)}MB exceeds hard limit ${memoryBudgetPlan.hardLimitMb}MB`
    );
  }
  const effectiveBgmEnabled = memoryBudgetPlan.bgmEnabled;
  const plannedSfxCues = normalizedSfxCues.slice(0, memoryBudgetPlan.maxSfxCues);
  if (memoryBudgetPlan.degraded) {
    console.warn(
      `[studio] memory_budget_degrade level=${memoryBudgetPlan.degradeLevel} estimated_mb=${memoryBudgetPlan.estimatedMb.toFixed(1)} soft=${memoryBudgetPlan.softLimitMb} hard=${memoryBudgetPlan.hardLimitMb} expected_sfx=${normalizedSfxCues.length} applied_sfx=${plannedSfxCues.length} expected_bgm=${audioConfig.bgmEnabled ? 1 : 0} applied_bgm=${effectiveBgmEnabled ? 1 : 0}`
    );
  } else if (memoryBudgetPlan.softLimitExceeded) {
    console.warn(
      `[studio] memory_budget_soft_exceeded estimated_mb=${memoryBudgetPlan.estimatedMb.toFixed(1)} soft=${memoryBudgetPlan.softLimitMb} hard=${memoryBudgetPlan.hardLimitMb}`
    );
  }
  const expectedSfxGainsLinear = toExpectedSfxGainsLinear(audioConfig);
  const previewLoudnessIndex = estimateLoudnessIndex({
    narrationGainLinear: audioConfig.narrationGainLinear,
    bgmEnabled: audioConfig.bgmEnabled,
    bgmVolume: audioConfig.bgmVolume,
    sfxGainsLinear: expectedSfxGainsLinear,
  });
  const peakRisk = estimateAudioPeakRisk(
    {
      ...audioConfig,
      bgmEnabled: effectiveBgmEnabled,
    },
    plannedSfxCues
  );
  const maxSfxGainDb = plannedSfxCues.reduce((max, cue) => Math.max(max, cue.gainDb), -24);
  if (peakRisk === "high") {
    console.warn(
      `[studio] audio_mix_peak_risk=high preset=${audioConfig.mixPresetId} narration=${audioConfig.narrationGainLinear.toFixed(3)} bgm=${audioConfig.bgmVolume.toFixed(3)} max_sfx_db=${maxSfxGainDb.toFixed(1)}`
    );
  } else {
    console.info(
      `[studio] audio_mix_profile preset=${audioConfig.mixPresetId} risk=${peakRisk} narration=${audioConfig.narrationGainLinear.toFixed(3)} bgm=${audioConfig.bgmVolume.toFixed(3)} max_sfx_db=${maxSfxGainDb.toFixed(1)}`
    );
  }

  const requiredSfxAssets = await loadRequiredStudioSfxAssets(plannedSfxCues, getSfxBytesCached);

  const jobId = createJobId();
  const jobDir = `${JOBS_ROOT_DIR}/${jobId}`;
  const createdFiles = new Set<string>();
  const remember = (path: string): string => {
    createdFiles.add(path);
    return path;
  };

  report("Loading FFmpeg", 0);
  await ensureDir(ffmpeg, JOBS_ROOT_DIR);
  await ensureDir(ffmpeg, jobDir);

  try {
    report("Writing files", 10);
    const imagePaths: string[] = [];
    for (let i = 0; i < frameCount; i += 1) {
      const filePath = remember(`${jobDir}/image_${String(i + 1).padStart(3, "0")}.png`);
      imagePaths.push(filePath);
      await ffmpeg.writeFile(filePath, base64ToUint8Array(imageSegments[i]));
    }

    const { narrationPath } = await writeNarrationTrack(ffmpeg, jobDir, remember, narrationInput);

    let bgmFilePath: string | null = null;
    if (effectiveBgmEnabled) {
      const bgmBytes = await getBgmBytesCached(audioConfig.bgmPath);
      bgmFilePath = remember(`${jobDir}/fixed_bgm.mp3`);
      await ffmpeg.writeFile(bgmFilePath, bgmBytes.slice());
    }

    const effectiveSfxCueFiles: Array<{ filePath: string; startSec: number; gainDb: number }> = [];
    for (let i = 0; i < requiredSfxAssets.length; i += 1) {
      const cue = requiredSfxAssets[i];
      const filePath = remember(`${jobDir}/sfx_cue_${String(i + 1).padStart(3, "0")}${cue.extension}`);
      await ffmpeg.writeFile(filePath, cue.bytes.slice());
      effectiveSfxCueFiles.push({
        filePath,
        startSec: cue.startSec,
        gainDb: cue.gainDb,
      });
    }

    const concatPath = remember(`${jobDir}/concat.txt`);
    const slideshowPath = remember(`${jobDir}/slideshow.mp4`);
    const finalPath = remember(`${jobDir}/final.mp4`);

    const concatLines: string[] = [];
    for (let i = 0; i < frameCount; i += 1) {
      concatLines.push(`file '${imagePaths[i]}'`);
      concatLines.push(`duration ${frameDurationsSec[i].toFixed(6)}`);
    }
    concatLines.push(`file '${imagePaths[frameCount - 1]}'`);
    await ffmpeg.writeFile(concatPath, new TextEncoder().encode(concatLines.join("\n")));

    report("Creating slideshow", 45);
    await runFfmpegExec(
      ffmpeg,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-vf",
        "scale=1080:1920,format=yuv420p",
        "-vsync",
        "vfr",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        slideshowPath,
      ],
      "slideshow"
    );

    for (const imagePath of imagePaths) {
      await safeDeleteFile(ffmpeg, imagePath);
      createdFiles.delete(imagePath);
    }
    await safeDeleteFile(ffmpeg, concatPath);
    createdFiles.delete(concatPath);

    const hasSfxTrack = effectiveSfxCueFiles.length > 0;
    if (!bgmFilePath && !hasSfxTrack) {
      report("Muxing narration", 80);
      await runFfmpegExec(
        ffmpeg,
        [
          "-y",
          "-i",
          slideshowPath,
          "-i",
          narrationPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-t",
          (durationMs / 1000).toFixed(3),
          finalPath,
        ],
        "mux-narration"
      );
    } else {
      report("Mixing BGM/SFX", 80);
      const mixArgs: string[] = ["-i", slideshowPath, "-i", narrationPath];
      let nextInputIndex = 2;
      let bgmInputIndex: number | null = null;

      if (bgmFilePath) {
        mixArgs.push("-stream_loop", "-1", "-i", bgmFilePath);
        bgmInputIndex = nextInputIndex;
        nextInputIndex += 1;
      }

      const sfxCueInputs: Array<{ inputIndex: number; startSec: number; gainDb: number }> = [];
      for (const cueFile of effectiveSfxCueFiles) {
        mixArgs.push("-i", cueFile.filePath);
        sfxCueInputs.push({
          inputIndex: nextInputIndex,
          startSec: cueFile.startSec,
          gainDb: cueFile.gainDb,
        });
        nextInputIndex += 1;
      }

      const filterParts: string[] = [`[1:a]volume=${audioConfig.narrationGainLinear.toFixed(4)}[narr_mix]`];
      const bedLabels: string[] = [];
      if (bgmInputIndex !== null) {
        filterParts.push(`[${bgmInputIndex}:a]volume=${audioConfig.bgmVolume.toFixed(3)}[bgm0]`);
        bedLabels.push("[bgm0]");
      }

      for (let i = 0; i < sfxCueInputs.length; i += 1) {
        const cue = sfxCueInputs[i];
        const delayMs = Math.max(0, Math.round(cue.startSec * 1000));
        const label = `sfx${i}`;
        const gainLinear = Math.pow(10, cue.gainDb / 20);
        filterParts.push(`[${cue.inputIndex}:a]adelay=${delayMs}:all=1,volume=${gainLinear.toFixed(5)}[${label}]`);
        bedLabels.push(`[${label}]`);
      }

      if (bedLabels.length === 1) {
        filterParts.push(`${bedLabels[0]}anull[bedraw]`);
      } else {
        filterParts.push(
          `${bedLabels.join("")}amix=inputs=${bedLabels.length}:duration=longest:dropout_transition=0:normalize=0[bedraw]`
        );
      }
      filterParts.push("[narr_mix][bedraw]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mix]");

      mixArgs.push(
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[mix]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-t",
        (durationMs / 1000).toFixed(3),
        finalPath
      );
      await runFfmpegExec(ffmpeg, ["-y", ...mixArgs], "mix-bgm-sfx");
    }

    let out: Uint8Array | ArrayBuffer;
    try {
      out = await ffmpeg.readFile(finalPath);
    } catch (error) {
      throw new Error(
        `[READ_OUTPUT_FAILED] FFmpeg finished without output(${finalPath}): ${error instanceof Error ? error.message : String(error)}\n${getFfmpegLogTail(60)}`
      );
    }

    const bytes = out instanceof Uint8Array ? out : new Uint8Array(out as unknown as ArrayBuffer);
    const copied = new Uint8Array(bytes.byteLength);
    copied.set(bytes);
    const finalSfxGainsLinear = effectiveSfxCueFiles.map((cue) => dbToLinear(cue.gainDb));
    const finalLoudnessIndex = estimateLoudnessIndex({
      narrationGainLinear: audioConfig.narrationGainLinear,
      bgmEnabled: effectiveBgmEnabled && Boolean(bgmFilePath),
      bgmVolume: audioConfig.bgmVolume,
      sfxGainsLinear: finalSfxGainsLinear,
    });
    const loudnessMismatchDelta = Number(Math.abs(finalLoudnessIndex - previewLoudnessIndex).toFixed(6));
    const loudnessMismatchRatio = Number(
      (loudnessMismatchDelta / Math.max(0.001, previewLoudnessIndex)).toFixed(6)
    );
    const loudnessMismatchLevel = toMismatchLevel(loudnessMismatchRatio);
    if (loudnessMismatchLevel !== "low") {
      console.warn(
        `[studio] audio_loudness_mismatch level=${loudnessMismatchLevel} ratio=${loudnessMismatchRatio.toFixed(3)} preview=${previewLoudnessIndex.toFixed(3)} final=${finalLoudnessIndex.toFixed(3)} expected_sfx=${expectedSfxGainsLinear.length} effective_sfx=${effectiveSfxCueFiles.length}`
      );
    } else {
      console.info(
        `[studio] audio_loudness_mismatch level=${loudnessMismatchLevel} ratio=${loudnessMismatchRatio.toFixed(3)} preview=${previewLoudnessIndex.toFixed(3)} final=${finalLoudnessIndex.toFixed(3)} expected_sfx=${expectedSfxGainsLinear.length} effective_sfx=${effectiveSfxCueFiles.length}`
      );
    }
    report("Done", 100);
    return {
      blob: new Blob([copied], { type: "video/mp4" }),
      audioDiagnostics: {
        mixPresetId: audioConfig.mixPresetId,
        peakRisk,
        previewLoudnessIndex,
        finalLoudnessIndex,
        loudnessMismatchRatio,
        loudnessMismatchDelta,
        loudnessMismatchLevel,
        expectedSfxCues: normalizedSfxCues.length,
        effectiveSfxCues: effectiveSfxCueFiles.length,
        expectedBgmEnabled: audioConfig.bgmEnabled,
        effectiveBgmEnabled: effectiveBgmEnabled && Boolean(bgmFilePath),
      },
      memoryBudget: {
        softLimitMb: memoryBudgetPlan.softLimitMb,
        hardLimitMb: memoryBudgetPlan.hardLimitMb,
        estimatedMb: memoryBudgetPlan.estimatedMb,
        degradeLevel: memoryBudgetPlan.degradeLevel,
        degraded: memoryBudgetPlan.degraded,
        blocked: memoryBudgetPlan.blocked,
        softLimitExceeded: memoryBudgetPlan.softLimitExceeded,
        expectedSfxCues: normalizedSfxCues.length,
        maxSfxCues: memoryBudgetPlan.maxSfxCues,
        expectedBgmEnabled: audioConfig.bgmEnabled,
        effectiveBgmEnabled: effectiveBgmEnabled && Boolean(bgmFilePath),
        inputImageMb: Number((estimatedImageBytes / (1024 * 1024)).toFixed(2)),
        inputNarrationMb: Number((estimatedNarrationBytes / (1024 * 1024)).toFixed(2)),
      },
    };
  } finally {
    await cleanupJobArtifacts(ffmpeg, jobDir, createdFiles);
  }
}

export async function renderShortsVideo(
  narrationInput: RenderNarrationInput,
  imageSegments: string[],
  durationMs: number,
  frameDurationsSec: number[],
  onProgress?: RenderProgress,
  audioOptions?: RenderAudioOptions
): Promise<RenderShortsVideoResult> {
  const normalizedNarration = normalizeNarrationInput(narrationInput);
  const hasNarration =
    normalizedNarration.mode === "singleAudio"
      ? String(normalizedNarration.fullAudio || "").trim().length > 0
      : normalizedNarration.segments.length > 0;
  if (!imageSegments.length || !hasNarration) {
    throw new Error("[UNKNOWN] Missing frames or narration");
  }
  if (frameDurationsSec.length !== imageSegments.length) {
    throw new Error("[UNKNOWN] frameDurationsSec length mismatch");
  }

  return withRenderMutex(async () => {
    let lastFailure: Error | null = null;
    for (let attempt = 0; attempt <= FFMPEG_RENDER_RETRY_LIMIT; attempt += 1) {
      try {
        const session = await getFfmpegSingleton();
        const result = await renderShortsVideoOnce(
          session,
          normalizedNarration,
          imageSegments,
          durationMs,
          frameDurationsSec,
          onProgress,
          audioOptions
        );
        session.renderCount += 1;
        if (session.renderCount >= FFMPEG_MAX_RENDERS_PER_SESSION) {
          await recycleFfmpegSingleton(`periodic-${session.sessionId}`);
        }
        return result;
      } catch (error) {
        const classified = classifyRenderError(error);
        lastFailure = new Error(`[${classified.code}] ${classified.message}`);
        const shouldRetry = classified.retryable && attempt < FFMPEG_RENDER_RETRY_LIMIT;
        if (shouldRecycleFfmpegSession(classified.code) || shouldRetry) {
          await recycleFfmpegSingleton(`error-${classified.code}`);
        }
        if (!shouldRetry) {
          throw lastFailure;
        }
      }
    }
    throw lastFailure || new Error("[UNKNOWN] FFmpeg render failed");
  });
}
