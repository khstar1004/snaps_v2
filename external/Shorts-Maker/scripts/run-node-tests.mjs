import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoots = [
  path.join(projectRoot, "app"),
  path.join(projectRoot, "lib"),
];
const explicitTests = [
  path.join(projectRoot, "scripts", "test-codex-local-paths.ts"),
];

async function collectTests(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTests(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.test\.tsx?$/i.test(entry.name)) continue;
    results.push(fullPath);
  }
  return results;
}

function toRelativePosixPath(targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join("/");
}

async function main() {
  const discoveredTests = [];
  for (const rootDir of testRoots) {
    discoveredTests.push(...(await collectTests(rootDir)));
  }
  const allTests = Array.from(new Set([...discoveredTests, ...explicitTests])).sort();
  if (allTests.length <= 0) {
    console.error("No Node test files were found.");
    process.exit(1);
  }

  const registerCode =
    'import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("./scripts/ts-paths-loader.mjs", pathToFileURL("./"));';
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      `data:text/javascript,${encodeURIComponent(registerCode)}`,
      "--test",
      ...allTests.map(toRelativePosixPath),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
      stdio: "inherit",
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
