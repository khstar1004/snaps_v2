import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.npm_config_dry_run === "true" ||
  process.env.npm_config_dry_run === "1";

const TARGETS = [
  ".next",
  ".next-build-verify",
  ".npm-cache",
  "tsconfig.tsbuildinfo",
  "tmp/codex-imagegen",
  "tmp/codex-imagegen-debug",
  "tmp/codex-imagegen-debug2",
  "tmp/dev-server.log",
];

async function removeTarget(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (isDryRun) {
    console.log(`[clean] would remove ${relativePath}`);
    return;
  }

  await rm(absolutePath, { recursive: true, force: true });
  console.log(`[clean] removed ${relativePath}`);
}

async function main() {
  for (const target of TARGETS) {
    await removeTarget(target);
  }
}

main().catch((error) => {
  console.error(`[clean] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
