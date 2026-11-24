import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getStudioAudioMixPreset } from "@/lib/studio/audio-mix-presets";
import { STUDIO_BGM_VOLUME_BOOST, STUDIO_SFX_VOLUME_TRIM_DB } from "@/lib/studio/audio-mix-constants";
import { canonicalizeStudioSfxTag } from "@/lib/studio/audio-options";
import { renderRemotionSlideshowVideo } from "@/lib/studio/render-remotion-server";
import { planRenderAudioMemoryBudget, resolveRenderMemoryBudgetLimits } from "@/lib/studio/render-memory-budget";
import { loadRequiredStudioSfxAssets } from "@/lib/studio/required-sfx-asset";
import { selectDeterministicSfxFile } from "@/lib/studio/sfx-deterministic";
import type { StudioNativeRenderRequest, StudioRenderNarrationInput, StudioRenderNarrationSegment } from "@/types/studio-renderer";

const execFile = promisify(execFileCallback);
const FFMPEG_TIMEOUT_MS = 240_000;
const ESTIMATED_BGM_BYTES = 12 * 1024 * 1024;
const ASSET_BINARY_CACHE_LIMIT = 32;
const FFMPEG_RESOLVE_TIMEOUT_MS = 5_000;
const FFMPEG_ENV_KEYS = ["STUDIO_FFMPEG_PATH", "FFMPEG_PATH"] as const;

type NormalizedAudioOptions = {
  playbackRate: number;
  bgmEnabled: boolean;
  bgmPath: string;
  bgmVolume: number;
  mixPresetId: string;
  narrationGainLinear: number;
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
  rawSfxCues: NonNullable<StudioNativeRenderRequest["audioOptions"]>["sfxCues"];
  rawSfxCatalog: NonNullable<StudioNativeRenderRequest["audioOptions"]>["sfxCatalog"];
};

type NormalizedSfxCue = {
  path: string;
  startSec: number;
  gainDb: number;
};

type StudioNativeRenderInternalResponse =
  | {
      ok: true;
      renderer: "server_native";
      videoPath: string;
      workDir: string;
      videoSizeBytes: number;
      audioDiagnostics: {
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
      usage: {
        renderMs: number;
      };
    }
  | {
      ok: false;
      renderer: "server_native";
      error: string;
      errorCode: string;
      retryable: boolean;
    };

type ResolvedNarrationInput = Exclude<StudioRenderNarrationInput, { mode: "segmentsRef" }>;
type SupportedNarrationExt = ".mp3" | ".wav" | ".ogg";

function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(String(base64 || "").trim(), "base64");
}

function estimateBase64Bytes(base64: string): number {
  const compact = String(base64 || "").trim();
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function toFrameStartsSec(frameDurationsSec: number[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const sec of frameDurationsSec) {
    starts.push(cursor);
    cursor += Math.max(0, Number(sec) || 0);
  }
  return starts;
}

export function resolveServerNativeBgmRequest(
  options: StudioNativeRenderRequest["audioOptions"]
): { bgmEnabled: boolean; bgmPath: string } {
  const bgmPath = String(options?.bgmPath || "").trim();
  const hasExplicitBgmSetting = typeof options?.bgmEnabled === "boolean" || Boolean(bgmPath);
  return {
    bgmEnabled: hasExplicitBgmSetting ? options?.bgmEnabled !== false : false,
    bgmPath,
  };
}

function normalizeAudioOptions(request: StudioNativeRenderRequest): NormalizedAudioOptions {
  const options = request.audioOptions;
  const bgm = resolveServerNativeBgmRequest(options);
  const mixPreset = getStudioAudioMixPreset(options?.mixPresetId);
  const playbackRateRaw = Number(options?.playbackRate);
  const playbackRate = Number.isFinite(playbackRateRaw) ? Math.max(0.5, Math.min(3, playbackRateRaw)) : 1;
  const baseBgmVolume = Number.isFinite(options?.bgmVolume)
    ? Number(options?.bgmVolume)
    : mixPreset.bgmVolume;
  const boostedBgmVolume = Math.max(0, Math.min(1, baseBgmVolume * STUDIO_BGM_VOLUME_BOOST));
  return {
    playbackRate,
    bgmEnabled: bgm.bgmEnabled,
    bgmPath: bgm.bgmPath,
    bgmVolume: boostedBgmVolume,
    mixPresetId: mixPreset.id,
    narrationGainLinear: Math.max(0.1, Math.min(2, Math.pow(10, mixPreset.narrationGainDb / 20))),
    sfxEnabled: options?.sfxEnabled !== false,
    sfxMasterGainDb: Number.isFinite(options?.sfxMasterGainDb) ? Math.max(-24, Math.min(12, Number(options?.sfxMasterGainDb))) : 2,
    sfxPresetOffsetDb: Math.max(-12, Math.min(12, mixPreset.sfxGainOffsetDb)),
    ducking: {
      enabled: false,
      threshold: Math.max(0.001, Math.min(1, mixPreset.ducking.threshold)),
      ratio: Math.max(1, Math.min(20, mixPreset.ducking.ratio)),
      attackMs: Math.max(1, Math.min(2000, Math.round(mixPreset.ducking.attackMs))),
      releaseMs: Math.max(10, Math.min(4000, Math.round(mixPreset.ducking.releaseMs))),
    },
    rawSfxCues: Array.isArray(options?.sfxCues) ? options.sfxCues : [],
    rawSfxCatalog: Array.isArray(options?.sfxCatalog) ? options.sfxCatalog : [],
  };
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

function buildAtempoFilter(playbackRate: number): string {
  const safeRate = Math.max(0.5, Math.min(3, playbackRate));
  const filters: string[] = [];
  let remaining = safeRate;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

function toSfxFilesByTag(
  rawSfxCatalog: NonNullable<StudioNativeRenderRequest["audioOptions"]>["sfxCatalog"]
): Map<string, Array<{ path: string; defaultGainDb: number }>> {
  const byTag = new Map<string, Array<{ path: string; defaultGainDb: number }>>();
  for (const category of rawSfxCatalog || []) {
    const categoryId = canonicalizeStudioSfxTag(String(category?.id || "").trim());
    if (!categoryId || !Array.isArray(category.files)) continue;
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
      .filter((item): item is { fileId: string; path: string; defaultGainDb: number } => Boolean(item));
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

function normalizeSfxCues(request: StudioNativeRenderRequest, audioConfig: NormalizedAudioOptions): NormalizedSfxCue[] {
  if (!audioConfig.sfxEnabled) return [];
  const sfxFilesByTag = toSfxFilesByTag(audioConfig.rawSfxCatalog);
  const frameStartsSec = toFrameStartsSec(request.frameDurationsSec);
  return (audioConfig.rawSfxCues || [])
    .map((cue) => {
      if (!cue || cue.enabled === false) return null;
      const tag = canonicalizeStudioSfxTag(String(cue.tag || "").trim());
      if (!tag) return null;
      const files = sfxFilesByTag.get(tag);
      if (!files || files.length <= 0) return null;
      const startMsRaw = Number(cue.startMs);
      const hasStartMs = Number.isFinite(startMsRaw);
      const frameIndexRaw = Number(cue.frameIndex);
      const frameIndex = Number.isFinite(frameIndexRaw) ? Math.max(0, Math.floor(frameIndexRaw)) : -1;
      if (!hasStartMs && (frameIndex < 0 || frameIndex >= request.frameDurationsSec.length)) return null;
      const offsetMsRaw = Number(cue.offsetMs);
      const offsetMs = Number.isFinite(offsetMsRaw) ? Math.max(-1200, Math.min(1200, Math.floor(offsetMsRaw))) : 0;
      const gainDbRaw = Number(cue.gainDb);
      const picked = selectDeterministicSfxFile(files, {
        cueId: cue.cueId,
        tag,
        frameIndex: frameIndex >= 0 ? frameIndex : undefined,
        startMs: hasStartMs ? startMsRaw : undefined,
        offsetMs,
        gainDb: Number.isFinite(gainDbRaw) ? gainDbRaw : undefined,
      });
      const gainDb = Math.max(
        -24,
        Math.min(
          12,
          audioConfig.sfxMasterGainDb +
            audioConfig.sfxPresetOffsetDb +
            STUDIO_SFX_VOLUME_TRIM_DB +
            (Number.isFinite(gainDbRaw) ? gainDbRaw : picked.defaultGainDb)
        )
      );
      const startSec = hasStartMs
        ? Math.max(0, startMsRaw / 1000)
        : Math.max(0, (frameStartsSec[frameIndex] || 0) + offsetMs / 1000);
      return {
        path: picked.path,
        startSec,
        gainDb,
      };
    })
    .filter((cue): cue is NormalizedSfxCue => Boolean(cue))
    .slice(0, 40);
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

function toPeakRisk(audioConfig: NormalizedAudioOptions, sfxCues: NormalizedSfxCue[]): "low" | "medium" | "high" {
  const maxSfxGainDb = sfxCues.reduce((max, cue) => Math.max(max, cue.gainDb), -24);
  let score = 0;
  if (audioConfig.narrationGainLinear > 1.2) score += 1;
  if (audioConfig.bgmEnabled && audioConfig.bgmVolume > 0.32) score += 1;
  if (maxSfxGainDb > 4) score += 1;
  if (!audioConfig.ducking.enabled && audioConfig.bgmEnabled) score += 1;
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

async function assertFfmpegAvailable(): Promise<void> {
  ffmpegAvailabilityPromise ||= getFfmpegExecutablePath().then(() => undefined).catch((error) => {
    ffmpegAvailabilityPromise = null;
    throw new Error(`SERVER_FFMPEG_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`);
  });
  await ffmpegAvailabilityPromise;
}

let ffmpegAvailabilityPromise: Promise<void> | null = null;
let ffmpegExecutablePathPromise: Promise<string> | null = null;
const binaryAssetCache = new Map<string, Promise<Buffer>>();

async function verifyFfmpegExecutable(candidate: string): Promise<string> {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) {
    throw new Error("empty candidate");
  }
  await execFile(trimmed, ["-version"], { timeout: FFMPEG_RESOLVE_TIMEOUT_MS });
  return trimmed;
}

async function getBundledFfmpegExecutablePath(): Promise<string> {
  const { RenderInternals } = await import("@remotion/renderer");
  return RenderInternals.getExecutablePath({
    type: "ffmpeg",
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
  });
}

async function getFfmpegExecutablePath(): Promise<string> {
  ffmpegExecutablePathPromise ||= (async () => {
    const candidates: string[] = [];
    for (const key of FFMPEG_ENV_KEYS) {
      const value = String(process.env[key] || "").trim();
      if (value) {
        candidates.push(value);
      }
    }
    try {
      candidates.push(await getBundledFfmpegExecutablePath());
    } catch {
      // Ignore and fall back to PATH lookup below.
    }
    candidates.push("ffmpeg");

    const seen = new Set<string>();
    const failures: string[] = [];
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        return await verifyFfmpegExecutable(candidate);
      } catch (error) {
        failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    ffmpegExecutablePathPromise = null;
    throw new Error(failures.join(" | "));
  })();

  try {
    return await ffmpegExecutablePathPromise;
  } catch (error) {
    ffmpegExecutablePathPromise = null;
    throw error;
  }
}

function toAssetUrl(pathOrUrl: string, baseUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) {
    throw new Error("ASSET_FETCH_FAILED: empty path");
  }
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : new URL(raw.startsWith("/") ? raw : `/${raw}`, baseUrl).toString();
}

function rememberBinaryAsset(url: string, loader: Promise<Buffer>): Promise<Buffer> {
  if (!binaryAssetCache.has(url) && binaryAssetCache.size >= ASSET_BINARY_CACHE_LIMIT) {
    const oldestKey = binaryAssetCache.keys().next().value;
    if (typeof oldestKey === "string") {
      binaryAssetCache.delete(oldestKey);
    }
  }
  binaryAssetCache.set(url, loader);
  return loader;
}

export async function fetchStudioBinaryAsset(pathOrUrl: string, baseUrl: string): Promise<Buffer> {
  const url = toAssetUrl(pathOrUrl, baseUrl);
  const cached = binaryAssetCache.get(url);
  const loader =
    cached ||
    rememberBinaryAsset(
      url,
      (async () => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`ASSET_FETCH_FAILED: ${response.status} ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      })()
    );
  try {
    const buffer = await loader;
    if (buffer.length <= 0) {
      throw new Error(`ASSET_FETCH_EMPTY: ${url}`);
    }
    return Buffer.from(buffer);
  } catch (error) {
    if (binaryAssetCache.get(url) === loader) {
      binaryAssetCache.delete(url);
    }
    throw error;
  }
}

export async function loadRequiredStudioBgmAsset(
  pathOrUrl: string,
  baseUrl: string,
  loader: (pathOrUrl: string, baseUrl: string) => Promise<Buffer> = fetchStudioBinaryAsset
): Promise<Buffer> {
  const normalizedPath = String(pathOrUrl || "").trim();
  if (!normalizedPath) {
    throw new Error("BGM_ASSET_UNAVAILABLE: BGM 경로가 비어 있습니다.");
  }
  try {
    const bytes = await loader(normalizedPath, baseUrl);
    if (bytes.length <= 0) {
      throw new Error("빈 파일입니다.");
    }
    return bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("BGM_ASSET_UNAVAILABLE:")) throw error;
    throw new Error(`BGM_ASSET_UNAVAILABLE: BGM 파일을 불러올 수 없습니다. (${normalizedPath}; ${message})`);
  }
}

export function classifyServerNativeRenderFailure(message: string): { errorCode: string; retryable: boolean } {
  const upper = String(message || "").toUpperCase();
  if (upper.includes("MEMORY_BUDGET_EXCEEDED") || upper.includes("MEMORY BUDGET")) {
    return { errorCode: "MEMORY_BUDGET_EXCEEDED", retryable: false };
  }
  if (upper.includes("BGM_ASSET_UNAVAILABLE")) {
    return { errorCode: "BGM_ASSET_UNAVAILABLE", retryable: false };
  }
  if (upper.includes("SFX_ASSET_UNAVAILABLE")) {
    return { errorCode: "SFX_ASSET_UNAVAILABLE", retryable: false };
  }
  if (upper.includes("SERVER_FFMPEG_UNAVAILABLE")) {
    return { errorCode: "SERVER_FFMPEG_UNAVAILABLE", retryable: false };
  }
  if (upper.includes("TIMEOUT")) {
    return { errorCode: "TIMEOUT", retryable: true };
  }
  return { errorCode: "SERVER_NATIVE_RENDER_FAILED", retryable: false };
}

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    const ffmpegExecutablePath = await getFfmpegExecutablePath();
    await execFile(ffmpegExecutablePath, ["-y", ...args], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`FFMPEG_EXEC_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function normalizeServerNarrationSegment(
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

function normalizeNarrationInput(request: StudioNativeRenderRequest): ResolvedNarrationInput {
  if (request.narration?.mode === "segments") {
    const segments = (Array.isArray(request.narration.segments) ? request.narration.segments : [])
      .map(normalizeServerNarrationSegment)
      .filter((segment): segment is StudioRenderNarrationSegment => Boolean(segment));
    if (segments.length > 0) {
      return {
        mode: "segments",
        segments,
        crossfadeMsByBoundary: Array.isArray(request.narration.crossfadeMsByBoundary) ? request.narration.crossfadeMsByBoundary : [],
      };
    }
  }
  const fullAudio =
    request.narration?.mode === "singleAudio"
      ? String(request.narration.fullAudio || "").trim()
      : String(request.fullAudio || "").trim();
  return {
    mode: "singleAudio",
    fullAudio,
    fullAudioMimeType: request.narration?.mode === "singleAudio" ? request.narration.fullAudioMimeType : undefined,
    fullAudioFormat: request.narration?.mode === "singleAudio" ? request.narration.fullAudioFormat : undefined,
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

export function buildServerNarrationSegmentInputFilter(segment: StudioRenderNarrationSegment, index: number): string {
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

async function applyNarrationPlaybackRate(sourcePath: string, outputPath: string, playbackRate: number): Promise<void> {
  if (Math.abs(playbackRate - 1) < 0.001) {
    if (sourcePath !== outputPath) {
      await writeFile(outputPath, await readFile(sourcePath));
    }
    return;
  }
  await runFfmpeg([
    "-i",
    sourcePath,
    "-filter:a",
    buildAtempoFilter(playbackRate),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    outputPath,
  ]);
}

async function writeNarrationTrack(
  workDir: string,
  narrationPath: string,
  narration: ResolvedNarrationInput,
  playbackRate: number
): Promise<void> {
  const baseNarrationExt =
    narration.mode === "singleAudio"
      ? toNarrationExt({
          format: narration.fullAudioFormat,
          mimeType: narration.fullAudioMimeType,
        })
      : segmentsToNarrationExt(narration.segments);
  const baseNarrationPath = join(workDir, `full_audio_base${baseNarrationExt}`);
  if (narration.mode === "singleAudio") {
    await writeFile(baseNarrationPath, base64ToBuffer(narration.fullAudio));
    await applyNarrationPlaybackRate(baseNarrationPath, narrationPath, playbackRate);
    return;
  }
  const segments = narration.segments;
  if (!Array.isArray(segments) || segments.length <= 0) {
    throw new Error("NARRATION_SEGMENTS_EMPTY");
  }

  const segmentPaths: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segmentPath = join(
      workDir,
      `narration_segment_${String(i + 1).padStart(3, "0")}${toNarrationExt({
        format: segments[i].format,
        mimeType: segments[i].mimeType,
      })}`
    );
    await writeFile(segmentPath, base64ToBuffer(segments[i].audioBase64));
    segmentPaths.push(segmentPath);
  }

  const crossfadeMsByBoundary = resolveCrossfadeMsByBoundary(segments, narration.crossfadeMsByBoundary);
  const hasCrossfade = crossfadeMsByBoundary.some((value) => value > 0);
  const inputArgs = segmentPaths.flatMap((path) => ["-i", path]);
  const filterParts: string[] = [];
  for (let i = 0; i < segmentPaths.length; i += 1) {
    filterParts.push(buildServerNarrationSegmentInputFilter(segments[i], i));
  }

  if (segmentPaths.length === 1) {
    filterParts.push("[s0]anull[narrout]");
    await runFfmpeg([
      ...inputArgs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[narrout]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      baseNarrationPath,
    ]);
    await applyNarrationPlaybackRate(baseNarrationPath, narrationPath, playbackRate);
    return;
  }

  if (hasCrossfade) {
    for (let i = 0; i < segmentPaths.length - 1; i += 1) {
      const leftLabel = i === 0 ? "[s0]" : `[xf${i - 1}]`;
      const rightLabel = `[s${i + 1}]`;
      const outLabel = i === segmentPaths.length - 2 ? "[narrout]" : `[xf${i}]`;
      const durationSec = Math.max(0.001, crossfadeMsByBoundary[i] / 1000);
      filterParts.push(`${leftLabel}${rightLabel}acrossfade=d=${durationSec.toFixed(3)}:c1=tri:c2=tri${outLabel}`);
    }
    await runFfmpeg([
      ...inputArgs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[narrout]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      baseNarrationPath,
    ]);
    await applyNarrationPlaybackRate(baseNarrationPath, narrationPath, playbackRate);
    return;
  }

  const inputLabels = segmentPaths.map((_, index) => `[s${index}]`).join("");
  await runFfmpeg([
    ...inputArgs,
    "-filter_complex",
    [...filterParts, `${inputLabels}concat=n=${segmentPaths.length}:v=0:a=1[narrout]`].join(";"),
    "-map",
    "[narrout]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    baseNarrationPath,
  ]);
  await applyNarrationPlaybackRate(baseNarrationPath, narrationPath, playbackRate);
}

export async function renderVideoWithServerNative(
  request: StudioNativeRenderRequest,
  context: { baseUrl: string }
): Promise<StudioNativeRenderInternalResponse> {
  const startedAt = Date.now();
  await assertFfmpegAvailable();
  const narrationInput = normalizeNarrationInput(request);
  const audioConfig = normalizeAudioOptions(request);
  const normalizedSfxCues = normalizeSfxCues(request, audioConfig);
  const frameCount = Math.max(request.frameDurationsSec.length, request.visuals.slides.length);
  // Native FFmpeg receives the already encoded slideshow; Remotion owns the visual asset working set separately.
  const inputImageBytes = 0;
  const inputNarrationBytes = estimateNarrationBytes(narrationInput);
  const limits = resolveRenderMemoryBudgetLimits();
  const memoryPlan = planRenderAudioMemoryBudget({
    frameCount,
    imageBytes: inputImageBytes,
    narrationAudioBytes: inputNarrationBytes,
    bgmEnabled: audioConfig.bgmEnabled,
    sfxCueCount: normalizedSfxCues.length,
    softLimitMb: limits.softLimitMb,
    hardLimitMb: limits.hardLimitMb,
  });
  if (memoryPlan.blocked) {
    return {
      ok: false,
      renderer: "server_native",
      error: `memory budget exceeded (${memoryPlan.estimatedMb.toFixed(1)}MB > ${memoryPlan.hardLimitMb}MB)`,
      errorCode: "MEMORY_BUDGET_EXCEEDED",
      retryable: false,
    };
  }

  const effectiveBgmEnabled = memoryPlan.bgmEnabled;
  const effectiveSfxCues = normalizedSfxCues.slice(0, memoryPlan.maxSfxCues);
  const previewSfxGains = normalizedSfxCues.map((cue) => Math.pow(10, cue.gainDb / 20));
  const finalSfxGains = effectiveSfxCues.map((cue) => Math.pow(10, cue.gainDb / 20));
  const previewLoudnessIndex = estimateLoudnessIndex({
    narrationGainLinear: audioConfig.narrationGainLinear,
    bgmEnabled: audioConfig.bgmEnabled,
    bgmVolume: audioConfig.bgmVolume,
    sfxGainsLinear: previewSfxGains,
  });
  const finalLoudnessIndex = estimateLoudnessIndex({
    narrationGainLinear: audioConfig.narrationGainLinear,
    bgmEnabled: effectiveBgmEnabled,
    bgmVolume: audioConfig.bgmVolume,
    sfxGainsLinear: finalSfxGains,
  });
  const mismatchDelta = Number(Math.abs(finalLoudnessIndex - previewLoudnessIndex).toFixed(6));
  const mismatchRatio = Number((mismatchDelta / Math.max(0.001, previewLoudnessIndex)).toFixed(6));
  const mismatchLevel: "low" | "medium" | "high" = mismatchRatio >= 0.3 ? "high" : mismatchRatio >= 0.15 ? "medium" : "low";

  const workDir = await mkdtemp(join(tmpdir(), "studio-native-render-"));
  let keepWorkDir = false;
  try {
    const [requiredBgmBytes, requiredSfxAssets] = await Promise.all([
      effectiveBgmEnabled
        ? loadRequiredStudioBgmAsset(audioConfig.bgmPath, context.baseUrl)
        : Promise.resolve<Buffer | null>(null),
      loadRequiredStudioSfxAssets(effectiveSfxCues, (path) => fetchStudioBinaryAsset(path, context.baseUrl)),
    ]);
    const narrationPath = join(workDir, "full_audio.mp3");
    const slideshowPath = join(workDir, "slideshow.mp4");
    const finalPath = join(workDir, "final.mp4");
    await writeNarrationTrack(workDir, narrationPath, narrationInput, audioConfig.playbackRate);
    await renderRemotionSlideshowVideo(request, slideshowPath, context);

    const resolvedBgmPath = requiredBgmBytes
      ? await (async () => {
          const nextBgmPath = join(workDir, "bgm.mp3");
          await writeFile(nextBgmPath, requiredBgmBytes);
          return nextBgmPath;
        })()
      : null;
    const sfxInputPaths = await Promise.all(
      requiredSfxAssets.map(async (cue, index) => {
        const path = join(workDir, `sfx_${String(index + 1).padStart(3, "0")}${cue.extension}`);
        await writeFile(path, cue.bytes);
        return {
          path,
          startSec: cue.startSec,
          gainDb: cue.gainDb,
        };
      })
    );
    const bgmPath = resolvedBgmPath;

    if (!bgmPath && sfxInputPaths.length <= 0) {
      await runFfmpeg([
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
        "-movflags",
        "+faststart",
        "-t",
        (request.durationMs / 1000).toFixed(3),
        finalPath,
      ]);
    } else {
      const args: string[] = ["-i", slideshowPath, "-i", narrationPath];
      let nextInputIndex = 2;
      let bgmInputIndex: number | null = null;
      if (bgmPath) {
        args.push("-stream_loop", "-1", "-i", bgmPath);
        bgmInputIndex = nextInputIndex;
        nextInputIndex += 1;
      }
      const sfxInputIndexes: Array<{ inputIndex: number; startSec: number; gainDb: number }> = [];
      for (const cue of sfxInputPaths) {
        args.push("-i", cue.path);
        sfxInputIndexes.push({
          inputIndex: nextInputIndex,
          startSec: cue.startSec,
          gainDb: cue.gainDb,
        });
        nextInputIndex += 1;
      }
      const filterParts: string[] = [`[1:a]volume=${audioConfig.narrationGainLinear.toFixed(4)}[narr_mix]`];
      const bedLabels: string[] = [];
      if (bgmInputIndex !== null) {
        filterParts.push(`[${bgmInputIndex}:a]volume=${audioConfig.bgmVolume.toFixed(3)}[bgm0]`);
        bedLabels.push("[bgm0]");
      }
      for (let i = 0; i < sfxInputIndexes.length; i += 1) {
        const cue = sfxInputIndexes[i];
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
      args.push(
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
        "-movflags",
        "+faststart",
        "-t",
        (request.durationMs / 1000).toFixed(3),
        finalPath
      );
      await runFfmpeg(args);
    }

    const outputStats = await stat(finalPath);
    keepWorkDir = true;
    return {
      ok: true,
      renderer: "server_native",
      videoPath: finalPath,
      workDir,
      videoSizeBytes: outputStats.size,
      audioDiagnostics: {
        mixPresetId: audioConfig.mixPresetId,
        peakRisk: toPeakRisk(
          {
            ...audioConfig,
            bgmEnabled: effectiveBgmEnabled,
          },
          effectiveSfxCues
        ),
        previewLoudnessIndex,
        finalLoudnessIndex,
        loudnessMismatchRatio: mismatchRatio,
        loudnessMismatchDelta: mismatchDelta,
        loudnessMismatchLevel: mismatchLevel,
        expectedSfxCues: normalizedSfxCues.length,
        effectiveSfxCues: sfxInputPaths.length,
        expectedBgmEnabled: audioConfig.bgmEnabled,
        effectiveBgmEnabled: Boolean(bgmPath),
      },
      memoryBudget: {
        softLimitMb: memoryPlan.softLimitMb,
        hardLimitMb: memoryPlan.hardLimitMb,
        estimatedMb: memoryPlan.estimatedMb,
        degradeLevel: memoryPlan.degradeLevel,
        degraded: memoryPlan.degraded,
        blocked: memoryPlan.blocked,
        softLimitExceeded: memoryPlan.softLimitExceeded,
        expectedSfxCues: normalizedSfxCues.length,
        maxSfxCues: memoryPlan.maxSfxCues,
        expectedBgmEnabled: audioConfig.bgmEnabled,
        effectiveBgmEnabled: Boolean(bgmPath),
        inputImageMb: Number((inputImageBytes / (1024 * 1024)).toFixed(2)),
        inputNarrationMb: Number((inputNarrationBytes / (1024 * 1024)).toFixed(2)),
      },
      usage: {
        renderMs: Math.max(0, Date.now() - startedAt),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = classifyServerNativeRenderFailure(message);
    return {
      ok: false,
      renderer: "server_native",
      error: message,
      errorCode: failure.errorCode,
      retryable: failure.retryable,
    };
  } finally {
    if (!keepWorkDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
