import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line) || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local"), ...process.env };
const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const localPostgresUrl = env.LOCAL_POSTGRES_URL || "";
const localStorageRoot = resolve(env.LOCAL_STORAGE_ROOT || "D:/Shorts_Maker_Local/storage");
const localPublicBaseUrl = (env.LOCAL_STORAGE_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for sync");
if (!localPostgresUrl) throw new Error("LOCAL_POSTGRES_URL is required for sync");

const restHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

const tables = [
  { name: "app_users", conflict: ["id"] },
  { name: "youtube_accounts", conflict: ["user_id", "channel_id"] },
  { name: "publish_customers", conflict: ["user_id", "customer_key"] },
  { name: "publish_jobs", conflict: ["id"] },
  { name: "video_assets", conflict: ["id"] },
  { name: "video_asset_snapshots", conflict: ["asset_id"] },
  { name: "workflow_telemetry_events", conflict: ["id"] },
  { name: "app_cache_entries", conflict: ["scope", "user_scope", "cache_key"] },
  { name: "billing_wallets", conflict: ["user_id"] },
  { name: "billing_ledger_entries", conflict: ["id"] },
  { name: "studio_media_assets", conflict: ["user_id", "id"] },
  { name: "audit_logs", conflict: ["id"] },
  { name: "app_user_category_access_policies", conflict: ["user_id"] },
  { name: "app_user_category_permissions", conflict: ["user_id", "category_key"] },
  { name: "publish_category_versions", conflict: ["id"] },
];

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`invalid identifier: ${value}`);
  return `"${value}"`;
}

function encodeLocalStorageUrl(bucket, path) {
  return `${localPublicBaseUrl}/api/local-storage/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function rewriteStorageUrl(value) {
  if (typeof value !== "string") return value;
  const prefix = `${supabaseUrl}/storage/v1/object/public/`;
  if (!value.startsWith(prefix)) return value;
  const rest = value.slice(prefix.length).split("?")[0].split("#")[0];
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) return value;
  const bucket = decodeURIComponent(rest.slice(0, slashIndex));
  const path = rest
    .slice(slashIndex + 1)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  return encodeLocalStorageUrl(bucket, path);
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = rewriteStorageUrl(value);
  }
  if (out.email && !out.login_id) out.login_id = String(out.email).toLowerCase();
  if (out.email && !out.display_name) out.display_name = out.login_id;
  if (!out.role && "password_hash" in out) out.role = "member";
  if (typeof out.is_active === "undefined" && "password_hash" in out) out.is_active = true;
  return out;
}

function toQueryValue(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
}

async function fetchTableRows(table) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, { headers: restHeaders });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`fetch ${table}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(normalizeRow);
}

async function upsertRows(pool, table, conflict, rows) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const values = columns.map((column) => toQueryValue(row[column]));
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const updates = columns
      .filter((column) => !conflict.includes(column))
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(", ");
    const sql = `insert into public.${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) values (${placeholders}) on conflict (${conflict.map(quoteIdentifier).join(", ")}) ${
      updates ? `do update set ${updates}` : "do nothing"
    }`;
    await pool.query(sql, values);
  }
}

async function listStorage(prefix = "") {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/video-assets`, {
      method: "POST",
      headers: { ...restHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!response.ok) throw new Error(`list storage ${prefix}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

async function walkStorage(prefix = "") {
  const rows = await listStorage(prefix);
  const files = [];
  for (const row of rows) {
    const path = prefix ? `${prefix}/${row.name}` : row.name;
    if (row.id && row.metadata) files.push({ ...row, path });
    else files.push(...(await walkStorage(path)));
  }
  return files;
}

async function downloadStorageFile(file) {
  const target = resolve(localStorageRoot, "video-assets", ...file.path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  if (existsSync(target) && statSync(target).size === Number(file.metadata?.size || 0)) return false;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/video-assets/${file.path}`, { headers: restHeaders });
  if (!response.ok) throw new Error(`download ${file.path}: ${response.status} ${await response.text()}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(target, buffer);
  return true;
}

function findLatestShortsBackup() {
  const root = "D:/Shorts_Maker_Backups";
  if (!existsSync(root)) return null;
  const candidates = readdirSync(root)
    .filter((name) => name.startsWith("supabase-video-assets-shorts-"))
    .map((name) => resolve(root, name))
    .filter((path) => existsSync(join(path, "shorts")));
  candidates.sort();
  return candidates.at(-1) || null;
}

async function copyDirectoryFiles(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  await mkdir(targetDir, { recursive: true });
  for (const name of readdirSync(sourceDir)) {
    const source = join(sourceDir, name);
    const target = join(targetDir, name);
    const sourceStat = statSync(source);
    if (sourceStat.isDirectory()) {
      const nested = await copyDirectoryFiles(source, target);
      count += nested.count;
      bytes += nested.bytes;
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if (!existsSync(target) || statSync(target).size !== sourceStat.size) {
      await copyFile(source, target);
    }
    count += 1;
    bytes += sourceStat.size;
  }
  return { count, bytes };
}

const pool = new Pool({ connectionString: localPostgresUrl });

try {
  for (const table of tables) {
    const rows = await fetchTableRows(table.name);
    await upsertRows(pool, table.name, table.conflict, rows);
    console.log(`table=${table.name} rows=${rows.length}`);
  }

  mkdirSync(resolve(localStorageRoot, "video-assets"), { recursive: true });
  const files = await walkStorage("");
  let downloaded = 0;
  let remoteBytes = 0;
  for (const file of files) {
    remoteBytes += Number(file.metadata?.size || 0);
    if (await downloadStorageFile(file)) downloaded += 1;
  }
  console.log(`remote_storage_files=${files.length}`);
  console.log(`remote_storage_bytes=${remoteBytes}`);
  console.log(`remote_storage_downloaded=${downloaded}`);

  const backup = findLatestShortsBackup();
  if (backup) {
    const copied = await copyDirectoryFiles(join(backup, "shorts"), resolve(localStorageRoot, "video-assets", "shorts"));
    console.log(`shorts_backup=${backup}`);
    console.log(`shorts_backup_files=${copied.count}`);
    console.log(`shorts_backup_bytes=${copied.bytes}`);
  }

  const checksum = createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
  console.log(`sync_complete=${checksum}`);
} finally {
  await pool.end();
}
