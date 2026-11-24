import assert from "node:assert/strict";
import test from "node:test";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { VideoAssetRecord } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioHistoryEntry, StudioWorkDraft } from "@/app/shorts-json-studio/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import {
  buildPersonalV1CategoryDashboardSummaries,
  buildPersonalV1HistoryArchiveEntryBeforeOverwrite,
  buildPersonalV1StudioWorkDraftSeed,
  isPersonalV1MeaningfulDraft,
  summarizePersonalV1CategoryDrafts,
  summarizePersonalV1HistoryEntries,
  summarizePersonalV1VideoAssets,
} from "./studio-dashboard-helpers";

function makeMetadata(overrides?: Partial<PublishMetadata>): PublishMetadata {
  return {
    description: "publish description",
    tags: ["tag-a", "tag-b"],
    ttsVoiceId: "voice-main",
    bgmEnabled: true,
    bgmTrackId: "bgm-track",
    mixPresetId: "mix-balanced",
    bgmVolume: 0.42,
    playbackRate: 2.25,
    sfxEnabled: true,
    sfxMasterGainDb: 99,
    templateNotes: "do not copy",
    topicToScriptPrompt: "topic prompt",
    scriptToJsonPrompt: "json prompt",
    ...overrides,
  };
}

function makeProjectProfileSnapshot(): StudioProjectProfileSnapshot {
  return {
    version: 1,
    projectId: "project-seed-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "customer-a",
      label: "Customer A",
      metadataSnapshot: makeMetadata({ tags: ["seed"] }),
    },
  };
}

function makeSlide(title: string): PreparedSlide {
  return {
    title,
    text: "body",
    lines: ["body"],
    layout: "photo+body",
  };
}

test("buildPersonalV1StudioWorkDraftSeed maps topic input and only compatible metadata defaults", () => {
  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-a",
      label: "Customer A",
    },
    inputMode: "topic",
    text: "  launch topic  ",
    workName: "  Launch work  ",
    metadataSnapshot: makeMetadata(),
  });

  assert.deepEqual(draft, {
    workName: "Launch work",
    topicText: "launch topic",
    scriptText: "",
    scriptMode: "normal",
    publishCategory: "customer-a",
    selectedVoiceId: "voice-main",
    bgmEnabled: true,
    selectedBgmTrack: "bgm-track",
    mixPresetId: "mix-balanced",
    bgmVolume: 0.42,
    playbackRate: 2.25,
    sfxEnabled: true,
    sfxMasterGainDb: 12,
  });
  assert.equal("description" in draft, false);
  assert.equal("tags" in draft, false);
  assert.equal("topicToScriptPrompt" in draft, false);
});

test("buildPersonalV1StudioWorkDraftSeed uses the first non-empty script line as the project name", () => {
  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-b",
      label: "Customer B",
    },
    inputMode: "script",
    text: "  line one\nline two  ",
    workName: " ",
    metadataSnapshot: null,
  });

  assert.equal(draft.workName, "line one");
  assert.equal(draft.topicText, "");
  assert.equal(draft.scriptText, "line one\nline two");
  assert.equal(draft.publishCategory, "customer-b");
});

test("buildPersonalV1StudioWorkDraftSeed uses the first topic line when no project name is supplied", () => {
  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-b",
      label: "Customer B",
    },
    inputMode: "topic",
    text: "\n  초등학생 한자 교육  \n요일 이름의 뜻",
  });

  assert.equal(draft.workName, "초등학생 한자 교육");
  assert.equal(draft.topicText, "초등학생 한자 교육  \n요일 이름의 뜻");
  assert.equal(draft.scriptText, "");
});

test("buildPersonalV1StudioWorkDraftSeed stores an immutable project profile snapshot", () => {
  const projectProfileSnapshot = makeProjectProfileSnapshot();
  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-a",
      label: "Customer A",
    },
    inputMode: "topic",
    text: "topic",
    workName: "work",
    metadataSnapshot: projectProfileSnapshot.contentProfile.metadataSnapshot,
    projectProfileSnapshot,
  });

  assert.equal(draft.projectProfileSnapshot?.projectId, "project-seed-1");
  assert.equal(draft.projectProfileSnapshot?.contentProfile.category, "customer-a");

  projectProfileSnapshot.contentProfile.metadataSnapshot?.tags.push("mutated");
  assert.deepEqual(draft.projectProfileSnapshot?.contentProfile.metadataSnapshot?.tags, ["seed"]);
});

test("buildPersonalV1StudioWorkDraftSeed applies template preset defaults with deep copies", () => {
  const metadata = makeMetadata({
    templatePreset: {
      templateId: "black",
      templateData: {
        accentColor: "#ff0066",
        titleScale: 1.1,
        bodyScale: 0.95,
        mediaRadius: 12,
        cueMetadataEnabled: true,
        autoCaptionFxEnabled: true,
        autoCaptionProfile: "off",
        autoCaptionIntensity: 0.5,
        autoHighlightEnabled: true,
        autoHighlightColor: "#ffff00",
        autoHighlightScale: 1.2,
        cueDurationSec: 1.6,
      },
      templateImageEnabled: true,
      templateImageUrl: "https://example.com/template.png",
      templateImageLayout: {
        headerTitleSlot: { x: 0, y: 0, w: 100, h: 10 },
        headerAccentSlot: { x: 0, y: 10, w: 100, h: 10 },
        titleSlot: { x: 0, y: 20, w: 100, h: 20 },
        bodySlot: { x: 0, y: 40, w: 100, h: 30 },
        imageSlot: { x: 0, y: 70, w: 100, h: 20 },
        infoSlot: { x: 0, y: 90, w: 100, h: 10 },
        titleColor: "#111111",
        bodyColor: "#222222",
        infoColor: "#333333",
        titleAlign: "center",
        bodyAlign: "left",
        headerSize: 24,
        titleSize: 32,
        bodySize: 18,
        infoSize: 12,
      },
      templateLayoutApply: {
        title: true,
        body: false,
        image: true,
        info: false,
      },
      templateLayoutJson: "{\"ignored\":true}",
    },
  });

  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-template",
      label: "Customer Template",
    },
    inputMode: "topic",
    text: "topic",
    workName: "Template work",
    metadataSnapshot: metadata,
  });

  assert.equal(draft.templateId, "black");
  assert.deepEqual(draft.templateData, {
    accentColor: "#ff0066",
    titleScale: 1.1,
    bodyScale: 0.95,
    mediaRadius: 12,
    cueMetadataEnabled: true,
    autoCaptionFxEnabled: true,
    autoCaptionProfile: "off",
    autoCaptionIntensity: 0.5,
    autoHighlightEnabled: true,
    autoHighlightColor: "#ffff00",
    autoHighlightScale: 1.2,
    cueDurationSec: 1.6,
  });
  assert.equal(draft.templateImageEnabled, true);
  assert.equal(draft.templateImageUrl, "https://example.com/template.png");
  assert.deepEqual(draft.templateLayoutApply, {
    title: true,
    body: false,
    image: true,
    info: false,
  });
  assert.equal("templateLayoutJson" in draft, false);

  (metadata.templatePreset?.templateData as Record<string, unknown>).accentColor = "#000000";
  if (metadata.templatePreset?.templateImageLayout) {
    metadata.templatePreset.templateImageLayout.titleSlot.x = 99;
  }
  if (metadata.templatePreset?.templateLayoutApply) {
    metadata.templatePreset.templateLayoutApply.body = true;
  }

  assert.equal((draft.templateData as Record<string, unknown>).accentColor, "#ff0066");
  assert.equal((draft.templateImageLayout as { titleSlot: { x: number } }).titleSlot.x, 0);
  assert.deepEqual(draft.templateLayoutApply, {
    title: true,
    body: false,
    image: true,
    info: false,
  });
});

test("buildPersonalV1StudioWorkDraftSeed treats an explicit null template preset as the default template", () => {
  const draft = buildPersonalV1StudioWorkDraftSeed({
    contentProfile: {
      category: "customer-default-template",
      label: "Customer Default Template",
    },
    inputMode: "topic",
    text: "topic",
    workName: "Default template work",
    metadataSnapshot: makeMetadata({
      templatePreset: null,
    }),
  });

  assert.equal(draft.templateId, "default");
  assert.deepEqual(draft.templateData, {
    titleScale: 1,
    bodyScale: 1,
    cueMetadataEnabled: false,
    autoCaptionFxEnabled: false,
    autoCaptionProfile: "news",
    autoCaptionIntensity: 0.42,
    autoHighlightEnabled: true,
    autoHighlightColor: "#2563eb",
    autoHighlightScale: 1.08,
    cueDurationSec: 1.35,
  });
  assert.equal(draft.templateImageEnabled, false);
  assert.equal(draft.templateImageUrl, "");
  assert.equal((draft.templateImageLayout as { infoSlot: { h: number } }).infoSlot.h, 0.03);
  assert.deepEqual(draft.templateLayoutApply, {
    title: true,
    body: true,
    image: true,
    info: true,
  });
});

test("isPersonalV1MeaningfulDraft ignores empty settings-only drafts and accepts real content", () => {
  assert.equal(isPersonalV1MeaningfulDraft(null), false);
  assert.equal(
    isPersonalV1MeaningfulDraft({
      publishCategory: "customer-a",
      showJsonEditor: true,
      bgmEnabled: false,
    }),
    false
  );
  assert.equal(isPersonalV1MeaningfulDraft({ topicText: "topic" }), true);
  assert.equal(isPersonalV1MeaningfulDraft({ slides: [makeSlide("slide")] }), true);
  assert.equal(isPersonalV1MeaningfulDraft({ videoUrl: "https://example.com/video.mp4" }), true);
});

test("buildPersonalV1HistoryArchiveEntryBeforeOverwrite creates a cloned backup before overwrite", () => {
  const currentDraft: StudioWorkDraft = {
    workName: "Current work",
    publishCategory: "old-category",
    slides: [makeSlide("first")],
  };
  const entry = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
    currentDraft,
    nextDraft: { workName: "Next work" },
    category: "customer-a",
    categoryLabel: "Customer A",
    now: new Date("2026-07-19T10:20:30.000Z"),
    id: "archive-1",
  });

  assert.equal(entry?.id, "archive-1");
  assert.equal(entry?.label, "덮어쓰기 전 백업 · Current work");
  assert.equal(entry?.createdAt, "2026-07-19T10:20:30.000Z");
  assert.equal(entry?.draft.publishCategory, "customer-a");
  assert.equal(entry?.slideCount, 1);
  assert.deepEqual(entry?.changeTags, ["new_project_overwrite"]);

  currentDraft.slides?.push(makeSlide("mutated"));
  assert.equal(entry?.draft.slides?.length, 1);
});

test("buildPersonalV1HistoryArchiveEntryBeforeOverwrite skips empty or identical drafts", () => {
  assert.equal(
    buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
      currentDraft: { publishCategory: "customer-a" },
      category: "customer-a",
    }),
    null
  );
  assert.equal(
    buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
      currentDraft: { workName: "same" },
      nextDraft: { workName: "same" },
      category: "customer-a",
    }),
    null
  );
});

test("buildPersonalV1HistoryArchiveEntryBeforeOverwrite creates collision-resistant default ids", () => {
  const now = new Date("2026-07-19T10:20:30.000Z");
  const first = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
    currentDraft: { workName: "first" },
    category: "customer-a",
    now,
  });
  const second = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
    currentDraft: { workName: "second" },
    category: "customer-a",
    now,
  });

  assert.ok(first?.id.startsWith("personal-v1-archive-"));
  assert.ok(second?.id.startsWith("personal-v1-archive-"));
  assert.notEqual(first?.id, second?.id);
});

test("summarizePersonalV1CategoryDrafts sorts meaningful drafts first and clones draft payloads", () => {
  const draft: StudioWorkDraft = {
    workName: "A work",
    publishCategory: "customer-a",
    slides: [makeSlide("first")],
  };
  const summaries = summarizePersonalV1CategoryDrafts(
    {
      "customer-b": { publishCategory: "customer-b", bgmEnabled: true },
      "customer-a": draft,
    },
    {
      "customer-a": "Customer A",
      "customer-b": "Customer B",
    }
  );

  assert.equal(summaries[0]?.category, "customer-a");
  assert.equal(summaries[0]?.label, "Customer A");
  assert.equal(summaries[0]?.title, "A work");
  assert.equal(summaries[0]?.slideCount, 1);
  assert.equal(summaries[0]?.updatedAt, 0);

  draft.slides?.push(makeSlide("mutated"));
  assert.equal(summaries[0]?.draft.slides?.length, 1);
});

test("summarizePersonalV1HistoryEntries filters by category and sorts newest first", () => {
  const entries: StudioHistoryEntry[] = [
    {
      id: "old",
      label: "old snapshot",
      createdAt: "2026-07-18T00:00:00.000Z",
      draft: { workName: "Old", publishCategory: "customer-a" },
    },
    {
      id: "other",
      label: "other snapshot",
      createdAt: "2026-07-20T00:00:00.000Z",
      draft: { workName: "Other", publishCategory: "customer-b" },
    },
    {
      id: "new",
      label: "new snapshot",
      createdAt: "2026-07-19T00:00:00.000Z",
      slideCount: 3,
      changeTags: ["제목", ""],
      summary: "changed",
      draft: { workName: "New", publishCategory: "customer-a" },
    },
  ];

  const summaries = summarizePersonalV1HistoryEntries(entries, { "customer-a": "Customer A" }, { category: "customer-a" });

  assert.deepEqual(
    summaries.map((item) => item.id),
    ["new", "old"]
  );
  assert.equal(summaries[0]?.slideCount, 3);
  assert.deepEqual(summaries[0]?.changeTags, ["제목"]);
});

test("summarizePersonalV1VideoAssets filters deleted assets by default and sorts newest first", () => {
  const assets: VideoAssetRecord[] = [
    {
      id: "asset-old",
      title: "Old",
      url: "https://example.com/old.mp4",
      publishCategory: "customer-a",
      sizeBytes: 10,
      mimeType: "video/mp4",
      createdAt: 100,
    },
    {
      id: "asset-deleted",
      title: "Deleted",
      url: "https://example.com/deleted.mp4",
      publishCategory: "customer-a",
      sizeBytes: 10,
      mimeType: "video/mp4",
      createdAt: 300,
      deletedAt: 400,
    },
    {
      id: "asset-new",
      title: "New",
      url: "https://example.com/new.mp4",
      publishCategory: "customer-a",
      sizeBytes: 20,
      mimeType: "video/mp4",
      createdAt: 200,
    },
  ];

  const active = summarizePersonalV1VideoAssets(assets, { "customer-a": "Customer A" }, { category: "customer-a" });
  assert.deepEqual(
    active.map((item) => item.id),
    ["asset-new", "asset-old"]
  );

  const withDeleted = summarizePersonalV1VideoAssets(assets, undefined, {
    category: "customer-a",
    includeDeleted: true,
    limit: 1,
  });
  assert.deepEqual(withDeleted.map((item) => item.id), ["asset-deleted"]);
});

test("buildPersonalV1CategoryDashboardSummaries combines latest category activity", () => {
  const drafts = summarizePersonalV1CategoryDrafts({
    "customer-a": { workName: "Draft A", publishCategory: "customer-a", slides: [makeSlide("A")] },
  });
  const history = summarizePersonalV1HistoryEntries([
    {
      id: "history-b",
      label: "History B",
      createdAt: "2026-07-19T00:00:00.000Z",
      draft: { workName: "History B", publishCategory: "customer-b" },
    },
  ]);
  const assets = summarizePersonalV1VideoAssets([
    {
      id: "asset-a",
      title: "Asset A",
      url: "https://example.com/a.mp4",
      publishCategory: "customer-a",
      sizeBytes: 1,
      mimeType: "video/mp4",
      createdAt: Date.parse("2026-07-20T00:00:00.000Z"),
    },
  ]);

  const summaries = buildPersonalV1CategoryDashboardSummaries({
    drafts,
    history,
    assets,
    categoryLabels: {
      "customer-a": "Customer A",
      "customer-b": "Customer B",
    },
  });

  assert.deepEqual(
    summaries.map((item) => item.category),
    ["customer-a", "customer-b"]
  );
  assert.equal(summaries[0]?.assetCount, 1);
  assert.equal(summaries[0]?.meaningfulDraftCount, 1);
  assert.equal(summaries[1]?.historyCount, 1);
});
