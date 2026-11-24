import { randomUUID } from "node:crypto";
import type { AuthRole, AuthUser } from "@/lib/auth/types";
import { insertSupabaseRows, selectSupabaseRows, updateSupabaseRows } from "@/lib/supabase/server";

type AppUserRow = {
  id: string;
  login_id?: string | null;
  email: string;
  display_name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  password_hash: string;
  created_at_ms: number;
  updated_at_ms: number;
};

const SHARED_LIBRARY_USER_ID = "00000000-0000-0000-0000-000000000001";
const AUTH_USER_CACHE_TTL_MS = 60_000;
const authUserByIdCache = new Map<string, { expiresAt: number; value: AuthUser | null }>();

function getCachedAuthUserById(userId: string): AuthUser | null | undefined {
  const cached = authUserByIdCache.get(userId);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    authUserByIdCache.delete(userId);
    return undefined;
  }
  return cached.value;
}

function setCachedAuthUserById(userId: string, value: AuthUser | null): AuthUser | null {
  authUserByIdCache.set(userId, {
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
    value,
  });
  return value;
}

function cacheResolvedAuthUserById(userId: string, value: AuthUser): AuthUser {
  setCachedAuthUserById(userId, value);
  return value;
}

function invalidateCachedAuthUser(userId: string): void {
  const safeUserId = userId.trim();
  if (!safeUserId) return;
  authUserByIdCache.delete(safeUserId);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLoginId(loginId: string): string {
  return loginId
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9@._-]/g, "");
}

function normalizeDisplayName(displayName: string, fallback: string): string {
  const safe = displayName.trim().replace(/\s+/g, " ");
  return safe || fallback;
}

function normalizeRole(role: unknown): AuthRole {
  return role === "admin" || role === "system" ? role : "member";
}

function resolveBootstrapAdminLoginId(): string {
  const configured = normalizeLoginId((process.env.AUTH_BOOTSTRAP_ADMIN_LOGIN_ID || "").trim());
  if (configured) return configured;
  if ((process.env.NODE_ENV || "").trim() !== "production") {
    return "admin";
  }
  return "";
}

function isMissingAuthColumnError(error: unknown, column: string): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes(`column app_users.${column.toLowerCase()} does not exist`);
}

function toDerivedEmail(loginId: string): string {
  const safe = normalizeLoginId(loginId);
  return `${safe || "user"}@local.user`;
}

function deriveLoginIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized.endsWith("@local.user")) {
    return normalizeLoginId(normalized.slice(0, normalized.indexOf("@")));
  }
  return normalizeLoginId(normalized);
}

function toAuthUser(row: AppUserRow): AuthUser {
  const loginId = normalizeLoginId(typeof row.login_id === "string" ? row.login_id : "");
  const email = normalizeEmail(row.email);
  const fallbackLoginId = loginId || deriveLoginIdFromEmail(email) || row.id;
  const role = row.id === SHARED_LIBRARY_USER_ID
    ? "system"
    : normalizeRole(row.role || (fallbackLoginId === resolveBootstrapAdminLoginId() ? "admin" : "member"));
  return {
    id: row.id,
    loginId: fallbackLoginId,
    email,
    displayName: normalizeDisplayName(typeof row.display_name === "string" ? row.display_name : "", fallbackLoginId),
    role,
    isActive: row.is_active !== false,
    passwordHash: row.password_hash,
    createdAt: row.created_at_ms,
    updatedAt: row.updated_at_ms,
  };
}

export async function getAuthUserById(userId: string): Promise<AuthUser | null> {
  const safeUserId = userId.trim();
  if (!safeUserId) return null;
  const cached = getCachedAuthUserById(safeUserId);
  if (cached !== undefined) return cached;
  const rows = await selectSupabaseRows<AppUserRow>("app_users", {
    filters: {
      id: safeUserId,
    },
    limit: 1,
  });
  return setCachedAuthUserById(safeUserId, rows[0] ? toAuthUser(rows[0]) : null);
}

export async function getAuthUserByLoginId(loginId: string): Promise<AuthUser | null> {
  const normalized = normalizeLoginId(loginId);
  if (!normalized) return null;
  try {
    const rows = await selectSupabaseRows<AppUserRow>("app_users", {
      filters: {
        login_id: normalized,
      },
      limit: 1,
    });
    return rows[0] ? toAuthUser(rows[0]) : null;
  } catch (error) {
    if (!isMissingAuthColumnError(error, "login_id")) {
      throw error;
    }
    return getAuthUserByEmail(toDerivedEmail(normalized));
  }
}

export async function getAuthUserByEmail(email: string): Promise<AuthUser | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const rows = await selectSupabaseRows<AppUserRow>("app_users", {
    filters: {
      email: normalized,
    },
    limit: 1,
  });
  return rows[0] ? toAuthUser(rows[0]) : null;
}

export async function listAuthUsers(limit = 200): Promise<AuthUser[]> {
  const rows = await selectSupabaseRows<AppUserRow>("app_users", {
    orderBy: {
      column: "created_at_ms",
      ascending: true,
    },
    limit: Math.max(1, Math.min(5000, Math.floor(limit))),
  });
  return rows.map(toAuthUser);
}

export async function createAuthUser(input: {
  id?: string;
  loginId?: string;
  email?: string;
  displayName?: string;
  passwordHash?: string;
  role?: AuthRole;
  isActive?: boolean;
}): Promise<AuthUser> {
  const normalizedEmail = normalizeEmail(input.email || "");
  const normalizedLoginId = normalizeLoginId(input.loginId || normalizedEmail);
  if (!normalizedLoginId) {
    throw new Error("아이디가 필요합니다.");
  }

  const email = normalizedEmail || toDerivedEmail(normalizedLoginId);
  const existingByLoginId = await getAuthUserByLoginId(normalizedLoginId);
  if (existingByLoginId) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }
  const existingByEmail = await getAuthUserByEmail(email);
  if (existingByEmail) {
    throw new Error("이미 사용 중인 이메일입니다.");
  }

  const now = Date.now();
  const row: AppUserRow = {
    id: input.id?.trim() || randomUUID(),
    login_id: normalizedLoginId,
    email,
    display_name: normalizeDisplayName(input.displayName || "", normalizedLoginId),
    role: normalizeRole(input.role),
    is_active: input.isActive !== false,
    password_hash: input.passwordHash || "",
    created_at_ms: now,
    updated_at_ms: now,
  };

  try {
    const inserted = await insertSupabaseRows<AppUserRow>("app_users", [row]);
    return cacheResolvedAuthUserById(row.id, toAuthUser(inserted[0] || row));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    if (isMissingAuthColumnError(error, "login_id") || isMissingAuthColumnError(error, "display_name") || isMissingAuthColumnError(error, "role") || isMissingAuthColumnError(error, "is_active")) {
      const legacyRow = {
        id: row.id,
        email: row.email,
        password_hash: row.password_hash,
        created_at_ms: row.created_at_ms,
        updated_at_ms: row.updated_at_ms,
      };
      const inserted = await insertSupabaseRows<AppUserRow>("app_users", [legacyRow]);
      return cacheResolvedAuthUserById(
        row.id,
        toAuthUser(
          inserted[0] ||
            ({
              ...legacyRow,
              login_id: normalizedLoginId,
              display_name: row.display_name,
              role: row.role,
              is_active: row.is_active,
            } as AppUserRow)
        )
      );
    }
    if (normalized.includes("login_id")) {
      throw new Error("이미 사용 중인 아이디입니다.");
    }
    if (normalized.includes("duplicate") || normalized.includes("unique") || normalized.includes("email")) {
      throw new Error("이미 사용 중인 이메일입니다.");
    }
    throw error;
  }
}

export async function updateAuthUser(input: {
  id: string;
  displayName?: string;
  passwordHash?: string;
  role?: AuthRole;
  isActive?: boolean;
}): Promise<AuthUser | null> {
  const safeId = input.id.trim();
  if (!safeId) return null;
  invalidateCachedAuthUser(safeId);
  const current = await getAuthUserById(safeId);
  if (!current) return null;

  const patch: Record<string, unknown> = {
    updated_at_ms: Date.now(),
  };
  if (typeof input.displayName === "string") {
    patch.display_name = normalizeDisplayName(input.displayName, current.loginId);
  }
  if (typeof input.passwordHash === "string") {
    patch.password_hash = input.passwordHash;
  }
  if (typeof input.role === "string") {
    patch.role = normalizeRole(input.role);
  }
  if (typeof input.isActive === "boolean") {
    patch.is_active = input.isActive;
  }

  try {
    const rows = await updateSupabaseRows<AppUserRow>(
      "app_users",
      {
        id: safeId,
      },
      patch
    );
    return rows[0] ? setCachedAuthUserById(safeId, toAuthUser(rows[0])) : setCachedAuthUserById(safeId, current);
  } catch (error) {
    if (
      !isMissingAuthColumnError(error, "display_name") &&
      !isMissingAuthColumnError(error, "role") &&
      !isMissingAuthColumnError(error, "is_active")
    ) {
      throw error;
    }
    const legacyPatch: Record<string, unknown> = {
      updated_at_ms: Date.now(),
    };
    if (typeof input.passwordHash === "string") {
      legacyPatch.password_hash = input.passwordHash;
    }
    const rows = await updateSupabaseRows<AppUserRow>(
      "app_users",
      {
        id: safeId,
      },
      legacyPatch
    );
    return rows[0] ? setCachedAuthUserById(safeId, toAuthUser(rows[0])) : setCachedAuthUserById(safeId, current);
  }
}

export async function findOrCreateAuthUserByEmail(email: string): Promise<AuthUser> {
  const existing = await getAuthUserByEmail(email);
  if (existing) return existing;
  return createAuthUser({
    loginId: normalizeLoginId(email),
    email,
    passwordHash: "",
  });
}

export async function findOrCreateAuthUserByEmailWithStatus(
  email: string
): Promise<{ user: AuthUser; isNewUser: boolean }> {
  const existing = await getAuthUserByEmail(email);
  if (existing) {
    return { user: existing, isNewUser: false };
  }
  const created = await createAuthUser({
    loginId: normalizeLoginId(email),
    email,
    passwordHash: "",
  });
  return { user: created, isNewUser: true };
}
