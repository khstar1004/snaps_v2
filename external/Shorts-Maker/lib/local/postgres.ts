import { createRequire } from "node:module";
import { Pool } from "pg";
import type { SupabaseFilterValue, SupabaseFilters, SupabaseOrder } from "@/lib/supabase/server";

let pool: Pool | null = null;
let envLoadAttempted = false;
const require = createRequire(import.meta.url);

function ensureLocalEnvLoaded(): void {
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

function getLocalPostgresUrl(): string {
  ensureLocalEnvLoaded();
  return (process.env.LOCAL_POSTGRES_URL || process.env.DATABASE_URL || "").trim();
}

export function hasLocalPostgresConfig(): boolean {
  if (process.env.NODE_ENV === "test" && process.env.LOCAL_POSTGRES_ENABLE_IN_TESTS !== "1") {
    return false;
  }
  return Boolean(getLocalPostgresUrl());
}

function getPool(): Pool {
  const connectionString = getLocalPostgresUrl();
  if (!connectionString) {
    throw new Error("LOCAL_POSTGRES_URL is required");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
    });
  }
  return pool;
}

function quoteIdentifier(value: string): string {
  const safe = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safe)) {
    throw new Error(`invalid SQL identifier: ${value}`);
  }
  return `"${safe.replace(/"/g, '""')}"`;
}

function quoteTableName(value: string): string {
  const parts = value.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) return `"public".${quoteIdentifier(parts[0])}`;
  if (parts.length === 2) return `${quoteIdentifier(parts[0])}.${quoteIdentifier(parts[1])}`;
  throw new Error(`invalid table name: ${value}`);
}

function normalizeSelect(value?: string): string {
  const safe = (value || "*").trim();
  if (!safe || safe === "*") return "*";
  return safe
    .split(",")
    .map((column) => quoteIdentifier(column.trim()))
    .join(", ");
}

function filterValue(input: SupabaseFilterValue): { op: string; value: unknown } {
  if (typeof input === "object" && input !== null && "op" in input) {
    return { op: input.op, value: input.value };
  }
  if (input === null) {
    return { op: "is", value: null };
  }
  return { op: "eq", value: input };
}

function buildWhere(filters: SupabaseFilters | undefined, values: unknown[]): string {
  if (!filters) return "";
  const clauses: string[] = [];
  for (const [column, rawValue] of Object.entries(filters)) {
    if (typeof rawValue === "undefined") continue;
    const { op, value } = filterValue(rawValue);
    const quotedColumn = quoteIdentifier(column);
    if (op === "is") {
      clauses.push(value === null ? `${quotedColumn} is null` : `${quotedColumn} is not null`);
      continue;
    }
    const operator = op === "lt" ? "<" : op === "lte" ? "<=" : op === "gt" ? ">" : op === "gte" ? ">=" : "=";
    values.push(toQueryValue(value));
    clauses.push(`${quotedColumn} ${operator} $${values.length}`);
  }
  return clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "";
}

function buildOrder(orderBy?: SupabaseOrder): string {
  if (!orderBy?.column) return "";
  const direction = orderBy.ascending ? "asc" : "desc";
  const nulls = orderBy.nullsFirst ? " nulls first" : "";
  return ` order by ${quoteIdentifier(orderBy.column)} ${direction}${nulls}`;
}

function buildLimit(limit?: number): string {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return "";
  return ` limit ${Math.max(0, Math.floor(limit))}`;
}

function toQueryValue(value: unknown): unknown {
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function normalizeConflictColumns(input: string | string[]): string[] {
  const columns = Array.isArray(input) ? input : input.split(",");
  return columns.map((column) => column.trim()).filter(Boolean);
}

async function queryRows<T>(sql: string, values: unknown[]): Promise<T[]> {
  const result = await getPool().query(sql, values);
  return result.rows as T[];
}

export async function selectLocalRows<T>(
  table: string,
  options?: {
    select?: string;
    filters?: SupabaseFilters;
    orderBy?: SupabaseOrder;
    limit?: number;
  }
): Promise<T[]> {
  const values: unknown[] = [];
  const sql = [
    `select ${normalizeSelect(options?.select)} from ${quoteTableName(table)}`,
    buildWhere(options?.filters, values),
    buildOrder(options?.orderBy),
    buildLimit(options?.limit),
  ].join("");
  return queryRows<T>(sql, values);
}

export async function insertLocalRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options?: {
    returning?: boolean;
    ignoreDuplicates?: boolean;
    onConflict?: string | string[];
  }
): Promise<T[]> {
  if (rows.length <= 0) return [];
  const columns = Object.keys(rows[0]);
  const values: unknown[] = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = columns.map((column) => {
      values.push(toQueryValue(row[column]));
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const conflictColumns = options?.onConflict ? normalizeConflictColumns(options.onConflict) : [];
  const conflictSql =
    options?.ignoreDuplicates && conflictColumns.length > 0
      ? ` on conflict (${conflictColumns.map(quoteIdentifier).join(", ")}) do nothing`
      : "";
  const returningSql = options?.returning === false ? "" : " returning *";
  return queryRows<T>(
    `insert into ${quoteTableName(table)} (${quotedColumns}) values ${placeholders.join(", ")}${conflictSql}${returningSql}`,
    values
  );
}

export async function tryInsertLocalRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options?: {
    returning?: boolean;
    onConflict?: string | string[];
  }
): Promise<T[] | null> {
  try {
    return await insertLocalRows<T>(table, rows, options);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return null;
    throw error;
  }
}

export async function upsertLocalRows<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  options: {
    onConflict: string | string[];
    returning?: boolean;
  }
): Promise<T[]> {
  if (rows.length <= 0) return [];
  const columns = Object.keys(rows[0]);
  const conflictColumns = normalizeConflictColumns(options.onConflict);
  const values: unknown[] = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = columns.map((column) => {
      values.push(toQueryValue(row[column]));
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const updateSql =
    updateColumns.length > 0
      ? ` do update set ${updateColumns
          .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
          .join(", ")}`
      : " do nothing";
  const returningSql = options.returning === false ? "" : " returning *";
  return queryRows<T>(
    `insert into ${quoteTableName(table)} (${columns.map(quoteIdentifier).join(", ")}) values ${placeholders.join(
      ", "
    )} on conflict (${conflictColumns.map(quoteIdentifier).join(", ")})${updateSql}${returningSql}`,
    values
  );
}

export async function updateLocalRows<T>(
  table: string,
  filters: SupabaseFilters,
  patch: Record<string, unknown>,
  options?: {
    returning?: boolean;
  }
): Promise<T[]> {
  const entries = Object.entries(patch);
  if (entries.length <= 0) return [];
  const values: unknown[] = [];
  const setSql = entries
    .map(([column, value]) => {
      values.push(toQueryValue(value));
      return `${quoteIdentifier(column)} = $${values.length}`;
    })
    .join(", ");
  const whereSql = buildWhere(filters, values);
  const returningSql = options?.returning === false ? "" : " returning *";
  return queryRows<T>(`update ${quoteTableName(table)} set ${setSql}${whereSql}${returningSql}`, values);
}

export async function deleteLocalRows(table: string, filters: SupabaseFilters): Promise<void> {
  const values: unknown[] = [];
  await getPool().query(`delete from ${quoteTableName(table)}${buildWhere(filters, values)}`, values);
}
