import { createRequire } from "node:module";
import {
  deleteLocalRows,
  hasLocalPostgresConfig,
  insertLocalRows,
  selectLocalRows,
  tryInsertLocalRows,
  updateLocalRows,
  upsertLocalRows,
} from "@/lib/local/postgres";

type SupabasePrimitive = string | number | boolean | null;

export type SupabaseFilterValue =
  | SupabasePrimitive
  | {
      op: "eq" | "lt" | "lte" | "gt" | "gte" | "is";
      value: SupabasePrimitive;
    };

export type SupabaseFilters = Record<string, SupabaseFilterValue | undefined>;

export type SupabaseOrder = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
};

type SupabaseServiceRequestInit = RequestInit & {
  duplex?: "half";
};

let envLoadAttempted = false;
const require = createRequire(import.meta.url);

function ensureSupabaseEnvLoaded(): void {
  if (envLoadAttempted) return;
  envLoadAttempted = true;
  try {
    const nextEnv = require("@next/env");
    if (typeof nextEnv?.loadEnvConfig === "function") {
      nextEnv.loadEnvConfig(process.cwd());
    }
  } catch {
    // ignore
  }
}

function getConfiguredSupabaseUrl(): string {
  ensureSupabaseEnvLoaded();
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

function getConfiguredSupabaseServiceRoleKey(): string {
  ensureSupabaseEnvLoaded();
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function hasSupabaseServiceConfig(): boolean {
  return hasLocalPostgresConfig() || hasRemoteSupabaseServiceConfig();
}

export function hasRemoteSupabaseServiceConfig(): boolean {
  if (process.env.NODE_ENV === "test" && process.env.SUPABASE_ENABLE_IN_TESTS !== "1") {
    return false;
  }
  return Boolean(getConfiguredSupabaseUrl() && getConfiguredSupabaseServiceRoleKey());
}

export function requireSupabaseServiceUrl(): string {
  const url = getConfiguredSupabaseUrl();
  if (!url) {
    throw new Error("SUPABASE_URL is required");
  }
  return url;
}

export function requireSupabaseServiceRoleKey(): string {
  const key = getConfiguredSupabaseServiceRoleKey();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }
  return key;
}

function buildSupabaseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const serviceRoleKey = requireSupabaseServiceRoleKey();
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  return headers;
}

function encodeFilterValue(value: SupabasePrimitive): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value;
}

function toFilterExpression(input: SupabaseFilterValue): string {
  if (typeof input === "object" && input !== null && "op" in input) {
    return `${input.op}.${encodeFilterValue(input.value)}`;
  }
  if (input === null) {
    return "is.null";
  }
  return `eq.${encodeFilterValue(input)}`;
}

function buildQueryString(input?: {
  select?: string;
  filters?: SupabaseFilters;
  orderBy?: SupabaseOrder;
  limit?: number;
  onConflict?: string | string[];
}): string {
  const params = new URLSearchParams();
  if (input?.select) {
    params.set("select", input.select);
  }
  if (input?.filters) {
    for (const [key, value] of Object.entries(input.filters)) {
      if (typeof value === "undefined") continue;
      params.set(key, toFilterExpression(value));
    }
  }
  if (input?.orderBy?.column) {
    const direction = input.orderBy.ascending ? "asc" : "desc";
    const nulls = input.orderBy.nullsFirst ? ".nullsfirst" : "";
    params.set("order", `${input.orderBy.column}.${direction}${nulls}`);
  }
  if (typeof input?.limit === "number" && Number.isFinite(input.limit)) {
    params.set("limit", String(Math.max(0, Math.floor(input.limit))));
  }
  if (input?.onConflict) {
    const columns = Array.isArray(input.onConflict) ? input.onConflict : [input.onConflict];
    params.set("on_conflict", columns.map((item) => item.trim()).filter(Boolean).join(","));
  }
  return params.toString();
}

export async function readSupabaseErrorMessage(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  if (!text) {
    return `Supabase request failed (${response.status})`;
  }
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [
      typeof parsed.message === "string" ? parsed.message.trim() : "",
      typeof parsed.error === "string" ? parsed.error.trim() : "",
      typeof parsed.details === "string" ? parsed.details.trim() : "",
      typeof parsed.hint === "string" ? parsed.hint.trim() : "",
    ].filter(Boolean);
    return parts.join(" | ") || text;
  } catch {
    return text;
  }
}

async function parseSupabaseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return [] as unknown as T;
  }
  const text = (await response.text()).trim();
  if (!text) {
    return [] as unknown as T;
  }
  return JSON.parse(text) as T;
}

export async function supabaseServiceFetch(path: string, init?: SupabaseServiceRequestInit): Promise<Response> {
  const requestInit = {
    ...(init || {}),
    headers: buildSupabaseHeaders(init?.headers),
    cache: "no-store",
  } as RequestInit;
  return fetch(`${requireSupabaseServiceUrl()}${path}`, requestInit);
}

export async function selectSupabaseRows<T>(
  table: string,
  options?: {
    select?: string;
    filters?: SupabaseFilters;
    orderBy?: SupabaseOrder;
    limit?: number;
  }
): Promise<T[]> {
  if (hasLocalPostgresConfig()) {
    return selectLocalRows<T>(table, options);
  }
  const query = buildQueryString({
    select: options?.select || "*",
    filters: options?.filters,
    orderBy: options?.orderBy,
    limit: options?.limit,
  });
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return parseSupabaseJsonResponse<T[]>(response);
}

export async function insertSupabaseRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options?: {
    returning?: boolean;
    ignoreDuplicates?: boolean;
    onConflict?: string | string[];
  }
): Promise<T[]> {
  if (rows.length <= 0) return [];
  if (hasLocalPostgresConfig()) {
    return insertLocalRows<T>(table, rows, options);
  }
  const query = buildQueryString({
    onConflict: options?.onConflict,
  });
  const prefer = [
    options?.returning === false ? "return=minimal" : "return=representation",
    options?.ignoreDuplicates ? "resolution=ignore-duplicates" : "",
  ]
    .filter(Boolean)
    .join(",");
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return parseSupabaseJsonResponse<T[]>(response);
}

export async function tryInsertSupabaseRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options?: {
    returning?: boolean;
    onConflict?: string | string[];
  }
): Promise<T[] | null> {
  if (rows.length <= 0) return [];
  if (hasLocalPostgresConfig()) {
    return tryInsertLocalRows<T>(table, rows, options);
  }
  const query = buildQueryString({
    onConflict: options?.onConflict,
  });
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: options?.returning === false ? "return=minimal" : "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (response.status === 409) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return parseSupabaseJsonResponse<T[]>(response);
}

export async function upsertSupabaseRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options: {
    onConflict: string | string[];
    returning?: boolean;
  }
): Promise<T[]> {
  if (rows.length <= 0) return [];
  if (hasLocalPostgresConfig()) {
    return upsertLocalRows<T>(table, rows, options);
  }
  const query = buildQueryString({
    onConflict: options.onConflict,
  });
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: `${options.returning === false ? "return=minimal" : "return=representation"},resolution=merge-duplicates`,
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return parseSupabaseJsonResponse<T[]>(response);
}

export async function updateSupabaseRows<T>(
  table: string,
  filters: SupabaseFilters,
  patch: Record<string, unknown>,
  options?: {
    returning?: boolean;
  }
): Promise<T[]> {
  if (hasLocalPostgresConfig()) {
    return updateLocalRows<T>(table, filters, patch, options);
  }
  const query = buildQueryString({
    filters,
  });
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: options?.returning === false ? "return=minimal" : "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return parseSupabaseJsonResponse<T[]>(response);
}

export async function deleteSupabaseRows(table: string, filters: SupabaseFilters): Promise<void> {
  if (hasLocalPostgresConfig()) {
    await deleteLocalRows(table, filters);
    return;
  }
  const query = buildQueryString({
    filters,
  });
  const response = await supabaseServiceFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
}
