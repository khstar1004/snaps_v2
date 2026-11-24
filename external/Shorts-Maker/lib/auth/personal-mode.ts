import type { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { syncValidatedSessionCookies, type ValidatedSessionSnapshot } from "@/lib/auth/session";
import { createAuthUser, getAuthUserByLoginId, listAuthUsers, normalizeLoginId } from "@/lib/auth/store";
import type { AuthUser, SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";

const DEFAULT_PERSONAL_OWNER_LOGIN_ID = "owner";
const PERSONAL_OWNER_CACHE_TTL_MS = 60_000;

type PersonalModeEnvironment = {
  APP_MODE?: string;
  NODE_ENV?: string;
  PERSONAL_OWNER_LOGIN_ID?: string;
};

type PersonalOwnerDependencies = {
  listUsers: typeof listAuthUsers;
  getUserByLoginId: typeof getAuthUserByLoginId;
  createUser: typeof createAuthUser;
};

const defaultDependencies: PersonalOwnerDependencies = {
  listUsers: listAuthUsers,
  getUserByLoginId: getAuthUserByLoginId,
  createUser: createAuthUser,
};

let ownerSnapshotCache:
  | {
      key: string;
      expiresAt: number;
      promise: Promise<ValidatedSessionSnapshot>;
    }
  | null = null;

function normalizeAppMode(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
}

export function isPersonalModeEnabled(environment: PersonalModeEnvironment = process.env): boolean {
  const mode = normalizeAppMode(environment.APP_MODE);
  if (["multi_user", "team", "legacy"].includes(mode)) return false;
  if (["personal", "single_user", "local"].includes(mode)) return true;
  return environment.NODE_ENV !== "test";
}

export function getConfiguredPersonalOwnerLoginId(environment: PersonalModeEnvironment = process.env): string {
  return normalizeLoginId(environment.PERSONAL_OWNER_LOGIN_ID || "");
}

function isEligiblePersonalOwner(user: AuthUser): boolean {
  return user.isActive && user.role !== "system";
}

export function selectPersonalOwnerCandidate(users: AuthUser[], configuredLoginId = ""): AuthUser | null {
  const eligibleUsers = users.filter(isEligiblePersonalOwner);
  const normalizedConfiguredLoginId = normalizeLoginId(configuredLoginId);

  if (normalizedConfiguredLoginId) {
    const configuredUser = eligibleUsers.find((user) => normalizeLoginId(user.loginId) === normalizedConfiguredLoginId);
    if (!configuredUser) {
      throw new Error(
        `PERSONAL_OWNER_LOGIN_ID로 지정한 '${normalizedConfiguredLoginId}' 활성 사용자를 찾을 수 없습니다.`
      );
    }
    return configuredUser;
  }

  if (eligibleUsers.length === 0) return null;
  if (eligibleUsers.length === 1) return eligibleUsers[0];
  throw new Error(
    "활성 사용자가 여러 명이라 개인 작업공간을 자동 선택할 수 없습니다. PERSONAL_OWNER_LOGIN_ID를 설정해 주세요."
  );
}

function toPersonalModeSnapshot(owner: AuthUser): ValidatedSessionSnapshot {
  if (!isEligiblePersonalOwner(owner)) {
    throw new Error("개인 작업공간 소유자는 활성 일반 사용자 또는 관리자여야 합니다.");
  }

  const authUser: SessionUser = {
    id: owner.id,
    loginId: owner.loginId,
    email: owner.email,
    displayName: owner.displayName,
    role: "member",
  };
  const user: WorkspaceSessionUser = {
    ...authUser,
    authUserId: authUser.id,
    authLoginId: authUser.loginId,
    authDisplayName: authUser.displayName,
    workspaceUserId: authUser.id,
    workspaceLoginId: authUser.loginId,
    workspaceDisplayName: authUser.displayName,
    isActingAs: false,
  };

  return {
    authUser,
    user,
    hasStaleWorkspaceToken: false,
  };
}

export async function resolvePersonalModeSessionSnapshot(
  environment: PersonalModeEnvironment = process.env,
  dependencies: PersonalOwnerDependencies = defaultDependencies
): Promise<ValidatedSessionSnapshot> {
  const configuredLoginId = getConfiguredPersonalOwnerLoginId(environment);
  const users = await dependencies.listUsers(5000);
  let owner = selectPersonalOwnerCandidate(users, configuredLoginId);

  if (!owner) {
    const loginId = configuredLoginId || DEFAULT_PERSONAL_OWNER_LOGIN_ID;
    try {
      owner = await dependencies.createUser({
        loginId,
        email: `${loginId}@local.user`,
        displayName: "내 작업공간",
        passwordHash: "",
        role: "member",
        isActive: true,
      });
    } catch (error) {
      owner = await dependencies.getUserByLoginId(loginId);
      if (!owner) throw error;
    }
  }

  return toPersonalModeSnapshot(owner);
}

export function getPersonalModeSessionSnapshot(
  environment: PersonalModeEnvironment = process.env
): Promise<ValidatedSessionSnapshot> {
  const key = getConfiguredPersonalOwnerLoginId(environment) || "__auto__";
  const now = Date.now();
  if (ownerSnapshotCache && ownerSnapshotCache.key === key && ownerSnapshotCache.expiresAt > now) {
    return ownerSnapshotCache.promise;
  }

  const promise = resolvePersonalModeSessionSnapshot(environment).catch((error) => {
    if (ownerSnapshotCache?.promise === promise) ownerSnapshotCache = null;
    throw error;
  });
  ownerSnapshotCache = {
    key,
    expiresAt: now + PERSONAL_OWNER_CACHE_TTL_MS,
    promise,
  };
  return promise;
}

export function resetPersonalModeOwnerCacheForTests(): void {
  ownerSnapshotCache = null;
}

export function syncPersonalModeCookies(
  response: NextResponse,
  request: NextRequest,
  snapshot: ValidatedSessionSnapshot
): void {
  syncValidatedSessionCookies(response, request, snapshot);
  for (const name of [AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE]) {
    if (!request.cookies.get(name)?.value) continue;
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0,
    });
  }
}

export function getPersonalModeRouteDisposition(pathname: string): "pass" | "redirect_home" | "not_found" {
  if (pathname === "/login" || pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "redirect_home";
  }
  if (
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/auth/login" ||
    pathname.startsWith("/api/auth/login/") ||
    pathname === "/api/auth/register" ||
    pathname.startsWith("/api/auth/register/") ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/auth/logout/")
  ) {
    return "not_found";
  }
  return "pass";
}
