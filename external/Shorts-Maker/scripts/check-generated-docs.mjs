import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GENERATED_DOC_PATHS = ["docs/developer-map.json", "docs/environment-map.json"];
const generateDocsScriptPath = fileURLToPath(new URL("./generate-developer-docs.mjs", import.meta.url));

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function runCommandForText(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status);
  }

  return result.stdout ?? "";
}

function runCommandResult(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
  });
}

runCommand(process.execPath, [generateDocsScriptPath]);

for (const relativePath of GENERATED_DOC_PATHS) {
  const trackedResult = runCommandResult("git", ["ls-files", "--error-unmatch", "--", relativePath]);
  if (trackedResult.status !== 0) {
    process.stderr.write(trackedResult.stderr ?? "");
    console.error(`[docs:check] Generated doc is not tracked by git: ${relativePath}`);
    process.exit(1);
  }
}

const diffResult = runCommandResult("git", ["diff", "--ignore-cr-at-eol", "--quiet", "--", ...GENERATED_DOC_PATHS]);
if (diffResult.status !== 0) {
  const changedFiles = runCommandForText("git", ["diff", "--ignore-cr-at-eol", "--name-only", "--", ...GENERATED_DOC_PATHS]);
  console.error("[docs:check] Generated docs differ from the git-tracked state.");
  process.stderr.write(changedFiles);
  console.error("[docs:check] Run `npm run docs:refresh` and commit any updated or newly added JSON files.");
  process.exit(1);
}

console.log("[docs:check] Generated docs are in sync.");
