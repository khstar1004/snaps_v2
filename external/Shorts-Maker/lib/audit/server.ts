import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";
import { insertSupabaseRows, selectSupabaseRows } from "@/lib/supabase/server";

type AuditLogRow = {
  id: string;
  actor_user_id: string;
  actor_login_id: string;
  actor_display_name: string;
  workspace_user_id?: string | null;
  workspace_login_id: string;
  workspace_display_name: string;
  is_acting_as: boolean;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_label: string;
  route: string;
  detail: string;
  metadata?: Record<string, unknown> | null;
  created_at_ms: number;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string;
  actorLoginId: string;
  actorDisplayName: string;
  workspaceUserId: string | null;
  workspaceLoginId: string;
  workspaceDisplayName: string;
  isActingAs: boolean;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;
  route: string;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: number;
};

type AuditActor = {
  actorUserId: string;
  actorLoginId: string;
  actorDisplayName: string;
  workspaceUserId: string | null;
  workspaceLoginId: string;
  workspaceDisplayName: string;
  isActingAs: boolean;
};

const ANONYMOUS_AUDIT_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
const ANONYMOUS_AUDIT_ACTOR_LOGIN_ID = "_anonymous_auth";
const ANONYMOUS_AUDIT_ACTOR_DISPLAY_NAME = "인증 전 사용자";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingAuditLogsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('relation "public.audit_logs" does not exist') || message.includes('relation "audit_logs" does not exist');
}

function toAuditActor(user: SessionUser | WorkspaceSessionUser): AuditActor {
  if ("authUserId" in user) {
    return {
      actorUserId: user.authUserId,
      actorLoginId: user.authLoginId,
      actorDisplayName: user.authDisplayName,
      workspaceUserId: user.workspaceUserId,
      workspaceLoginId: user.workspaceLoginId,
      workspaceDisplayName: user.workspaceDisplayName,
      isActingAs: user.isActingAs,
    };
  }
  return {
    actorUserId: user.id,
    actorLoginId: user.loginId,
    actorDisplayName: user.displayName,
    workspaceUserId: user.id,
    workspaceLoginId: user.loginId,
    workspaceDisplayName: user.displayName,
    isActingAs: false,
  };
}

function toRoute(request?: NextRequest): string {
  return request ? request.nextUrl.pathname : "";
}

function toMetadata(request: NextRequest | undefined, metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const nextMetadata = { ...(metadata || {}) };
  if (!request) return nextMetadata;
  const ipAddress = asString(request.headers.get("x-forwarded-for")).split(",")[0]?.trim() || "";
  const userAgent = asString(request.headers.get("user-agent"));
  if (ipAddress && !("ipAddress" in nextMetadata)) {
    nextMetadata.ipAddress = ipAddress;
  }
  if (userAgent && !("userAgent" in nextMetadata)) {
    nextMetadata.userAgent = userAgent;
  }
  return nextMetadata;
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorLoginId: row.actor_login_id,
    actorDisplayName: row.actor_display_name,
    workspaceUserId: asString(row.workspace_user_id) || null,
    workspaceLoginId: row.workspace_login_id,
    workspaceDisplayName: row.workspace_display_name,
    isActingAs: row.is_acting_as,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    route: row.route,
    detail: row.detail,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at_ms,
  };
}

function getAnonymousAuditActor(): AuditActor {
  return {
    actorUserId: ANONYMOUS_AUDIT_ACTOR_ID,
    actorLoginId: ANONYMOUS_AUDIT_ACTOR_LOGIN_ID,
    actorDisplayName: ANONYMOUS_AUDIT_ACTOR_DISPLAY_NAME,
    workspaceUserId: null,
    workspaceLoginId: "",
    workspaceDisplayName: "",
    isActingAs: false,
  };
}

async function insertAuditLogRow(actor: AuditActor, input: {
  request?: NextRequest;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceLabel?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = Date.now();
  await insertSupabaseRows<AuditLogRow>(
    "audit_logs",
    [
      {
        id: randomUUID(),
        actor_user_id: actor.actorUserId,
        actor_login_id: actor.actorLoginId,
        actor_display_name: actor.actorDisplayName,
        workspace_user_id: actor.workspaceUserId,
        workspace_login_id: actor.workspaceLoginId,
        workspace_display_name: actor.workspaceDisplayName,
        is_acting_as: actor.isActingAs,
        action: asString(input.action),
        resource_type: asString(input.resourceType),
        resource_id: asString(input.resourceId),
        resource_label: asString(input.resourceLabel),
        route: toRoute(input.request),
        detail: asString(input.detail),
        metadata: toMetadata(input.request, input.metadata),
        created_at_ms: now,
      },
    ],
    {
      returning: false,
    }
  );
}

export async function recordAuditLog(input: {
  user: SessionUser | WorkspaceSessionUser;
  request?: NextRequest;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceLabel?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const actor = toAuditActor(input.user);
  await insertAuditLogRow(actor, input);
}

export async function recordAnonymousAuditLog(input: {
  request?: NextRequest;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceLabel?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertAuditLogRow(getAnonymousAuditActor(), input);
}

export async function recordAuditLogSafely(input: Parameters<typeof recordAuditLog>[0]): Promise<void> {
  try {
    await recordAuditLog(input);
  } catch (error) {
    if (isMissingAuditLogsTableError(error)) return;
    console.error("[audit] failed to record log", error);
  }
}

export async function recordAnonymousAuditLogSafely(
  input: Parameters<typeof recordAnonymousAuditLog>[0]
): Promise<void> {
  try {
    await recordAnonymousAuditLog(input);
  } catch (error) {
    if (isMissingAuditLogsTableError(error)) return;
    console.error("[audit] failed to record anonymous log", error);
  }
}

export async function listRecentAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  try {
    const rows = await selectSupabaseRows<AuditLogRow>("audit_logs", {
      orderBy: {
        column: "created_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(200, Math.floor(limit))),
    });
    return rows.map(toAuditLogEntry);
  } catch (error) {
    if (isMissingAuditLogsTableError(error)) return [];
    throw error;
  }
}
