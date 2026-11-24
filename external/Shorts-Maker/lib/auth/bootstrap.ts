import { deriveLocalDevelopmentPassword } from "@/lib/auth/dev-secrets";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createAuthUser, getAuthUserById, getAuthUserByLoginId, normalizeLoginId, updateAuthUser } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";

export const SHARED_LIBRARY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SHARED_LIBRARY_LOGIN_ID = "_shared_library";
const SHARED_LIBRARY_EMAIL = "shared-library@system.local";
const LEGACY_DEFAULT_DEV_ADMIN_PASSWORD = "admin1234!";

let hasLoggedDevelopmentBootstrapAdmin = false;

function isProduction(): boolean {
  return (process.env.NODE_ENV || "").trim() === "production";
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveBootstrapAdminConfig():
  | {
      loginId: string;
      password: string;
      displayName: string;
      email: string;
      source: "explicit" | "derived-dev-default";
    }
  | null {
  const loginId = (process.env.AUTH_BOOTSTRAP_ADMIN_LOGIN_ID || "").trim();
  const password = (process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || "").trim();
  const displayName = (process.env.AUTH_BOOTSTRAP_ADMIN_NAME || "관리자").trim() || "관리자";
  const email = (process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL || "").trim();

  if (loginId && password) {
    return {
      loginId,
      password,
      displayName,
      email: email || `${loginId}@local.user`,
      source: "explicit",
    };
  }

  if (!isProduction()) {
    const derivedPassword = deriveLocalDevelopmentPassword("bootstrap-admin");
    if (!hasLoggedDevelopmentBootstrapAdmin) {
      console.warn(
        `[auth] Using local derived development bootstrap admin credentials: loginId="admin" password="${derivedPassword}". ` +
          `Set AUTH_BOOTSTRAP_ADMIN_LOGIN_ID and AUTH_BOOTSTRAP_ADMIN_PASSWORD to override.`
      );
      hasLoggedDevelopmentBootstrapAdmin = true;
    }
    return {
      loginId: "admin",
      password: derivedPassword,
      displayName,
      email: email || "admin@local.user",
      source: "derived-dev-default",
    };
  }

  return null;
}

export function getBootstrapAdminLoginId(): string {
  const config = resolveBootstrapAdminConfig();
  return config ? normalizeLoginId(config.loginId) : "";
}

export function shouldAutoBootstrapAdminOnLogin(): boolean {
  if (isTruthyEnvFlag(process.env.AUTH_BOOTSTRAP_ADMIN_SYNC_ON_LOGIN)) {
    return true;
  }
  const config = resolveBootstrapAdminConfig();
  return config?.source === "derived-dev-default";
}

export async function ensureSharedLibraryUser(): Promise<AuthUser> {
  const existing =
    (await getAuthUserById(SHARED_LIBRARY_USER_ID)) ||
    (await getAuthUserByLoginId(SHARED_LIBRARY_LOGIN_ID));
  if (existing) return existing;
  return createAuthUser({
    id: SHARED_LIBRARY_USER_ID,
    loginId: SHARED_LIBRARY_LOGIN_ID,
    email: SHARED_LIBRARY_EMAIL,
    displayName: "공유 라이브러리",
    passwordHash: "",
    role: "system",
    isActive: false,
  });
}

export async function ensureBootstrapAdminUser(options?: { syncPassword?: boolean }): Promise<AuthUser | null> {
  const config = resolveBootstrapAdminConfig();
  if (!config) return null;

  const existing = await getAuthUserByLoginId(config.loginId);
  if (existing) {
    const shouldSyncPassword = options?.syncPassword === true;
    const shouldRotateLegacyDevelopmentPassword =
      config.source === "derived-dev-default" &&
      Boolean(existing.passwordHash) &&
      (await verifyPassword(LEGACY_DEFAULT_DEV_ADMIN_PASSWORD, existing.passwordHash));
    if (existing.role !== "admin" || !existing.passwordHash || !existing.isActive || shouldRotateLegacyDevelopmentPassword || shouldSyncPassword) {
      return (await updateAuthUser({
        id: existing.id,
        displayName: config.displayName,
        passwordHash:
          !existing.passwordHash || shouldRotateLegacyDevelopmentPassword || shouldSyncPassword
            ? await hashPassword(config.password)
            : existing.passwordHash,
        role: "admin",
        isActive: true,
      })) || existing;
    }
    return existing;
  }

  return createAuthUser({
    loginId: config.loginId,
    email: config.email,
    displayName: config.displayName,
    passwordHash: await hashPassword(config.password),
    role: "admin",
    isActive: true,
  });
}
