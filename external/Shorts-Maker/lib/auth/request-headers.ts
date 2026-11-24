import {
  AUTH_REQUEST_AUTH_USER_HEADER,
  AUTH_REQUEST_VALIDATED_HEADER,
  AUTH_REQUEST_WORKSPACE_USER_HEADER,
} from "@/lib/auth/constants";
import type { SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";
import type { ValidatedSessionSnapshot } from "@/lib/auth/session";

type RequestLike = {
  headers: Pick<Headers, "get">;
};

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function encodePayload(value: SessionUser | WorkspaceSessionUser): string {
  return toBase64Url(JSON.stringify(value));
}

function decodePayload<T>(value: string): T | null {
  const decoded = fromBase64Url(value);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionUser(value: unknown): SessionUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const loginId = asString(row.loginId).toLowerCase();
  const email = asString(row.email).toLowerCase();
  const displayName = asString(row.displayName);
  const role = row.role === "admin" ? "admin" : row.role === "member" ? "member" : "";
  if (!id || !loginId || !email || !displayName || !role) return null;
  return {
    id,
    loginId,
    email,
    displayName,
    role,
  };
}

function normalizeWorkspaceSessionUser(value: unknown): WorkspaceSessionUser | null {
  const sessionUser = normalizeSessionUser(value);
  if (!sessionUser || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const authUserId = asString(row.authUserId);
  const authLoginId = asString(row.authLoginId).toLowerCase();
  const authDisplayName = asString(row.authDisplayName);
  const workspaceUserId = asString(row.workspaceUserId);
  const workspaceLoginId = asString(row.workspaceLoginId).toLowerCase();
  const workspaceDisplayName = asString(row.workspaceDisplayName);
  const isActingAs = typeof row.isActingAs === "boolean" ? row.isActingAs : null;
  if (
    !authUserId ||
    !authLoginId ||
    !authDisplayName ||
    !workspaceUserId ||
    !workspaceLoginId ||
    !workspaceDisplayName ||
    isActingAs === null
  ) {
    return null;
  }
  return {
    ...sessionUser,
    authUserId,
    authLoginId,
    authDisplayName,
    workspaceUserId,
    workspaceLoginId,
    workspaceDisplayName,
    isActingAs,
  };
}

function hasValidatedMarker(request: RequestLike): boolean {
  return request.headers.get(AUTH_REQUEST_VALIDATED_HEADER) === "1";
}

export function buildValidatedRequestHeaders(requestHeaders: Headers, snapshot: ValidatedSessionSnapshot | null): Headers {
  const headers = new Headers(requestHeaders);
  headers.delete(AUTH_REQUEST_VALIDATED_HEADER);
  headers.delete(AUTH_REQUEST_AUTH_USER_HEADER);
  headers.delete(AUTH_REQUEST_WORKSPACE_USER_HEADER);
  if (!snapshot) return headers;
  headers.set(AUTH_REQUEST_VALIDATED_HEADER, "1");
  headers.set(AUTH_REQUEST_AUTH_USER_HEADER, encodePayload(snapshot.authUser));
  headers.set(AUTH_REQUEST_WORKSPACE_USER_HEADER, encodePayload(snapshot.user));
  return headers;
}

export function getValidatedAuthenticatedSessionUserFromRequestHeaders(request: RequestLike): SessionUser | null {
  if (!hasValidatedMarker(request)) return null;
  const payload = request.headers.get(AUTH_REQUEST_AUTH_USER_HEADER) || "";
  return normalizeSessionUser(decodePayload(payload));
}

export function getValidatedWorkspaceSessionUserFromRequestHeaders(request: RequestLike): WorkspaceSessionUser | null {
  if (!hasValidatedMarker(request)) return null;
  const payload = request.headers.get(AUTH_REQUEST_WORKSPACE_USER_HEADER) || "";
  return normalizeWorkspaceSessionUser(decodePayload(payload));
}
