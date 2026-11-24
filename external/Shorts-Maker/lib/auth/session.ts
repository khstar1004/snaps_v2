import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { deriveLocalDevelopmentSecret } from "@/lib/auth/dev-secrets";
import { getAuthUserById } from "@/lib/auth/store";
import type { AuthUser, SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";

const AUTH_SESSION_TTL_SEC = 60 * 60 * 24 * 14;

type SessionPayload = {
  uid: string;
  loginId: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  iat: number;
  exp: number;
};

type WorkspacePayload = {
  actorUid: string;
  uid: string;
  loginId: string;
  displayName: string;
  iat: number;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || "";
  if (secret) return secret;
  if ((process.env.NODE_ENV || "").trim() !== "production") {
    return deriveLocalDevelopmentSecret("auth-session");
  }
  throw new Error("AUTH_SESSION_SECRET is required");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSignedToken(value: Record<string, unknown>): string {
  const payloadEncoded = encodeBase64Url(JSON.stringify(value));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function parseSignedToken<T extends { exp?: number }>(token: string): T | null {
  const text = token.trim();
  if (!text) return null;
  const [payloadEncoded, signature] = text.split(".");
  if (!payloadEncoded || !signature) return null;
  const expected = sign(payloadEncoded);
  const incoming = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (incoming.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(incoming, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadEncoded)) as T;
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(user: SessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: user.id,
    loginId: user.loginId.trim().toLowerCase(),
    email: user.email.trim().toLowerCase(),
    displayName: user.displayName.trim(),
    role: user.role === "admin" ? "admin" : "member",
    iat: now,
    exp: now + AUTH_SESSION_TTL_SEC,
  };
  return createSignedToken(payload);
}

export function createWorkspaceToken(input: {
  actorUserId: string;
  workspaceUserId: string;
  workspaceLoginId: string;
  workspaceDisplayName: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: WorkspacePayload = {
    actorUid: input.actorUserId.trim(),
    uid: input.workspaceUserId.trim(),
    loginId: input.workspaceLoginId.trim().toLowerCase(),
    displayName: input.workspaceDisplayName.trim(),
    iat: now,
    exp: now + AUTH_SESSION_TTL_SEC,
  };
  return createSignedToken(payload);
}

export function parseSessionToken(token: string): SessionUser | null {
  const payload = parseSignedToken<SessionPayload>(token);
  if (!payload) return null;
  const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
  const loginId = typeof payload.loginId === "string" ? payload.loginId.trim().toLowerCase() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  const role = payload.role === "admin" ? "admin" : "member";
  if (!uid || !loginId || !email || !displayName) return null;
  return {
    id: uid,
    loginId,
    email,
    displayName,
    role,
  };
}

export function parseWorkspaceToken(token: string): WorkspacePayload | null {
  const payload = parseSignedToken<WorkspacePayload>(token);
  if (!payload) return null;
  if (
    typeof payload.actorUid !== "string" ||
    typeof payload.uid !== "string" ||
    typeof payload.loginId !== "string" ||
    typeof payload.displayName !== "string"
  ) {
    return null;
  }
  const actorUid = payload.actorUid.trim();
  const uid = payload.uid.trim();
  const loginId = payload.loginId.trim().toLowerCase();
  const displayName = payload.displayName.trim();
  if (!actorUid || !uid || !loginId || !displayName) return null;
  return {
    ...payload,
    actorUid,
    uid,
    loginId,
    displayName,
  };
}

export function getAuthenticatedSessionUserFromRequest(request: NextRequest): SessionUser | null {
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value || "";
  return parseSessionToken(token);
}

export function getWorkspaceSessionUserFromRequest(request: NextRequest): WorkspaceSessionUser | null {
  const authUser = getAuthenticatedSessionUserFromRequest(request);
  if (!authUser) return null;

  const workspaceToken = request.cookies.get(AUTH_WORKSPACE_COOKIE)?.value || "";
  const workspace = authUser.role === "admin" ? parseWorkspaceToken(workspaceToken) : null;
  const canActAs =
    Boolean(workspace) &&
    workspace?.actorUid === authUser.id &&
    workspace.uid !== authUser.id;

  return {
    ...authUser,
    id: canActAs ? workspace!.uid : authUser.id,
    authUserId: authUser.id,
    authLoginId: authUser.loginId,
    authDisplayName: authUser.displayName,
    workspaceUserId: canActAs ? workspace!.uid : authUser.id,
    workspaceLoginId: canActAs ? workspace!.loginId : authUser.loginId,
    workspaceDisplayName: canActAs ? workspace!.displayName : authUser.displayName,
    isActingAs: canActAs,
  };
}

export function getSessionMaxAgeSec(): number {
  return AUTH_SESSION_TTL_SEC;
}

function toValidatedSessionUser(user: AuthUser | null | undefined): SessionUser | null {
  if (!user || !user.isActive || user.role === "system") return null;
  return {
    id: user.id,
    loginId: user.loginId,
    email: user.email,
    displayName: user.displayName,
    role: user.role === "admin" ? "admin" : "member",
  };
}

function buildWorkspaceSessionUser(authUser: SessionUser, workspaceUser?: SessionUser | null): WorkspaceSessionUser {
  const effectiveWorkspaceUser = workspaceUser && workspaceUser.id !== authUser.id ? workspaceUser : authUser;
  const isActingAs = effectiveWorkspaceUser.id !== authUser.id;
  return {
    ...authUser,
    id: effectiveWorkspaceUser.id,
    authUserId: authUser.id,
    authLoginId: authUser.loginId,
    authDisplayName: authUser.displayName,
    workspaceUserId: effectiveWorkspaceUser.id,
    workspaceLoginId: effectiveWorkspaceUser.loginId,
    workspaceDisplayName: effectiveWorkspaceUser.displayName,
    isActingAs,
  };
}

export type ValidatedSessionSnapshot = {
  authUser: SessionUser;
  user: WorkspaceSessionUser;
  hasStaleWorkspaceToken: boolean;
};

export async function getValidatedSessionSnapshot(request: NextRequest): Promise<ValidatedSessionSnapshot | null> {
  const tokenUser = getAuthenticatedSessionUserFromRequest(request);
  if (!tokenUser) return null;

  const authUser = toValidatedSessionUser(await getAuthUserById(tokenUser.id));
  if (!authUser) return null;

  const workspaceToken = request.cookies.get(AUTH_WORKSPACE_COOKIE)?.value || "";
  let hasStaleWorkspaceToken = Boolean(workspaceToken) && authUser.role !== "admin";
  let workspaceUser: SessionUser | null = null;

  if (authUser.role === "admin" && workspaceToken) {
    const parsedWorkspace = parseWorkspaceToken(workspaceToken);
    if (parsedWorkspace && parsedWorkspace.actorUid === authUser.id && parsedWorkspace.uid !== authUser.id) {
      workspaceUser = toValidatedSessionUser(await getAuthUserById(parsedWorkspace.uid));
      hasStaleWorkspaceToken = !workspaceUser || workspaceUser.id === authUser.id;
    } else {
      hasStaleWorkspaceToken = true;
    }
  }

  return {
    authUser,
    user: buildWorkspaceSessionUser(authUser, workspaceUser),
    hasStaleWorkspaceToken,
  };
}

export async function getValidatedAuthenticatedSessionUserFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const snapshot = await getValidatedSessionSnapshot(request);
  return snapshot?.authUser || null;
}

export async function getValidatedWorkspaceSessionUserFromRequest(request: NextRequest): Promise<WorkspaceSessionUser | null> {
  const snapshot = await getValidatedSessionSnapshot(request);
  return snapshot?.user || null;
}

function applyCookie(response: NextResponse, request: NextRequest, name: string, value: string, maxAge: number, httpOnly: boolean): void {
  response.cookies.set({
    name,
    value,
    httpOnly,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge,
  });
}

export function syncValidatedSessionCookies(
  response: NextResponse,
  request: NextRequest,
  snapshot: ValidatedSessionSnapshot | null
): void {
  if (!snapshot) {
    for (const [name, httpOnly] of [
      [AUTH_SESSION_COOKIE, true],
      [AUTH_WORKSPACE_COOKIE, true],
      [AUTH_CLIENT_SCOPE_COOKIE, false],
    ] as const) {
      if (!request.cookies.get(name)?.value) continue;
      applyCookie(response, request, name, "", 0, httpOnly);
    }
    return;
  }

  const expectedScope = snapshot.user.workspaceUserId;
  if (request.cookies.get(AUTH_CLIENT_SCOPE_COOKIE)?.value !== expectedScope) {
    applyCookie(response, request, AUTH_CLIENT_SCOPE_COOKIE, expectedScope, getSessionMaxAgeSec(), false);
  }
  if (snapshot.hasStaleWorkspaceToken && request.cookies.get(AUTH_WORKSPACE_COOKIE)?.value) {
    applyCookie(response, request, AUTH_WORKSPACE_COOKIE, "", 0, true);
  }
}
