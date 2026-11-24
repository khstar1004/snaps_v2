import assert from "node:assert/strict";
import test from "node:test";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import { buildNewProjectProfileSummary } from "./profile-summary";

function makeMetadata(overrides: Partial<PublishMetadata> = {}): PublishMetadata {
  return {
    description: "description",
    tags: ["shorts"],
    ttsVoiceId: "voice-main",
    bgmEnabled: true,
    bgmTrackId: "morning-stroll",
    mixPresetId: "balanced",
    playbackRate: 1.08,
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: "topic prompt",
    scriptToJsonPrompt: "json prompt",
    templatePreset: {
      templateId: "fun-caption",
      templateData: {
        topCaptionScale: 1,
        mainCaptionScale: 1,
        topCaptionBgOpacity: 0.85,
        overlayStrength: 0.5,
        captionFeatureEnabled: true,
        overlayFeatureEnabled: true,
        cueMetadataEnabled: true,
        autoCaptionFxEnabled: true,
        overlayPreset: "spark",
        overlayOpacity: 0.4,
        overlayScale: 1,
        overlayDensity: 1,
        overlayPlacement: "full",
        captionStyle: "bold-yellow",
        animationPreset: "pop",
        topCaptionY: 10,
        mainCaptionY: 70,
        captionMaxWidth: 90,
        topCaptionAlign: "center",
        mainCaptionAlign: "center",
        mainCaptionColor: "#ffffff",
        mainCaptionStrokeColor: "#000000",
        mainCaptionStrokeWidth: 4,
        mainCaptionGlow: 0.2,
        autoCaptionProfile: "news",
        autoCaptionIntensity: 0.4,
        autoHighlightEnabled: true,
        autoHighlightColor: "#ffff00",
        autoHighlightScale: 1.1,
        topCaptionTextColor: "#ffffff",
        topCaptionBgColor: "#111111",
        captionLineHeight: 1.1,
        cueDurationSec: 1.2,
      },
      templateImageEnabled: false,
      templateImageUrl: "",
      templateImageLayout: {
        headerTitleSlot: { x: 0, y: 0, w: 100, h: 10 },
        headerAccentSlot: { x: 0, y: 10, w: 100, h: 10 },
        titleSlot: { x: 0, y: 20, w: 100, h: 20 },
        bodySlot: { x: 0, y: 40, w: 100, h: 30 },
        imageSlot: { x: 0, y: 70, w: 100, h: 20 },
        infoSlot: { x: 0, y: 90, w: 100, h: 10 },
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        infoColor: "#ffffff",
        titleAlign: "center",
        bodyAlign: "center",
        headerSize: 20,
        titleSize: 32,
        bodySize: 18,
        infoSize: 12,
      },
      templateLayoutApply: {
        title: true,
        body: true,
        image: true,
        info: true,
      },
    },
    mascotPrompt: "  선명한   3D 캐릭터\n브랜드 컬러  ",
    ...overrides,
  };
}

test("buildNewProjectProfileSummary maps configured profile defaults", () => {
  const summary = buildNewProjectProfileSummary(makeMetadata());

  assert.deepEqual(summary, {
    outputFormat: "Shorts 1080×1920 (9:16)",
    template: "펀캡션 템플릿 (fun-caption)",
    defaultVoice: "voice-main",
    playbackRate: "1.08x",
    bgm: "Morning Stroll",
    sfx: "자동 추천 · 마스터 +2 dB",
    imageStyle: "선명한 3D 캐릭터 브랜드 컬러",
    hasDefaultVoice: true,
    hasRequiredStorage: true,
  });
});

test("buildNewProjectProfileSummary shows off labels and fallback values", () => {
  const summary = buildNewProjectProfileSummary(
    makeMetadata({
      ttsVoiceId: " ",
      bgmEnabled: false,
      bgmTrackId: "missing-track",
      sfxEnabled: false,
      sfxMasterGainDb: Number.NaN,
      playbackRate: 9,
      templatePreset: {
        templateId: "missing" as never,
        templateData: {} as never,
        templateImageEnabled: false,
        templateImageUrl: "",
        templateImageLayout: {
          headerTitleSlot: { x: 0, y: 0, w: 0, h: 0 },
          headerAccentSlot: { x: 0, y: 0, w: 0, h: 0 },
          titleSlot: { x: 0, y: 0, w: 0, h: 0 },
          bodySlot: { x: 0, y: 0, w: 0, h: 0 },
          imageSlot: { x: 0, y: 0, w: 0, h: 0 },
          infoSlot: { x: 0, y: 0, w: 0, h: 0 },
          titleColor: "#000000",
          bodyColor: "#000000",
          infoColor: "#000000",
          titleAlign: "center",
          bodyAlign: "center",
          headerSize: 0,
          titleSize: 0,
          bodySize: 0,
          infoSize: 0,
        },
        templateLayoutApply: {
          title: false,
          body: false,
          image: false,
          info: false,
        },
      },
      mascotPrompt: "",
      mascotStyle: "",
      mascotDescription: "",
    })
  );

  assert.equal(summary.template, "기본 템플릿 (default)");
  assert.equal(summary.defaultVoice, "제작 단계에서 선택");
  assert.equal(summary.hasDefaultVoice, false);
  assert.equal(summary.hasRequiredStorage, true);
  assert.equal(summary.playbackRate, "3x");
  assert.equal(summary.bgm, "끔");
  assert.equal(summary.sfx, "끔");
  assert.equal(summary.imageStyle, "제작 단계에서 설정");
});

test("buildNewProjectProfileSummary uses null-safe defaults", () => {
  const summary = buildNewProjectProfileSummary(null);

  assert.equal(summary.outputFormat, "Shorts 1080×1920 (9:16)");
  assert.equal(summary.template, "기본 템플릿 (default)");
  assert.equal(summary.defaultVoice, "제작 단계에서 선택");
  assert.equal(summary.playbackRate, "1.5x");
  assert.equal(summary.bgm, "끔");
  assert.equal(summary.sfx, "끔");
  assert.equal(summary.imageStyle, "제작 단계에서 설정");
  assert.equal(summary.hasDefaultVoice, false);
  assert.equal(summary.hasRequiredStorage, true);
});

test("buildNewProjectProfileSummary falls back across image style fields and compacts long text", () => {
  const longDescription = Array.from({ length: 30 }, (_, index) => `스타일${index + 1}`).join("\n\n");
  const summary = buildNewProjectProfileSummary(
    makeMetadata({
      mascotPrompt: " ",
      mascotStyle: " ",
      mascotDescription: longDescription,
    })
  );

  assert.ok(summary.imageStyle.startsWith("스타일1 스타일2 스타일3"));
  assert.ok(summary.imageStyle.endsWith("..."));
  assert.ok(summary.imageStyle.length <= 96);
  assert.equal(summary.imageStyle.includes("\n"), false);
  assert.equal(summary.imageStyle.includes("  "), false);
});

test("buildNewProjectProfileSummary keeps an enabled custom BGM id visible", () => {
  const summary = buildNewProjectProfileSummary(
    makeMetadata({
      bgmEnabled: true,
      bgmTrackId: "custom-bed",
    })
  );

  assert.equal(summary.bgm, "custom-bed");
});

test("buildNewProjectProfileSummary exposes missing required storage", () => {
  const summary = buildNewProjectProfileSummary(makeMetadata(), { storageReady: false });

  assert.equal(summary.hasRequiredStorage, false);
});
