import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { resolveCodexHomeDirForMarkers } from "./codex-local";

function snapshotEnv() {
  return {
    CODEX_HOME: process.env.CODEX_HOME,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    HOMEDRIVE: process.env.HOMEDRIVE,
    HOMEPATH: process.env.HOMEPATH,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  };
}

function restoreEnv(snapshot: ReturnType<typeof snapshotEnv>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === "string") {
      process.env[key] = value;
      continue;
    }
    delete process.env[key];
  }
}

test("resolveCodexHomeDirForMarkers falls back to the default home when explicit CODEX_HOME has no auth marker", async () => {
  const snapshot = snapshotEnv();
  const tempRoot = await mkdtemp(join(tmpdir(), "codex-home-fallback-"));
  try {
    const explicitCodexHome = join(tempRoot, "explicit-codex-home");
    const fakeHome = join(tempRoot, "fake-home");
    const defaultCodexHome = join(fakeHome, ".codex");
    await mkdir(explicitCodexHome, { recursive: true });
    await mkdir(defaultCodexHome, { recursive: true });
    await writeFile(join(defaultCodexHome, "auth.json"), "{}\n", "utf8");

    process.env.CODEX_HOME = explicitCodexHome;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.HOMEDRIVE;
    delete process.env.HOMEPATH;
    delete process.env.XDG_CONFIG_HOME;

    const resolvedHome = await resolveCodexHomeDirForMarkers(["auth.json"]);
    assert.equal(resolve(resolvedHome), resolve(defaultCodexHome));
  } finally {
    restoreEnv(snapshot);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("resolveCodexHomeDirForMarkers keeps an explicit CODEX_HOME when it already has the required marker", async () => {
  const snapshot = snapshotEnv();
  const tempRoot = await mkdtemp(join(tmpdir(), "codex-home-explicit-"));
  try {
    const explicitCodexHome = join(tempRoot, "explicit-codex-home");
    const fakeHome = join(tempRoot, "fake-home");
    const defaultCodexHome = join(fakeHome, ".codex");
    await mkdir(explicitCodexHome, { recursive: true });
    await mkdir(defaultCodexHome, { recursive: true });
    await writeFile(join(explicitCodexHome, "auth.json"), "{}\n", "utf8");
    await writeFile(join(defaultCodexHome, "auth.json"), "{}\n", "utf8");

    process.env.CODEX_HOME = explicitCodexHome;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.HOMEDRIVE;
    delete process.env.HOMEPATH;
    delete process.env.XDG_CONFIG_HOME;

    const resolvedHome = await resolveCodexHomeDirForMarkers(["auth.json"]);
    assert.equal(resolve(resolvedHome), resolve(explicitCodexHome));
  } finally {
    restoreEnv(snapshot);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
