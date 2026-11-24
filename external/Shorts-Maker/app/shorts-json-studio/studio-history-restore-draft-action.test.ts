import assert from "node:assert/strict";
import test from "node:test";
import type { SetStateAction } from "react";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { getScopedStorageKey } from "@/lib/ui/scoped-storage";
import type { CrawlMode, ImageSource, PreparedSlide } from "@/types/studio-json";
import { createStudioTemplateData } from "./components/templates/template-registry";
import { STUDIO_EDITOR_PRESET_KEY } from "./studio-category-preset-storage";
import { createStudioHistoryRestoreDraftAction } from "./studio-history-restore-draft-action";
import type {
  StudioPreselectedMediaItem,
  StudioTemplateId,
  StudioTemplatePayload,
  StudioWorkDraft,
  TemplateBranding,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";

function makeBranding(overrides?: Partial<TemplateBranding>): TemplateBranding {
  return {
    variant: "news",
    headerTitle: "기본 헤더",
    headerAccentText: "ACCENT",
    headerColor: "#111111",
    footerColor: "#222222",
    infoLineText: "정보줄",
    fontFamily: "Pretendard",
    imageRounded: true,
    ...overrides,
  };
}

function makeStorageMock() {
  const store = new Map<string, string>();
  return {
    store,
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key(index: number) {
        return Array.from(store.keys())[index] || null;
      },
      get length() {
        return store.size;
      },
    } as Storage,
  };
}

function applyStateAction<T>(value: SetStateAction<T>, current: T): T {
  if (typeof value === "function") {
    return (value as (prevState: T) => T)(current);
  }
  return value;
}

function makeTemplateImageLayout(): TemplateImageLayout {
  return {
    headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
    headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
    titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
    bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
    imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
    infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    infoColor: "#ffffff",
    titleAlign: "center",
    bodyAlign: "center",
    headerSize: 17,
    titleSize: 46,
    bodySize: 26,
    infoSize: 15,
  };
}

test("history restore keeps the selected profile and does not mutate its category preset", () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalDocument = (globalThis as typeof globalThis & { document?: unknown }).document;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const memory = makeStorageMock();
  const revokeCalls: string[] = [];
  const callLog: string[] = [];

  try {
    (globalThis as any).window = {
      localStorage: memory.localStorage,
    };
    (globalThis as any).document = {
      cookie: "",
    };
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: (url: string) => {
        revokeCalls.push(url);
      },
    });

    const storedBranding = makeBranding({ headerTitle: "저장된 헤더" });
    const initialPresetPayload = {
      publishCategory: "default",
      brandingByCategory: {
        default: {
          branding: storedBranding,
          updatedAt: 123,
        },
      },
    };
    memory.localStorage.setItem(getScopedStorageKey(STUDIO_EDITOR_PRESET_KEY), JSON.stringify(initialPresetPayload));

    const sessionItem: StudioPreselectedMediaItem = {
      id: "session-1",
      source: "session-upload",
      title: "업로드 미디어",
      imageUrl: "blob:session-image",
      mediaUrl: "blob:session-media",
      createdAtMs: 10,
    };
    const registry = new Map<string, StudioPreselectedMediaItem>([["session-1", sessionItem]]);

    let localPresetRevision = 4;
    let renderStatus = "";
    let topicText = "";
    let previewTiming: { slides: PreparedSlide[]; frameDurationsSec: number[] } | null = {
      slides: [],
      frameDurationsSec: [],
    };
    let publishCategory: PublishCategory = "default";
    let brandingDraft = makeBranding();
    let presetBrandingOverride: { category: PublishCategory; branding: TemplateBranding } | null = null;
    let templateData: StudioTemplatePayload = createStudioTemplateData("default");
    let templateId: StudioTemplateId = "default";
    let templateImageEnabled = false;
    let templateImageUrl = "";
    let templateImageLayout: TemplateImageLayout = makeTemplateImageLayout();
    let templateLayoutApply: TemplateLayoutApply = { title: true, body: true, image: true, info: true };
    let preselectedMediaItems: StudioPreselectedMediaItem[] = [];
    let selectedBgmTrack = "";
    let bgmVolume = 0;
    let selectedPreviewGroupIndex = 0;
    let selectedFemaleVoiceId = "";
    let selectedMaleVoiceId = "";
    let selectedQuoteVoiceId = "";
    let selectedTypecastEmotionType = "";
    let selectedTypecastSpeed = "";
    let imageApprovalFingerprint = "";
    let imageSource: ImageSource = "crawl-only";
    let imageSearchSource: "crawl" | "library" = "crawl";
    let crawlMode: CrawlMode = "auto";
    let quickScheduledAt = "";
    let videoUrl: string | null = "blob:old-video";
    const initialProjectProfileSnapshot: StudioProjectProfileSnapshot = {
      version: 1,
      projectId: "project-current",
      createdAt: "2026-03-26T09:00:00.000Z",
      contentProfile: {
        category: "default",
        label: "현재 프로젝트 프로필",
        metadataSnapshot: null,
      },
    };
    let projectProfileSnapshot: StudioProjectProfileSnapshot | null = initialProjectProfileSnapshot;

    const action = createStudioHistoryRestoreDraftAction({
      categoryBrandingMap: {
        default: makeBranding({ headerTitle: "서버 헤더" }),
      },
      defaultBrandingByCategory: {
        default: makeBranding({ headerTitle: "기본 폴백" }),
      },
      defaultCategory: "default",
      preselectedMediaSessionRegistryRef: { current: registry },
      publishCategory: "default",
      skipCategoryAudioPresetRef: { current: false },
      transition: (callback) => {
        callLog.push("transition");
        callback();
      },
      videoUrl,
      revokeIfBlobUrl: (url) => {
        revokeCalls.push(url || "");
      },
      setBgmEnabled: () => callLog.push("bgmEnabled"),
      setBgmVolume: (value) => {
        bgmVolume = applyStateAction(value, bgmVolume);
        callLog.push("bgmVolume");
      },
      setBrandingDraft: (value) => {
        brandingDraft = applyStateAction(value, brandingDraft);
        callLog.push("brandingDraft");
      },
      setBusy: () => callLog.push("busy"),
      setCrawlMode: (value) => {
        crawlMode = applyStateAction(value, crawlMode);
        callLog.push("crawlMode");
      },
      setCodexModel: () => callLog.push("codexModel"),
      setImageErrors: () => callLog.push("imageErrors"),
      setImageApprovalFingerprint: (value) => {
        imageApprovalFingerprint = applyStateAction(value, imageApprovalFingerprint);
        callLog.push("imageApprovalFingerprint");
      },
      setImageSource: (value) => {
        imageSource = applyStateAction(value, imageSource);
        callLog.push("imageSource");
      },
      setImageSearchSource: (value) => {
        imageSearchSource = applyStateAction(value, imageSearchSource);
        callLog.push("imageSearchSource");
      },
      setJsonText: () => callLog.push("jsonText"),
      setLocalPresetRevision: (value) => {
        localPresetRevision = applyStateAction(value, localPresetRevision);
      },
      setMixPresetId: () => callLog.push("mixPresetId"),
      setPlaybackRate: () => callLog.push("playbackRate"),
      setPreselectedMediaApplyMode: () => callLog.push("preselectedMediaApplyMode"),
      setPreselectedMediaItems: (value) => {
        preselectedMediaItems = applyStateAction(value, preselectedMediaItems);
        callLog.push("preselectedMediaItems");
      },
      setPresetBrandingOverride: (value) => {
        presetBrandingOverride = applyStateAction(value, presetBrandingOverride);
        callLog.push("presetBrandingOverride");
      },
      setPreviewTiming: (value) => {
        previewTiming = applyStateAction(value, previewTiming);
        callLog.push("previewTiming");
      },
      setProjectProfileSnapshot: (value) => {
        projectProfileSnapshot = applyStateAction(value, projectProfileSnapshot);
        callLog.push("projectProfileSnapshot");
      },
      setPublishCategory: (value) => {
        publishCategory = applyStateAction(value, publishCategory);
        callLog.push("publishCategory");
      },
      setRenderNeedsRefresh: () => callLog.push("renderNeedsRefresh"),
      setRenderStatus: (value) => {
        renderStatus = applyStateAction(value, renderStatus);
        callLog.push("renderStatus");
      },
      setRenderUsage: () => callLog.push("renderUsage"),
      setScriptMode: () => callLog.push("scriptMode"),
      setScriptText: () => callLog.push("scriptText"),
      setScriptToJsonBusy: () => callLog.push("scriptToJsonBusy"),
      setQuickScheduledAt: (value) => {
        quickScheduledAt = applyStateAction(value, quickScheduledAt);
        callLog.push("quickScheduledAt");
      },
      setSelectedBgmTrack: (value) => {
        selectedBgmTrack = applyStateAction(value, selectedBgmTrack);
        callLog.push("selectedBgmTrack");
      },
      setSelectedPreviewGroupIndex: (value) => {
        selectedPreviewGroupIndex = applyStateAction(value, selectedPreviewGroupIndex);
        callLog.push("selectedPreviewGroupIndex");
      },
      setSelectedFemaleVoiceId: (value) => {
        selectedFemaleVoiceId = applyStateAction(value, selectedFemaleVoiceId);
        callLog.push("selectedFemaleVoiceId");
      },
      setSelectedMaleVoiceId: (value) => {
        selectedMaleVoiceId = applyStateAction(value, selectedMaleVoiceId);
        callLog.push("selectedMaleVoiceId");
      },
      setSelectedQuoteVoiceId: (value) => {
        selectedQuoteVoiceId = applyStateAction(value, selectedQuoteVoiceId);
        callLog.push("selectedQuoteVoiceId");
      },
      setSelectedTypecastEmotionType: (value) => {
        selectedTypecastEmotionType = applyStateAction(value, selectedTypecastEmotionType);
        callLog.push("selectedTypecastEmotionType");
      },
      setSelectedTypecastSpeed: (value) => {
        selectedTypecastSpeed = applyStateAction(value, selectedTypecastSpeed);
        callLog.push("selectedTypecastSpeed");
      },
      setSelectedVoiceId: () => callLog.push("selectedVoiceId"),
      setSfxAutoLevel: () => callLog.push("sfxAutoLevel"),
      setSfxEnabled: () => callLog.push("sfxEnabled"),
      setSfxMasterGainDb: () => callLog.push("sfxMasterGainDb"),
      setShowJsonEditor: () => callLog.push("showJsonEditor"),
      setSlides: () => callLog.push("slides"),
      setTemplateData: (value) => {
        templateData = applyStateAction(value, templateData);
        callLog.push("templateData");
      },
      setTemplateId: (value) => {
        templateId = applyStateAction(value, templateId);
        callLog.push("templateId");
      },
      setTemplateImageEnabled: (value) => {
        templateImageEnabled = applyStateAction(value, templateImageEnabled);
        callLog.push("templateImageEnabled");
      },
      setTemplateImageLayout: (value) => {
        templateImageLayout = applyStateAction(value, templateImageLayout);
        callLog.push("templateImageLayout");
      },
      setTemplateImageUrl: (value) => {
        templateImageUrl = applyStateAction(value, templateImageUrl);
        callLog.push("templateImageUrl");
      },
      setTemplateLayoutApply: (value) => {
        templateLayoutApply = applyStateAction(value, templateLayoutApply);
        callLog.push("templateLayoutApply");
      },
      setTopicText: (value) => {
        topicText = applyStateAction(value, topicText);
        callLog.push("topicText");
      },
      setTopicToScriptBusy: () => callLog.push("topicToScriptBusy"),
      setUploadedVideoUrl: () => callLog.push("uploadedVideoUrl"),
      setVideoUrl: (value) => {
        videoUrl = applyStateAction(value, videoUrl);
        callLog.push("videoUrl");
      },
      setWorkName: () => callLog.push("workName"),
    });

    const draft: StudioWorkDraft = {
      publishCategory: "another-profile",
      topicText: "복원 주제",
      scriptText: "복원 대본",
      scriptMode: "dialogue",
      jsonText: "{\"title\":\"복원\"}",
      showJsonEditor: false,
      imageSource: "manual-ai-prompt",
      imageSearchSource: "library",
      crawlMode: "fun",
      slides: [
        { title: "슬라이드 1", text: "본문 1", lines: ["본문 1"], layout: "photo+body" },
        { title: "슬라이드 2", text: "본문 2", lines: ["본문 2"], layout: "photo+body" },
      ],
      preselectedMediaItems: [{ ...sessionItem }],
      preselectedMediaApplyMode: "cycle-all",
      codexModel: "gpt-test",
      quickScheduledAt: "2026-03-26T12:00:00.000Z",
      selectedFemaleVoiceId: "female-voice",
      selectedMaleVoiceId: "male-voice",
      selectedQuoteVoiceId: "quote-voice",
      selectedTypecastEmotionType: "calm",
      selectedTypecastSpeed: "1.2",
      selectedVoiceId: "voice-1",
      imageApprovalFingerprint: "  image-approved-fp  ",
      playbackRate: 3.4,
      bgmEnabled: false,
      selectedBgmTrack: "",
      bgmVolume: 0.61,
      selectedPreviewGroupIndex: 3,
      mixPresetId: "invalid",
      sfxEnabled: false,
      sfxMasterGainDb: 99,
      sfxAutoLevel: "dense",
      videoUrl: "blob:new-video",
      uploadedVideoUrl: "   ",
      previewFrameDurationsSec: [0.2, -1, 0.4],
      renderStatus: "2/3 확인본 서버 렌더링 중",
      templateId: "default",
      templateData: createStudioTemplateData("default"),
      templateImageEnabled: true,
      templateImageUrl: "https://example.com/image.jpg",
      templateImageLayout: {
        titleSlot: { x: 0, y: 0, w: 0.5, h: 0.5 },
        bodySlot: { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        imageSlot: { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        infoSlot: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      },
      templateLayoutApply: {
        title: false,
        body: true,
        image: false,
        info: true,
      },
    };

    action(draft);

    assert.equal(revokeCalls[0], "blob:old-video");
    assert.equal(revokeCalls.length, 1);
    assert.equal(localPresetRevision, 4);
    assert.equal(renderStatus, "확인본 렌더 중단됨·재시도 필요. 같은 단계에서 다시 실행해 주세요.");
    assert.equal(publishCategory, "default");
    assert.equal(imageSource, "manual-ai-prompt");
    assert.equal(imageSearchSource, "library");
    assert.equal(crawlMode, "fun");
    assert.equal(selectedBgmTrack, STUDIO_BGM_OPTIONS[0]?.id || "");
    assert.equal(bgmVolume, 0.61);
    assert.equal(selectedPreviewGroupIndex, 3);
    assert.equal(selectedFemaleVoiceId, "female-voice");
    assert.equal(selectedMaleVoiceId, "male-voice");
    assert.equal(selectedQuoteVoiceId, "quote-voice");
    assert.equal(selectedTypecastEmotionType, "calm");
    assert.equal(selectedTypecastSpeed, "1.2");
    assert.equal(imageApprovalFingerprint, "image-approved-fp");
    assert.equal(quickScheduledAt, "2026-03-26T12:00:00.000Z");
    assert.equal(videoUrl, "blob:new-video");
    assert.equal(preselectedMediaItems.length, 1);
    assert.equal(preselectedMediaItems[0]?.id, "session-1");
    assert.ok(previewTiming);
    assert.equal(previewTiming.slides.length, 2);
    assert.deepEqual(previewTiming.frameDurationsSec, [0.2, 0.4]);
    assert.equal(brandingDraft.headerTitle, "저장된 헤더");
    assert.deepEqual(presetBrandingOverride, { category: "default", branding: storedBranding });
    assert.equal(templateImageEnabled, true);
    assert.equal(templateImageUrl, "https://example.com/image.jpg");
    assert.equal(templateId, "default");
    assert.ok(templateData && typeof templateData === "object");
    assert.equal(templateImageLayout.titleSlot.x, 0);
    assert.equal(templateLayoutApply.title, false);
    assert.equal(projectProfileSnapshot, initialProjectProfileSnapshot);
    assert.equal(callLog.includes("transition"), true);
    assert.equal(callLog.indexOf("renderStatus") < callLog.indexOf("transition"), true);
    assert.equal(callLog.indexOf("topicText") > callLog.indexOf("transition"), true);

    const stored = JSON.parse(memory.localStorage.getItem(getScopedStorageKey(STUDIO_EDITOR_PRESET_KEY)) || "{}") as Record<string, unknown>;
    assert.deepEqual(stored, initialPresetPayload);

    imageApprovalFingerprint = "stale-image";
    action({ publishCategory: "default" });
    assert.equal(imageApprovalFingerprint, "");

    const restoredProjectProfileSnapshot: StudioProjectProfileSnapshot = {
      version: 1,
      projectId: "project-restored",
      createdAt: "2026-03-26T10:00:00.000Z",
      contentProfile: {
        category: "default",
        label: "복원 프로젝트 프로필",
        metadataSnapshot: null,
      },
    };
    action({
      publishCategory: "default",
      topicText: "같은 프로필 복원",
      projectProfileSnapshot: restoredProjectProfileSnapshot,
    });
    assert.deepEqual(projectProfileSnapshot, restoredProjectProfileSnapshot);
    assert.notEqual(projectProfileSnapshot, restoredProjectProfileSnapshot);
    assert.equal(topicText, "같은 프로필 복원");

    const mismatchedProjectProfileSnapshot: StudioProjectProfileSnapshot = {
      ...restoredProjectProfileSnapshot,
      projectId: "project-mismatch",
      contentProfile: {
        ...restoredProjectProfileSnapshot.contentProfile,
        category: "another-profile",
      },
    };
    action({
      publishCategory: "default",
      topicText: "복원되면 안 되는 주제",
      projectProfileSnapshot: mismatchedProjectProfileSnapshot,
    });
    assert.deepEqual(projectProfileSnapshot, restoredProjectProfileSnapshot);
    assert.equal(topicText, "같은 프로필 복원");
    assert.equal(renderStatus, "현재 프로젝트와 다른 프로필 스냅샷은 복원할 수 없습니다.");
  } finally {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  }
});
