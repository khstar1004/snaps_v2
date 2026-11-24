import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { createVideoAsset, setVideoAssetStudioSnapshot } from "@/lib/publish/publish-store";
import { normalizeCategory } from "@/lib/publish/categories";
import { buildShortsStorageObjectKey } from "@/lib/storage/object-key";
import { deleteAppCacheEntry, getAppCacheEntry, setAppCacheEntry } from "@/lib/supabase/app-cache";
import { uploadSupabaseStorageStream } from "@/lib/supabase/storage";
import { isStudioInvalidInput } from "@/lib/studio/error-response";
import { completeStudioAssetSnapshot } from "@/lib/studio/asset-snapshot";
import { loadStudioNarrationInput } from "@/lib/studio/narration-cache";
import { renderVideoWithServerNative } from "@/lib/studio/render-native-server";
import type {
  StudioNativeRenderRequest,
  StudioRenderJobRecord,
  StudioRenderJobStatus,
} from "@/types/studio-renderer";

const STUDIO_RENDER_JOB_SCOPE = "studio_render_job";
const STUDIO_RENDER_JOB_FINGERPRINT_SCOPE = "studio_render_job_fingerprint";
const STUDIO_RENDER_JOB_TTL_SEC = 3 * 24 * 60 * 60;
const STUDIO_RENDER_JOB_QUEUED_STALE_MS = 5 * 60 * 1000;
const STUDIO_RENDER_JOB_PROCESSING_STALE_MS = 30 * 60 * 1000;

type CreateOrReuseStudioRenderJobResult = {
  job: StudioRenderJobRecord;
  reused: boolean;
  shouldStart: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isStudioRenderJobStatus(value: unknown): value is StudioRenderJobStatus {
  return value === "queued" || value === "processing" || value === "completed" || value === "failed";
}

function updateHashWithValue(hash: ReturnType<typeof createHash>, value: unknown): void {
  if (value === null) {
    hash.update("null|");
    return;
  }
  if (value === undefined) {
    hash.update("undefined|");
    return;
  }
  if (typeof value === "string") {
    hash.update(`string:${value.length}:`);
    hash.update(value);
    hash.update("|");
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    hash.update(`${typeof value}:${String(value)}|`);
    return;
  }
  if (Array.isArray(value)) {
    hash.update(`array:${value.length}[`);
    for (const item of value) {
      updateHashWithValue(hash, item);
    }
    hash.update("]|");
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    hash.update("object:{");
    for (const [key, entryValue] of entries) {
      hash.update(`${key}=`);
      updateHashWithValue(hash, entryValue);
    }
    hash.update("}|");
    return;
  }
  hash.update(`${typeof value}:unsupported|`);
}

export function toStudioRenderJobFingerprint(payload: StudioNativeRenderRequest): string {
  const hash = createHash("sha1");
  const studioSnapshot = payload.asset?.studioSnapshot;
  if (studioSnapshot) {
    const { createdAtMs: _ignoredCreatedAtMs, ...stableStudioSnapshot } = studioSnapshot;
    updateHashWithValue(hash, {
      ...payload,
      asset: {
        ...payload.asset,
        studioSnapshot: stableStudioSnapshot,
      },
    });
  } else {
    updateHashWithValue(hash, payload);
  }
  return hash.digest("hex");
}

function toStudioRenderJobRecord(value: unknown): StudioRenderJobRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const status = row.status;
  const createdAtMs = asPositiveNumber(row.createdAtMs);
  const updatedAtMs = asPositiveNumber(row.updatedAtMs);
  if (!id || !isStudioRenderJobStatus(status) || typeof createdAtMs !== "number" || typeof updatedAtMs !== "number") {
    return null;
  }
  return {
    id,
    renderer: "server_native",
    status,
    createdAtMs,
    updatedAtMs,
    startedAtMs: asPositiveNumber(row.startedAtMs),
    completedAtMs: asPositiveNumber(row.completedAtMs),
    uploadedAssetId: asString(row.uploadedAssetId) || undefined,
    uploadedAssetUrl: asString(row.uploadedAssetUrl) || undefined,
    studioSnapshotSaved: typeof row.studioSnapshotSaved === "boolean" ? row.studioSnapshotSaved : undefined,
    audioDiagnostics:
      row.audioDiagnostics && typeof row.audioDiagnostics === "object" ? (row.audioDiagnostics as StudioRenderJobRecord["audioDiagnostics"]) : undefined,
    memoryBudget:
      row.memoryBudget && typeof row.memoryBudget === "object" ? (row.memoryBudget as StudioRenderJobRecord["memoryBudget"]) : undefined,
    usage: row.usage && typeof row.usage === "object" ? (row.usage as StudioRenderJobRecord["usage"]) : undefined,
    error: asString(row.error) || undefined,
    errorCode: asString(row.errorCode) || undefined,
    retryable: typeof row.retryable === "boolean" ? row.retryable : undefined,
  };
}

async function writeStudioRenderJob(userId: string, record: StudioRenderJobRecord): Promise<StudioRenderJobRecord> {
  await setAppCacheEntry({
    scope: STUDIO_RENDER_JOB_SCOPE,
    userScope: userId,
    key: record.id,
    value: record,
    ttlSec: STUDIO_RENDER_JOB_TTL_SEC,
  });
  return record;
}

async function writeStudioRenderJobFingerprint(userId: string, fingerprint: string, jobId: string): Promise<void> {
  await setAppCacheEntry({
    scope: STUDIO_RENDER_JOB_FINGERPRINT_SCOPE,
    userScope: userId,
    key: fingerprint,
    value: jobId,
    ttlSec: STUDIO_RENDER_JOB_TTL_SEC,
  });
}

async function readStudioRenderJobFingerprint(userId: string, fingerprint: string): Promise<string> {
  const entry = await getAppCacheEntry(STUDIO_RENDER_JOB_FINGERPRINT_SCOPE, userId, fingerprint);
  return asString(entry?.valueText ?? entry?.valueJson);
}

async function readStoredStudioRenderJob(userId: string, jobId: string): Promise<StudioRenderJobRecord | null> {
  const safeJobId = asString(jobId);
  if (!safeJobId) return null;
  const entry = await getAppCacheEntry(STUDIO_RENDER_JOB_SCOPE, userId, safeJobId);
  return toStudioRenderJobRecord(entry?.valueJson);
}

function resolveStaleQueuedPatch(): Pick<StudioRenderJobRecord, "status" | "completedAtMs" | "error" | "errorCode" | "retryable"> {
  return {
    status: "failed",
    completedAtMs: Date.now(),
    error: "렌더 작업이 대기열에서 만료되었습니다. 다시 시도해 주세요.",
    errorCode: "STUDIO_RENDER_JOB_QUEUE_STALE",
    retryable: true,
  };
}

function resolveStaleProcessingPatch(): Pick<StudioRenderJobRecord, "status" | "completedAtMs" | "error" | "errorCode" | "retryable"> {
  return {
    status: "failed",
    completedAtMs: Date.now(),
    error: "렌더 작업이 중단되었습니다. 다시 시도해 주세요.",
    errorCode: "STUDIO_RENDER_JOB_PROCESSING_STALE",
    retryable: true,
  };
}

async function normalizeStudioRenderJobFreshness(userId: string, record: StudioRenderJobRecord): Promise<StudioRenderJobRecord> {
  if (record.status === "queued" && Date.now() - record.updatedAtMs > STUDIO_RENDER_JOB_QUEUED_STALE_MS) {
    return updateStudioRenderJob(userId, record.id, resolveStaleQueuedPatch());
  }
  const processingStartedAt = record.startedAtMs ?? record.updatedAtMs;
  if (record.status === "processing" && Date.now() - processingStartedAt > STUDIO_RENDER_JOB_PROCESSING_STALE_MS) {
    return updateStudioRenderJob(userId, record.id, resolveStaleProcessingPatch());
  }
  return record;
}

async function createFreshStudioRenderJob(userId: string): Promise<StudioRenderJobRecord> {
  const now = Date.now();
  const record: StudioRenderJobRecord = {
    id: randomUUID(),
    renderer: "server_native",
    status: "queued",
    createdAtMs: now,
    updatedAtMs: now,
  };
  return writeStudioRenderJob(userId, record);
}

export async function createStudioRenderJob(userId: string): Promise<StudioRenderJobRecord> {
  return createFreshStudioRenderJob(userId);
}

type StudioRenderJobSnapshotRetryDependencies = {
  completeStudioAssetSnapshot: typeof completeStudioAssetSnapshot;
  setVideoAssetStudioSnapshot: typeof setVideoAssetStudioSnapshot;
  updateStudioRenderJob: typeof updateStudioRenderJob;
};

const defaultStudioRenderJobSnapshotRetryDependencies: StudioRenderJobSnapshotRetryDependencies = {
  completeStudioAssetSnapshot,
  setVideoAssetStudioSnapshot,
  updateStudioRenderJob,
};

export async function retryCompletedStudioRenderJobSnapshot(
  userId: string,
  job: StudioRenderJobRecord,
  payload: StudioNativeRenderRequest,
  deps: StudioRenderJobSnapshotRetryDependencies = defaultStudioRenderJobSnapshotRetryDependencies
): Promise<StudioRenderJobRecord> {
  if (
    job.status !== "completed" ||
    job.studioSnapshotSaved === true ||
    !asString(job.uploadedAssetId) ||
    !asString(job.uploadedAssetUrl)
  ) {
    return job;
  }
  const completedSnapshot = deps.completeStudioAssetSnapshot({
    snapshot: payload.asset?.studioSnapshot,
    visuals: payload.visuals,
    frameDurationsSec: payload.frameDurationsSec,
    assetUrl: job.uploadedAssetUrl || "",
    publishCategory: normalizeCategory(asString(payload.asset?.publishCategory)) || undefined,
  });
  if (!completedSnapshot) return job;
  try {
    await deps.setVideoAssetStudioSnapshot({
      userId,
      assetId: job.uploadedAssetId || "",
      snapshot: completedSnapshot,
    });
    return deps.updateStudioRenderJob(userId, job.id, {
      studioSnapshotSaved: true,
    });
  } catch {
    return job;
  }
}

export async function createOrReuseStudioRenderJob(
  userId: string,
  payload: StudioNativeRenderRequest
): Promise<CreateOrReuseStudioRenderJobResult> {
  const fingerprint = toStudioRenderJobFingerprint(payload);
  const existingJobId = await readStudioRenderJobFingerprint(userId, fingerprint);
  if (existingJobId) {
    const existingJob = await getStudioRenderJob(userId, existingJobId);
    if (existingJob) {
      const canReuseCompleted = existingJob.status === "completed" && Boolean(asString(existingJob.uploadedAssetUrl));
      if (existingJob.status === "queued" || existingJob.status === "processing" || canReuseCompleted) {
        const reusableJob = canReuseCompleted
          ? await retryCompletedStudioRenderJobSnapshot(userId, existingJob, payload)
          : existingJob;
        return {
          job: reusableJob,
          reused: true,
          shouldStart: false,
        };
      }
    }
  }

  const job = await createFreshStudioRenderJob(userId);
  await writeStudioRenderJobFingerprint(userId, fingerprint, job.id);
  return {
    job,
    reused: false,
    shouldStart: true,
  };
}

export async function getStudioRenderJob(userId: string, jobId: string): Promise<StudioRenderJobRecord | null> {
  const record = await readStoredStudioRenderJob(userId, jobId);
  if (!record) return null;
  return normalizeStudioRenderJobFreshness(userId, record);
}

export async function deleteStudioRenderJob(userId: string, jobId: string): Promise<void> {
  const safeJobId = asString(jobId);
  if (!safeJobId) return;
  await deleteAppCacheEntry(STUDIO_RENDER_JOB_SCOPE, userId, safeJobId).catch(() => undefined);
}

export async function updateStudioRenderJob(
  userId: string,
  jobId: string,
  patch: Partial<StudioRenderJobRecord>
): Promise<StudioRenderJobRecord> {
  const current = await readStoredStudioRenderJob(userId, jobId);
  if (!current) {
    throw new Error("studio render job not found");
  }
  const next: StudioRenderJobRecord = {
    ...current,
    ...patch,
    id: current.id,
    renderer: "server_native",
    updatedAtMs: Date.now(),
  };
  return writeStudioRenderJob(userId, next);
}

async function uploadRenderedVideoAsset(params: {
  userId: string;
  videoPath: string;
  videoSizeBytes: number;
  title: string;
  publishCategory?: string;
}): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  const path = buildShortsStorageObjectKey({
    title: params.title,
    id,
    ext: "mp4",
  });
  const stored = await uploadSupabaseStorageStream({
    path,
    stream: createReadStream(params.videoPath),
    contentType: "video/mp4",
  });

  const record = await createVideoAsset({
    userId: params.userId,
    id,
    title: params.title,
    url: stored.publicUrl,
    publishCategory: params.publishCategory,
    sizeBytes: params.videoSizeBytes,
    mimeType: "video/mp4",
    storageBucket: stored.bucket,
    storagePath: stored.path,
  });
  return {
    id: record.id,
    url: record.url,
  };
}

function resolveFailurePatch(error: unknown): Pick<StudioRenderJobRecord, "status" | "completedAtMs" | "error" | "errorCode" | "retryable"> {
  const message = error instanceof Error ? error.message : String(error);
  const invalid = isStudioInvalidInput(message, ["narration reference", "expired", "missing"]);
  return {
    status: "failed",
    completedAtMs: Date.now(),
    error: message,
    errorCode: invalid ? "SERVER_NATIVE_RENDER_REQUEST_INVALID" : "SERVER_NATIVE_RENDER_FAILED",
    retryable: !invalid,
  };
}

export async function runStudioRenderJob(input: {
  userId: string;
  jobId: string;
  payload: StudioNativeRenderRequest;
  baseUrl: string;
}): Promise<StudioRenderJobRecord> {
  await updateStudioRenderJob(input.userId, input.jobId, {
    status: "processing",
    startedAtMs: Date.now(),
    completedAtMs: undefined,
    error: undefined,
    errorCode: undefined,
    retryable: undefined,
  });

  let workDirToCleanup = "";
  try {
    const resolvedNarration =
      input.payload.narration?.mode === "segmentsRef"
        ? await loadStudioNarrationInput(input.payload.narration.narrationRef, input.userId)
        : input.payload.narration;
    if (!resolvedNarration) {
      throw new Error("narration reference is missing or expired");
    }
    const resolvedPayload: StudioNativeRenderRequest = {
      ...input.payload,
      narration: resolvedNarration,
      fullAudio: resolvedNarration.mode === "singleAudio" ? resolvedNarration.fullAudio : "",
    };
    const result = await renderVideoWithServerNative(resolvedPayload, { baseUrl: input.baseUrl });
    if (!result.ok) {
      return updateStudioRenderJob(input.userId, input.jobId, {
        status: "failed",
        completedAtMs: Date.now(),
        error: result.error,
        errorCode: result.errorCode,
        retryable: result.retryable,
      });
    }

    workDirToCleanup = result.workDir;
    const assetTitle =
      asString(resolvedPayload.asset?.title) ||
      asString(resolvedPayload.visuals?.slides[0]?.title) ||
      "숏츠";
    const publishCategory = normalizeCategory(asString(resolvedPayload.asset?.publishCategory)) || undefined;
    const uploadedAsset = await uploadRenderedVideoAsset({
      userId: input.userId,
      videoPath: result.videoPath,
      videoSizeBytes: result.videoSizeBytes,
      title: assetTitle,
      publishCategory,
    });
    const completedSnapshot = completeStudioAssetSnapshot({
      snapshot: resolvedPayload.asset?.studioSnapshot,
      visuals: resolvedPayload.visuals,
      frameDurationsSec: resolvedPayload.frameDurationsSec,
      assetUrl: uploadedAsset.url,
      publishCategory,
    });
    let studioSnapshotSaved = false;
    if (completedSnapshot) {
      try {
        await setVideoAssetStudioSnapshot({
          userId: input.userId,
          assetId: uploadedAsset.id,
          snapshot: completedSnapshot,
        });
        studioSnapshotSaved = true;
      } catch {
        studioSnapshotSaved = false;
      }
    }
    return updateStudioRenderJob(input.userId, input.jobId, {
      status: "completed",
      completedAtMs: Date.now(),
      uploadedAssetId: uploadedAsset.id,
      uploadedAssetUrl: uploadedAsset.url,
      studioSnapshotSaved,
      audioDiagnostics: result.audioDiagnostics,
      memoryBudget: result.memoryBudget,
      usage: result.usage,
      error: undefined,
      errorCode: undefined,
      retryable: undefined,
    });
  } catch (error) {
    return updateStudioRenderJob(input.userId, input.jobId, resolveFailurePatch(error));
  } finally {
    if (workDirToCleanup) {
      await rm(workDirToCleanup, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
