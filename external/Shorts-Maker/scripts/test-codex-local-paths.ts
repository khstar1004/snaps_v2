import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCodexHomeDirCandidates, resolveCodexHomeDirForMarkers } from "@/lib/auth/codex-local";

async function withPatchedEnv(
  overrides: Record<string, string | undefined>,
  callback: () => Promise<void>
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("falls back to the default Codex home when the configured CODEX_HOME is empty", async () => {
  const sandboxRoot = await mkdtemp(join(tmpdir(), "codex-local-fallback-"));
  const explicitHome = join(sandboxRoot, "project-codex-home");
  const fakeUserProfile = join(sandboxRoot, "user-profile");
  const fallbackHome = join(fakeUserProfile, ".codex");
  await mkdir(explicitHome, { recursive: true });
  await mkdir(fallbackHome, { recursive: true });
  await writeFile(join(fallbackHome, "auth.json"), "{\n  \"auth_mode\": \"chatgpt\"\n}\n", "utf8");

  try {
    await withPatchedEnv(
      {
        CODEX_HOME: explicitHome,
        USERPROFILE: fakeUserProfile,
        HOME: fakeUserProfile,
        XDG_CONFIG_HOME: undefined,
      },
      async () => {
        const candidates = getCodexHomeDirCandidates();
        assert.equal(candidates[0], explicitHome);
        assert.equal(candidates[1], fallbackHome);

        const resolved = await resolveCodexHomeDirForMarkers(["auth.json"]);
        assert.equal(resolved, fallbackHome);
      }
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("keeps the configured CODEX_HOME when it already contains auth.json", async () => {
  const sandboxRoot = await mkdtemp(join(tmpdir(), "codex-local-explicit-"));
  const explicitHome = join(sandboxRoot, "project-codex-home");
  const fakeUserProfile = join(sandboxRoot, "user-profile");
  const fallbackHome = join(fakeUserProfile, ".codex");
  await mkdir(explicitHome, { recursive: true });
  await mkdir(fallbackHome, { recursive: true });
  await writeFile(join(explicitHome, "auth.json"), "{\n  \"auth_mode\": \"chatgpt\"\n}\n", "utf8");
  await writeFile(join(fallbackHome, "auth.json"), "{\n  \"auth_mode\": \"chatgpt\"\n}\n", "utf8");

  try {
    await withPatchedEnv(
      {
        CODEX_HOME: explicitHome,
        USERPROFILE: fakeUserProfile,
        HOME: fakeUserProfile,
        XDG_CONFIG_HOME: undefined,
      },
      async () => {
        const resolved = await resolveCodexHomeDirForMarkers(["auth.json"]);
        assert.equal(resolved, explicitHome);
      }
    );
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
