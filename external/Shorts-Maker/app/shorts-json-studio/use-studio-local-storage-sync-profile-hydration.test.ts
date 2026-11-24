import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasExplicitDefaultTemplatePresetSnapshot,
  resolveLockedTemplatePresetHydrationPlan,
  resolveStoredEditorPresetHydrationPlan,
  shouldWriteLastPublishCategory,
} from "./use-studio-local-storage-sync";
import { recoverPersistedStudioRenderStatus } from "./studio-operation-recovery";
import type { StudioLayoutPreset, TemplateBranding } from "./types";

function normalizeCategory(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function branding(headerTitle: string): TemplateBranding {
  return {
    variant: "news",
    headerTitle,
    headerColor: "#111111",
    footerColor: "#222222",
    infoLineText: "info",
    fontFamily: "Inter",
    imageRounded: true,
  };
}

test("stored last profile wins over an older editor preset during studio hydration", () => {
  const oldBranding = branding("OLD PROFILE");
  const newBranding = branding("NEW PROFILE");
  const defaultBranding = branding("DEFAULT PROFILE");
  const layoutPreset = {
    publishCategory: "old-profile",
    brandingDraft: oldBranding,
    templateId: "black",
    templateByCategory: {
      "old-profile": {
        templateId: "black",
        templateImageEnabled: true,
      },
      "new-profile": {
        templateId: "fun-caption",
        templateImageEnabled: false,
      },
    },
    brandingByCategory: {
      "old-profile": {
        branding: oldBranding,
        updatedAt: 1,
      },
      "new-profile": {
        branding: newBranding,
        updatedAt: 2,
      },
    },
  } as StudioLayoutPreset;

  const plan = resolveStoredEditorPresetHydrationPlan({
    layoutPreset,
    storedLastPublishCategory: "new-profile",
    publishCategory: "default",
    defaultCategory: "default",
    defaultBrandingByCategory: {
      default: defaultBranding,
      "old-profile": oldBranding,
      "new-profile": defaultBranding,
    },
    normalizeCategory,
  });

  assert.equal(plan.categoryToSelect, "new-profile");
  assert.equal(plan.effectiveCategory, "new-profile");
  assert.deepEqual(plan.brandingPreset?.branding, newBranding);
  assert.deepEqual(plan.presetBrandingOverride, {
    category: "new-profile",
    branding: newBranding,
  });
  assert.deepEqual(plan.templatePresetCategories, ["new-profile", "default"]);
  assert.equal(plan.allowTopLevelTemplatePreset, false);
});

test("older top-level branding is not applied when last profile points elsewhere", () => {
  const oldBranding = branding("OLD PROFILE");
  const defaultBranding = branding("DEFAULT PROFILE");
  const layoutPreset = {
    publishCategory: "old-profile",
    brandingDraft: oldBranding,
    templateId: "black",
  } as StudioLayoutPreset;

  const plan = resolveStoredEditorPresetHydrationPlan({
    layoutPreset,
    storedLastPublishCategory: "new-profile",
    publishCategory: "default",
    defaultCategory: "default",
    defaultBrandingByCategory: {
      default: defaultBranding,
      "old-profile": oldBranding,
      "new-profile": defaultBranding,
    },
    normalizeCategory,
  });

  assert.equal(plan.categoryToSelect, "new-profile");
  assert.equal(plan.effectiveCategory, "new-profile");
  assert.equal(plan.brandingPreset, null);
  assert.equal(plan.presetBrandingOverride, null);
  assert.deepEqual(plan.templatePresetCategories, ["new-profile", "default"]);
  assert.equal(plan.allowTopLevelTemplatePreset, false);
});

test("draft hydration template lookup ignores the draft and preset categories outside the locked profile", () => {
  const layoutPreset = {
    publishCategory: "old-profile",
    templateId: "black",
    templateByCategory: {
      "old-profile": {
        templateId: "black",
        templateImageEnabled: true,
      },
    },
  } as StudioLayoutPreset;

  const plan = resolveLockedTemplatePresetHydrationPlan({
    layoutPreset,
    targetCategory: "new-profile",
    defaultCategory: "default",
    normalizeCategory,
  });

  assert.deepEqual(plan.templatePresetCategories, ["new-profile", "default"]);
  assert.equal(plan.allowTopLevelTemplatePreset, false);
});

test("category template effect does not fall back to an old top-level preset", () => {
  const layoutPreset = {
    publishCategory: "old-profile",
    templateId: "black",
  } as StudioLayoutPreset;

  const plan = resolveLockedTemplatePresetHydrationPlan({
    layoutPreset,
    targetCategory: "new-profile",
    defaultCategory: "default",
    normalizeCategory,
  });

  assert.equal(plan.allowTopLevelTemplatePreset, false);
});

test("top-level template fallback remains available for matching or unscoped presets", () => {
  const matchingPreset = {
    publishCategory: "new-profile",
    templateId: "black",
  } as StudioLayoutPreset;
  const unscopedPreset = {
    templateId: "black",
  } as StudioLayoutPreset;

  assert.equal(
    resolveLockedTemplatePresetHydrationPlan({
      layoutPreset: matchingPreset,
      targetCategory: "new-profile",
      defaultCategory: "default",
      normalizeCategory,
    }).allowTopLevelTemplatePreset,
    true
  );
  assert.equal(
    resolveLockedTemplatePresetHydrationPlan({
      layoutPreset: unscopedPreset,
      targetCategory: "new-profile",
      defaultCategory: "default",
      normalizeCategory,
    }).allowTopLevelTemplatePreset,
    true
  );
});

test("project profile snapshot with null template preset means explicit default template", () => {
  assert.equal(
    hasExplicitDefaultTemplatePresetSnapshot({
      version: 1,
      projectId: "project-default-template",
      createdAt: "2026-07-20T00:00:00.000Z",
      contentProfile: {
        category: "new-profile",
        label: "New Profile",
        metadataSnapshot: {
          description: "",
          tags: [],
          ttsVoiceId: "",
          bgmEnabled: true,
          bgmTrackId: "none",
          mixPresetId: "balanced",
          sfxEnabled: true,
          sfxMasterGainDb: 0,
          templateNotes: "",
          topicToScriptPrompt: "",
          scriptToJsonPrompt: "",
          templatePreset: null,
        },
      },
    }),
    true
  );

  assert.equal(
    hasExplicitDefaultTemplatePresetSnapshot({
      version: 1,
      projectId: "project-unspecified-template",
      createdAt: "2026-07-20T00:00:00.000Z",
      contentProfile: {
        category: "new-profile",
        label: "New Profile",
        metadataSnapshot: {
          description: "",
          tags: [],
          ttsVoiceId: "",
          bgmEnabled: true,
          bgmTrackId: "none",
          mixPresetId: "balanced",
          sfxEnabled: true,
          sfxMasterGainDb: 0,
          templateNotes: "",
          topicToScriptPrompt: "",
          scriptToJsonPrompt: "",
        },
      },
    }),
    false
  );
});

test("last profile persistence skips the initial stale category until restored state lands", () => {
  const staleWrite = shouldWriteLastPublishCategory({
    publishCategory: "default",
    pendingRestoreCategory: "new-profile",
  });

  assert.equal(staleWrite.shouldWrite, false);
  assert.equal(staleWrite.pendingRestoreCategory, "new-profile");

  const restoredWrite = shouldWriteLastPublishCategory({
    publishCategory: "new-profile",
    pendingRestoreCategory: staleWrite.pendingRestoreCategory,
  });

  assert.equal(restoredWrite.shouldWrite, true);
  assert.equal(restoredWrite.pendingRestoreCategory, null);
});

test("draft hydration recovers persisted active render status without changing stable statuses", () => {
  const source = readFileSync(new URL("./use-studio-local-storage-sync.ts", import.meta.url), "utf8");

  assert.match(source, /setRenderStatus\(recoverPersistedStudioRenderStatus\(parsed\.renderStatus\)\)/);
  assert.equal(
    recoverPersistedStudioRenderStatus("2/3 확인본 서버 렌더링 중"),
    "확인본 렌더 중단됨·재시도 필요. 같은 단계에서 다시 실행해 주세요."
  );
  assert.equal(recoverPersistedStudioRenderStatus("확인본 제작 완료"), "확인본 제작 완료");
});
