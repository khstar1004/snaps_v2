import test from "node:test";
import assert from "node:assert/strict";
import { getPublishMetadata } from "@/lib/publish/category-metadata";
import {
  mergeTemplateNotesByCategory,
  resolveStudioCategoryAudioResetMetadata,
  resolveStudioCategoryAudioSettings,
  shouldPreserveStudioProjectDraftTemplate,
} from "./use-studio-category-preset-state";

test("mergeTemplateNotesByCategory returns previous object when the note is unchanged", () => {
  const prev = {
    default: "기존 메모",
  };

  const result = mergeTemplateNotesByCategory(prev, "default", "기존 메모");

  assert.equal(result, prev);
});

test("mergeTemplateNotesByCategory writes the incoming note when it changes", () => {
  const prev = {
    default: "기존 메모",
  };

  const result = mergeTemplateNotesByCategory(prev, "default", "새 메모");

  assert.notEqual(result, prev);
  assert.equal(result.default, "새 메모");
});

test("new work prefers the latest bootstrapped default-profile audio settings over a stale cache", () => {
  const base = getPublishMetadata("default");
  const cachedMetadata = { ...base, bgmVolume: 0.18, ttsVoiceId: "cached-voice" };
  const bootstrappedMetadata = { ...base, bgmVolume: 0.46, ttsVoiceId: "latest-voice" };

  const result = resolveStudioCategoryAudioResetMetadata({
    category: "default",
    templateId: "default",
    categoryMetadataMap: { default: bootstrappedMetadata },
    cachedMetadata,
  });

  assert.equal(result, bootstrappedMetadata);
});

test("new work keeps template-specific audio settings from the matching cache", () => {
  const base = getPublishMetadata("default");
  const cachedMetadata = { ...base, bgmVolume: 0.37, ttsVoiceId: "template-voice" };

  const result = resolveStudioCategoryAudioResetMetadata({
    category: "default",
    templateId: "template-news",
    categoryMetadataMap: {
      default: { ...base, bgmVolume: 0.52, ttsVoiceId: "profile-voice" },
    },
    cachedMetadata,
  });

  assert.equal(result, cachedMetadata);
});

test("project audio reset keeps the project-start profile snapshot over newer profile values", () => {
  const base = getPublishMetadata("default");
  const projectMetadataSnapshot = { ...base, bgmVolume: 0.29, ttsVoiceId: "project-voice" };

  const result = resolveStudioCategoryAudioResetMetadata({
    category: "default",
    templateId: "default",
    categoryMetadataMap: {
      default: { ...base, bgmVolume: 0.61, ttsVoiceId: "latest-profile-voice" },
    },
    cachedMetadata: { ...base, ttsVoiceId: "cached-voice" },
    projectMetadataSnapshot,
  });

  assert.equal(result, projectMetadataSnapshot);
});

test("stored project profile snapshot preserves the draft template before hydration finishes", () => {
  const projectProfileSnapshot = {
    version: 1 as const,
    projectId: "project-news",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "news",
      label: "뉴스",
      metadataSnapshot: null,
    },
  };

  assert.equal(
    shouldPreserveStudioProjectDraftTemplate({
      projectProfileSnapshot: null,
      storedDraft: { publishCategory: "news", projectProfileSnapshot },
      publishCategory: "news",
    }),
    true
  );
  assert.equal(
    shouldPreserveStudioProjectDraftTemplate({
      projectProfileSnapshot: null,
      storedDraft: { publishCategory: "other", projectProfileSnapshot },
      publishCategory: "other",
    }),
    false
  );
});

test("profile audio settings normalize the default playback rate for a new work", () => {
  const base = getPublishMetadata("default");

  assert.equal(
    resolveStudioCategoryAudioSettings({ ...base, playbackRate: undefined }).playbackRate,
    1.5
  );
  assert.equal(
    resolveStudioCategoryAudioSettings({ ...base, playbackRate: 8 }).playbackRate,
    3
  );
  assert.equal(
    resolveStudioCategoryAudioSettings({ ...base, playbackRate: 1.8 }).playbackRate,
    1.8
  );
});
