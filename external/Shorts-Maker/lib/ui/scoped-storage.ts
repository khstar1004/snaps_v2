import { AUTH_CLIENT_SCOPE_COOKIE } from "@/lib/auth/constants";

function readCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(prefix.length)).trim();
  } catch {
    return match.slice(prefix.length).trim();
  }
}

export function getClientWorkspaceScope(): string {
  const scope = readCookieValue(AUTH_CLIENT_SCOPE_COOKIE);
  return scope || "anonymous";
}

export function getScopedStorageKey(baseKey: string): string {
  return `${baseKey}:${getClientWorkspaceScope()}`;
}

export function readScopedStorage(baseKey: string, area?: Storage): string | null {
  if (typeof window === "undefined") return null;
  return (area || window.localStorage).getItem(getScopedStorageKey(baseKey));
}

export function writeScopedStorage(baseKey: string, value: string, area?: Storage): void {
  if (typeof window === "undefined") return;
  (area || window.localStorage).setItem(getScopedStorageKey(baseKey), value);
}

export function removeScopedStorage(baseKey: string, area?: Storage): void {
  if (typeof window === "undefined") return;
  (area || window.localStorage).removeItem(getScopedStorageKey(baseKey));
}
