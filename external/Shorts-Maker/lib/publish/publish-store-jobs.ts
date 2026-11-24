import type { PublishCategory, PublishJobRecord, PublishJobStatus } from "@/lib/publish/types";
import {
  deleteSupabaseRows,
  selectSupabaseRows,
  tryInsertSupabaseRows,
  updateSupabaseRows,
} from "@/lib/supabase/server";

const JOB_EXECUTION_LOCK_SCOPE = "publish_job_execution_lock";
const JOB_EXECUTION_LOCK_TTL_SEC = 10 * 60;

export type PublishJobRow = {
  id: string;
  user_id: string;
  platform: "youtube";
  channel_id: string;
  publish_category?: string | null;
  video_url: string;
  title: string;
  description: string;
  tags: string[];
  visibility: "private" | "public" | "unlisted";
  scheduled_at_ms?: number | null;
  status: PublishJobStatus;
  attempts: number;
  last_error?: string | null;
  platform_post_id?: string | null;
  published_url?: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms?: number | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
};

export type DeletedPublishJobRecord = PublishJobRecord & {
  deletedAt: number;
};

type AppCacheRow = {
  scope: string;
  user_scope: string;
  cache_key: string;
  value_text?: string | null;
  value_json?: unknown | null;
  expires_at_ms?: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type PublishJobServiceDeps = {
  deleteSupabaseRows: typeof deleteSupabaseRows;
  selectSupabaseRows: typeof selectSupabaseRows;
  tryInsertSupabaseRows: typeof tryInsertSupabaseRows;
  updateSupabaseRows: typeof updateSupabaseRows;
};

export type PublishJobService = {
  createPublishJob(input: {
    userId: string;
    id: string;
    channelId: string;
    publishCategory?: PublishCategory;
    videoUrl: string;
    title: string;
    description: string;
    tags: string[];
    visibility: "private" | "public" | "unlisted";
    scheduledAt?: number | null;
  }): Promise<PublishJobRecord>;
  listPublishJobs(userId: string, limit?: number): Promise<PublishJobRecord[]>;
  getPublishJob(userId: string, id: string): Promise<PublishJobRecord | null>;
  updatePublishJobStatus(input: {
    userId: string;
    id: string;
    status: PublishJobStatus;
    attempts?: number;
    lastError?: string | null;
    platformPostId?: string | null;
    publishedUrl?: string | null;
    scheduledAt?: number | null;
  }): Promise<PublishJobRecord | null>;
  cancelPublishJob(userId: string, id: string): Promise<"not_found" | "already_published" | "processing" | "already_canceled" | "canceled">;
  runPublishJobNow(
    userId: string,
    id: string
  ): Promise<"not_found" | "already_published" | "already_canceled" | "processing" | "not_pending" | "queued">;
  deleteFailedPublishJob(
    userId: string,
    id: string,
    options?: {
      deletedBy?: string | null;
      reason?: string | null;
    }
  ): Promise<"not_found" | "not_deletable" | "deleted">;
  listDeletedPublishJobs(userId: string, limit?: number): Promise<DeletedPublishJobRecord[]>;
  restoreDeletedPublishJob(userId: string, id: string): Promise<PublishJobRecord | null>;
  getPublishJobExecutionLock(userId: string, jobId: string): Promise<string | null>;
  acquirePublishJobExecutionLock(userId: string, jobId: string, token: string): Promise<boolean>;
  releasePublishJobExecutionLock(userId: string, jobId: string, token: string): Promise<void>;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];
}

function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeDeletedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toSoftDeleteFilter(mode: "active" | "deleted" | "all" = "active") {
  if (mode === "all") return undefined;
  if (mode === "deleted") {
    return {
      op: "gt" as const,
      value: 0,
    };
  }
  return null;
}

function toPublishJobRecord(row: PublishJobRow): PublishJobRecord {
  return {
    userId: row.user_id,
    id: row.id,
    platform: "youtube",
    channelId: row.channel_id,
    publishCategory: typeof row.publish_category === "string" && row.publish_category.trim() ? row.publish_category.trim() : undefined,
    videoUrl: row.video_url,
    title: row.title,
    description: row.description,
    tags: normalizeStringArray(row.tags),
    visibility: row.visibility,
    scheduledAt: typeof row.scheduled_at_ms === "number" ? row.scheduled_at_ms : null,
    status: row.status,
    attempts: Number.isFinite(row.attempts) ? row.attempts : 0,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    platformPostId: typeof row.platform_post_id === "string" ? row.platform_post_id : null,
    publishedUrl: typeof row.published_url === "string" ? row.published_url : null,
    createdAt: row.created_at_ms,
    updatedAt: row.updated_at_ms,
    deletedAt: normalizeDeletedAt(row.deleted_at_ms),
  };
}

function toExecutionLockRow(userId: string, jobId: string, token: string): AppCacheRow {
  const now = Date.now();
  return {
    scope: JOB_EXECUTION_LOCK_SCOPE,
    user_scope: normalizeUserScope(userId),
    cache_key: jobId.trim(),
    value_text: token.trim(),
    value_json: {
      token: token.trim(),
    },
    expires_at_ms: now + JOB_EXECUTION_LOCK_TTL_SEC * 1000,
    created_at_ms: now,
    updated_at_ms: now,
  };
}

function createPublishJobService(deps: Partial<PublishJobServiceDeps> = {}): PublishJobService {
  const jobDeps: PublishJobServiceDeps = {
    deleteSupabaseRows: deps.deleteSupabaseRows || deleteSupabaseRows,
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    tryInsertSupabaseRows: deps.tryInsertSupabaseRows || tryInsertSupabaseRows,
    updateSupabaseRows: deps.updateSupabaseRows || updateSupabaseRows,
  };

  async function getPublishJobRow(userId: string, id: string): Promise<PublishJobRow | null> {
    const safeId = id.trim();
    if (!safeId) return null;
    const rows = await jobDeps.selectSupabaseRows<PublishJobRow>("publish_jobs", {
      filters: {
        user_id: normalizeUserScope(userId),
        id: safeId,
        deleted_at_ms: toSoftDeleteFilter(),
      },
      limit: 1,
    });
    return rows[0] || null;
  }

  async function getPublishJobRowByMode(
    userId: string,
    id: string,
    softDeleteMode: "active" | "deleted" | "all"
  ): Promise<PublishJobRow | null> {
    const safeId = id.trim();
    if (!safeId) return null;
    const rows = await jobDeps.selectSupabaseRows<PublishJobRow>("publish_jobs", {
      filters: {
        user_id: normalizeUserScope(userId),
        id: safeId,
        deleted_at_ms: toSoftDeleteFilter(softDeleteMode),
      },
      limit: 1,
    });
    return rows[0] || null;
  }

  async function listPublishJobRows(
    userId: string,
    limit = 100,
    options?: { softDeleteMode?: "active" | "deleted" | "all" }
  ): Promise<PublishJobRow[]> {
    return jobDeps.selectSupabaseRows<PublishJobRow>("publish_jobs", {
      filters: {
        user_id: normalizeUserScope(userId),
        deleted_at_ms: toSoftDeleteFilter(options?.softDeleteMode),
      },
      orderBy: {
        column: options?.softDeleteMode === "deleted" ? "deleted_at_ms" : "created_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(5000, Math.floor(limit))),
    });
  }

  async function getExecutionLockRow(userId: string, jobId: string): Promise<AppCacheRow | null> {
    const safeJobId = jobId.trim();
    if (!safeJobId) return null;
    const rows = await jobDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: JOB_EXECUTION_LOCK_SCOPE,
        user_scope: normalizeUserScope(userId),
        cache_key: safeJobId,
      },
      limit: 1,
    });
    const row = rows[0] || null;
    if (!row) return null;
    if (typeof row.expires_at_ms === "number" && row.expires_at_ms <= Date.now()) {
      await jobDeps.deleteSupabaseRows("app_cache_entries", {
        scope: JOB_EXECUTION_LOCK_SCOPE,
        user_scope: normalizeUserScope(userId),
        cache_key: safeJobId,
      }).catch(() => undefined);
      return null;
    }
    return row;
  }

  async function createPublishJob(input: {
    userId: string;
    id: string;
    channelId: string;
    publishCategory?: PublishCategory;
    videoUrl: string;
    title: string;
    description: string;
    tags: string[];
    visibility: "private" | "public" | "unlisted";
    scheduledAt?: number | null;
  }): Promise<PublishJobRecord> {
    const now = Date.now();
    const row: PublishJobRow = {
      id: input.id.trim(),
      user_id: normalizeUserScope(input.userId),
      platform: "youtube",
      channel_id: input.channelId.trim(),
      publish_category: input.publishCategory?.trim() || null,
      video_url: input.videoUrl.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      tags: normalizeStringArray(input.tags),
      visibility: input.visibility,
      scheduled_at_ms: typeof input.scheduledAt === "number" ? input.scheduledAt : null,
      status: "pending",
      attempts: 0,
      last_error: null,
      platform_post_id: null,
      published_url: null,
      created_at_ms: now,
      updated_at_ms: now,
      deleted_at_ms: null,
      deleted_by: null,
      delete_reason: null,
    };
    const inserted = await jobDeps.tryInsertSupabaseRows<PublishJobRow>("publish_jobs", [row], {
      onConflict: "id",
    });
    if (inserted === null) {
      throw new Error("동일한 발행 작업 ID가 이미 존재합니다.");
    }
    return toPublishJobRecord(inserted[0] || row);
  }

  async function listPublishJobs(userId: string, limit = 100): Promise<PublishJobRecord[]> {
    const rows = await listPublishJobRows(userId, limit);
    return rows.map(toPublishJobRecord);
  }

  async function getPublishJob(userId: string, id: string): Promise<PublishJobRecord | null> {
    const row = await getPublishJobRow(userId, id);
    return row ? toPublishJobRecord(row) : null;
  }

  async function updatePublishJobStatus(input: {
    userId: string;
    id: string;
    status: PublishJobStatus;
    attempts?: number;
    lastError?: string | null;
    platformPostId?: string | null;
    publishedUrl?: string | null;
    scheduledAt?: number | null;
  }): Promise<PublishJobRecord | null> {
    const safeId = input.id.trim();
    if (!safeId) {
      throw new Error("id is required");
    }

    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at_ms: Date.now(),
    };
    if (typeof input.attempts === "number") {
      patch.attempts = Math.max(0, Math.floor(input.attempts));
    }
    if ("lastError" in input) {
      patch.last_error = input.lastError;
    }
    if ("platformPostId" in input) {
      patch.platform_post_id = input.platformPostId;
    }
    if ("publishedUrl" in input) {
      patch.published_url = input.publishedUrl;
    }
    if ("scheduledAt" in input) {
      patch.scheduled_at_ms = input.scheduledAt;
    }

    const updated = await jobDeps.updateSupabaseRows<PublishJobRow>(
      "publish_jobs",
      {
        user_id: normalizeUserScope(input.userId),
        id: safeId,
        deleted_at_ms: toSoftDeleteFilter(),
      },
      patch
    );
    return updated[0] ? toPublishJobRecord(updated[0]) : null;
  }

  async function getPublishJobExecutionLock(userId: string, jobId: string): Promise<string | null> {
    const row = await getExecutionLockRow(userId, jobId);
    const token = typeof row?.value_text === "string" ? row.value_text.trim() : "";
    return token || null;
  }

  async function acquirePublishJobExecutionLock(userId: string, jobId: string, token: string): Promise<boolean> {
    const safeJobId = jobId.trim();
    const safeToken = token.trim();
    if (!safeJobId || !safeToken) {
      throw new Error("jobId and token are required");
    }

    const existingToken = await getPublishJobExecutionLock(userId, safeJobId);
    if (existingToken) {
      return existingToken === safeToken;
    }

    const inserted = await jobDeps.tryInsertSupabaseRows<AppCacheRow>("app_cache_entries", [toExecutionLockRow(userId, safeJobId, safeToken)], {
      onConflict: ["scope", "user_scope", "cache_key"],
    });
    if (inserted !== null) {
      return true;
    }

    const staleRow = await getExecutionLockRow(userId, safeJobId);
    if (!staleRow) {
      const retried = await jobDeps.tryInsertSupabaseRows<AppCacheRow>("app_cache_entries", [toExecutionLockRow(userId, safeJobId, safeToken)], {
        onConflict: ["scope", "user_scope", "cache_key"],
      });
      return retried !== null;
    }

    const staleToken = typeof staleRow.value_text === "string" ? staleRow.value_text.trim() : "";
    return staleToken === safeToken;
  }

  async function releasePublishJobExecutionLock(userId: string, jobId: string, token: string): Promise<void> {
    const safeJobId = jobId.trim();
    const safeToken = token.trim();
    if (!safeJobId) return;
    const row = await jobDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: JOB_EXECUTION_LOCK_SCOPE,
        user_scope: normalizeUserScope(userId),
        cache_key: safeJobId,
      },
      limit: 1,
    });
    const current = row[0] || null;
    const currentToken = typeof current?.value_text === "string" ? current.value_text.trim() : "";
    if (current && safeToken && currentToken && currentToken !== safeToken) {
      return;
    }
    await jobDeps.deleteSupabaseRows("app_cache_entries", {
      scope: JOB_EXECUTION_LOCK_SCOPE,
      user_scope: normalizeUserScope(userId),
      cache_key: safeJobId,
    }).catch(() => undefined);
  }

  async function cancelPublishJob(
    userId: string,
    id: string
  ): Promise<"not_found" | "already_published" | "processing" | "already_canceled" | "canceled"> {
    const current = await getPublishJob(userId, id);
    if (!current) return "not_found";
    if (current.status === "published") return "already_published";
    if (current.status === "processing") return "processing";
    if (current.status === "canceled") return "already_canceled";
    await updatePublishJobStatus({
      userId,
      id,
      status: "canceled",
      lastError: "Canceled by user",
    });
    return "canceled";
  }

  async function runPublishJobNow(
    userId: string,
    id: string
  ): Promise<"not_found" | "already_published" | "already_canceled" | "processing" | "not_pending" | "queued"> {
    const current = await getPublishJob(userId, id);
    if (!current) return "not_found";
    if (current.status === "published") return "already_published";
    if (current.status === "canceled") return "already_canceled";
    if (current.status === "processing") {
      const ageMs = Date.now() - current.updatedAt;
      const activeExecutionLock = await getPublishJobExecutionLock(userId, id);
      if (activeExecutionLock) {
        return "processing";
      }
      if (ageMs < 3 * 60_000) {
        return "processing";
      }
    } else if (current.status !== "pending" && current.status !== "failed") {
      return "not_pending";
    }

    await jobDeps.updateSupabaseRows<PublishJobRow>(
      "publish_jobs",
      {
        user_id: normalizeUserScope(userId),
        id: id.trim(),
        deleted_at_ms: toSoftDeleteFilter(),
      },
      {
        status: "pending",
        scheduled_at_ms: null,
        last_error: current.status === "processing" ? "Recovered stale processing state" : current.lastError,
        updated_at_ms: Date.now(),
      }
    );
    return "queued";
  }

  async function deleteFailedPublishJob(
    userId: string,
    id: string,
    options?: {
      deletedBy?: string | null;
      reason?: string | null;
    }
  ): Promise<"not_found" | "not_deletable" | "deleted"> {
    const current = await getPublishJob(userId, id);
    if (!current) return "not_found";
    const isFailedAndExhausted = current.status === "failed" && current.attempts >= 3;
    const isCanceled = current.status === "canceled";
    if (!isFailedAndExhausted && !isCanceled) return "not_deletable";
    await jobDeps.updateSupabaseRows<PublishJobRow>(
      "publish_jobs",
      {
        user_id: normalizeUserScope(userId),
        id: id.trim(),
        deleted_at_ms: toSoftDeleteFilter(),
      },
      {
        deleted_at_ms: Date.now(),
        deleted_by: safeTrim(options?.deletedBy) || null,
        delete_reason: safeTrim(options?.reason) || null,
        updated_at_ms: Date.now(),
      },
      {
        returning: false,
      }
    );
    return "deleted";
  }

  async function listDeletedPublishJobs(userId: string, limit = 100): Promise<DeletedPublishJobRecord[]> {
    const rows = await listPublishJobRows(userId, limit, { softDeleteMode: "deleted" });
    return rows
      .map((row) => {
        const deletedAt = normalizeDeletedAt(row.deleted_at_ms);
        if (!deletedAt) return null;
        return {
          ...toPublishJobRecord(row),
          deletedAt,
        };
      })
      .filter((row): row is DeletedPublishJobRecord => Boolean(row));
  }

  async function restoreDeletedPublishJob(userId: string, id: string): Promise<PublishJobRecord | null> {
    const current = await getPublishJobRowByMode(userId, id, "deleted");
    if (!current) return null;
    const updated = await jobDeps.updateSupabaseRows<PublishJobRow>(
      "publish_jobs",
      {
        user_id: normalizeUserScope(userId),
        id: id.trim(),
        deleted_at_ms: {
          op: "gt",
          value: 0,
        },
      },
      {
        deleted_at_ms: null,
        deleted_by: null,
        delete_reason: null,
        updated_at_ms: Date.now(),
      }
    );
    return updated[0] ? toPublishJobRecord(updated[0]) : toPublishJobRecord({ ...current, deleted_at_ms: null, deleted_by: null, delete_reason: null });
  }

  return {
    createPublishJob,
    listPublishJobs,
    getPublishJob,
    updatePublishJobStatus,
    cancelPublishJob,
    runPublishJobNow,
    deleteFailedPublishJob,
    listDeletedPublishJobs,
    restoreDeletedPublishJob,
    getPublishJobExecutionLock,
    acquirePublishJobExecutionLock,
    releasePublishJobExecutionLock,
  };
}

const defaultPublishJobService = createPublishJobService();

export { createPublishJobService };
export const createPublishJob = defaultPublishJobService.createPublishJob;
export const listPublishJobs = defaultPublishJobService.listPublishJobs;
export const getPublishJob = defaultPublishJobService.getPublishJob;
export const updatePublishJobStatus = defaultPublishJobService.updatePublishJobStatus;
export const cancelPublishJob = defaultPublishJobService.cancelPublishJob;
export const runPublishJobNow = defaultPublishJobService.runPublishJobNow;
export const deleteFailedPublishJob = defaultPublishJobService.deleteFailedPublishJob;
export const listDeletedPublishJobs = defaultPublishJobService.listDeletedPublishJobs;
export const restoreDeletedPublishJob = defaultPublishJobService.restoreDeletedPublishJob;
export const getPublishJobExecutionLock = defaultPublishJobService.getPublishJobExecutionLock;
export const acquirePublishJobExecutionLock = defaultPublishJobService.acquirePublishJobExecutionLock;
export const releasePublishJobExecutionLock = defaultPublishJobService.releasePublishJobExecutionLock;
