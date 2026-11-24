import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const containerName = process.env.LOCAL_POSTGRES_CONTAINER || "shorts-maker-postgres";
const image = process.env.LOCAL_POSTGRES_IMAGE || "postgres:17-alpine";
const dataDir = resolve(process.env.LOCAL_POSTGRES_DATA_DIR || "D:/Shorts_Maker_Local/postgres-data");
const storageDir = resolve(process.env.LOCAL_STORAGE_ROOT || "D:/Shorts_Maker_Local/storage");
const port = process.env.LOCAL_POSTGRES_PORT || "54329";
const database = process.env.LOCAL_POSTGRES_DB || "shorts_maker";
const user = process.env.LOCAL_POSTGRES_USER || "shorts_maker";
const password = process.env.LOCAL_POSTGRES_PASSWORD || "shorts_maker_local";
const schemaPath = resolve("scripts/local-postgres-schema.sql");
const envLocalPath = resolve(".env.local");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }
  return (result.stdout || "").trim();
}

function containerExists() {
  const result = spawnSync("docker", ["inspect", containerName], { stdio: "ignore" });
  return result.status === 0;
}

function containerRunning() {
  if (!containerExists()) return false;
  return run("docker", ["inspect", "-f", "{{.State.Running}}", containerName]) === "true";
}

async function waitForPostgres() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", user, "-d", database], {
      stdio: "ignore",
    });
    if (result.status === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error("local Postgres did not become ready within 60 seconds");
}

async function execPsql(sql) {
  await new Promise((resolveExec, reject) => {
    const child = spawn("docker", ["exec", "-i", containerName, "psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveExec(stdout);
      else reject(new Error(`psql failed\n${stdout}\n${stderr}`));
    });
    child.stdin.end(sql);
  });
}

function writeEnvLocal() {
  const localUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/${database}`;
  const lines = [
    "",
    "# Local fallback database/storage. Remove or comment these to use Supabase again.",
    `LOCAL_POSTGRES_URL=${localUrl}`,
    `LOCAL_STORAGE_ROOT=${storageDir.replace(/\\/g, "/")}`,
    "LOCAL_STORAGE_PUBLIC_BASE_URL=http://localhost:3000",
  ];
  const current = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : "";
  const withoutOldBlock = current
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("LOCAL_POSTGRES_URL=") &&
        !line.startsWith("LOCAL_STORAGE_ROOT=") &&
        !line.startsWith("LOCAL_STORAGE_PUBLIC_BASE_URL=") &&
        !line.startsWith("# Local fallback database/storage.")
    )
    .join("\n")
    .trimEnd();
  writeFileSync(envLocalPath, `${withoutOldBlock}${lines.join("\n")}\n`);
}

mkdirSync(dataDir, { recursive: true });
mkdirSync(storageDir, { recursive: true });
mkdirSync(dirname(envLocalPath), { recursive: true });

console.log(`data_dir=${dataDir}`);
console.log(`storage_dir=${storageDir}`);

run("docker", ["pull", image], { stdio: "inherit" });

if (!containerExists()) {
  run(
    "docker",
    [
      "run",
      "--name",
      containerName,
      "-e",
      `POSTGRES_DB=${database}`,
      "-e",
      `POSTGRES_USER=${user}`,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-p",
      `${port}:5432`,
      "-v",
      `${dataDir.replace(/\\/g, "/")}:/var/lib/postgresql/data`,
      "-d",
      image,
    ],
    { stdio: "inherit" }
  );
} else if (!containerRunning()) {
  run("docker", ["start", containerName], { stdio: "inherit" });
}

await waitForPostgres();
await execPsql(readFileSync(schemaPath, "utf8"));
writeEnvLocal();

console.log(`container=${containerName}`);
console.log(`local_postgres_url=postgresql://${user}:<redacted>@localhost:${port}/${database}`);
console.log(`env_file=${envLocalPath}`);
console.log("status=ready");
