import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  INITIAL_STUDIO_AUTOSAVE_STATE,
  createHydratedStudioAutosaveState,
  markStudioAutosavePending,
  resolveStudioAutosavePresentation,
  resolveStudioAutosaveWriteFailure,
  resolveStudioAutosaveWriteSuccess,
  shouldInterceptStudioAutosaveNavigation,
} from "./studio-autosave-status";

test("autosave hydration uses authoritative stored timestamps only", () => {
  assert.equal(createHydratedStudioAutosaveState(0).status, "ready");
  const hydrated = createHydratedStudioAutosaveState(1_000);
  assert.equal(hydrated.status, "saved");
  assert.equal(hydrated.savedAtMs, 1_000);
});

test("autosave success only marks the latest pending version saved", () => {
  const saving = markStudioAutosavePending(INITIAL_STUDIO_AUTOSAVE_STATE, 2);
  const stale = resolveStudioAutosaveWriteSuccess({
    current: saving,
    writeVersion: 1,
    latestVersion: 2,
    savedAtMs: 5_000,
  });
  assert.equal(stale.status, "saving");
  assert.equal(stale.savedAtMs, 0);

  const saved = resolveStudioAutosaveWriteSuccess({
    current: stale,
    writeVersion: 2,
    latestVersion: 2,
    savedAtMs: 6_000,
  });
  assert.equal(saved.status, "saved");
  assert.equal(saved.savedAtMs, 6_000);
  assert.equal(saved.savedVersion, 2);
});

test("autosave failure keeps the pending version retryable", () => {
  const saving = markStudioAutosavePending(INITIAL_STUDIO_AUTOSAVE_STATE, 3);
  const failed = resolveStudioAutosaveWriteFailure({
    current: saving,
    pendingVersion: 3,
    error: new Error("quota"),
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.pendingVersion, 3);
  assert.equal(resolveStudioAutosavePresentation(failed).canRetry, true);
});

test("autosave presentation covers ready saving saved and error", () => {
  assert.deepEqual(resolveStudioAutosavePresentation(createHydratedStudioAutosaveState(0)), {
    label: "자동 저장 준비됨",
    tone: "neutral",
    canRetry: false,
  });
  assert.deepEqual(resolveStudioAutosavePresentation(markStudioAutosavePending(INITIAL_STUDIO_AUTOSAVE_STATE, 1)), {
    label: "자동 저장 중",
    tone: "saving",
    canRetry: false,
  });
  assert.match(resolveStudioAutosavePresentation(createHydratedStudioAutosaveState(1_000)).label, /^자동 저장됨/);
});

test("internal same-origin navigation with pending autosave is intercepted", () => {
  assert.equal(
    shouldInterceptStudioAutosaveNavigation({
      hasPendingDraft: true,
      origin: "https://example.test",
      currentPathname: "/shorts-json-studio",
      currentSearch: "",
      href: "https://example.test/projects/new",
      button: 0,
    }),
    true
  );
  assert.equal(
    shouldInterceptStudioAutosaveNavigation({
      hasPendingDraft: true,
      origin: "https://example.test",
      currentPathname: "/shorts-json-studio",
      currentSearch: "",
      href: "https://elsewhere.test/projects/new",
      button: 0,
    }),
    false
  );
  assert.equal(
    shouldInterceptStudioAutosaveNavigation({
      hasPendingDraft: true,
      origin: "https://example.test",
      currentPathname: "/shorts-json-studio",
      currentSearch: "",
      href: "https://example.test/shorts-json-studio#stage",
      button: 0,
    }),
    false
  );
  assert.equal(
    shouldInterceptStudioAutosaveNavigation({
      hasPendingDraft: true,
      origin: "https://example.test",
      currentPathname: "/shorts-json-studio",
      currentSearch: "",
      href: "https://example.test/projects/new",
      button: 0,
      ctrlKey: true,
    }),
    false
  );
});

test("local storage sync source flushes before cross-category hydration and blocks failed SPA navigation", () => {
  const source = readFileSync(new URL("./use-studio-local-storage-sync.ts", import.meta.url), "utf8");
  const hydrationGuardIndex = source.indexOf("if (!flushBeforeCategoryHydration(targetCategory)) return;");
  const readDraftIndex = source.indexOf("const parsed = readStoredStudioDraft(targetCategory);");
  assert.ok(hydrationGuardIndex >= 0, "hydrateDraftForCategory should guard with a pending flush");
  assert.ok(readDraftIndex > hydrationGuardIndex, "draft read/hydration must happen after the flush guard");

  assert.match(source, /setPublishCategory\(pendingCategory\);/);
  assert.match(source, /if \(flushPendingDraftPersist\(\)\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/s);
});
