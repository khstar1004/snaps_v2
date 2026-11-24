import assert from "node:assert/strict";
import test from "node:test";
import { createStudioTemplateData } from "@/app/shorts-json-studio/components/templates/template-registry";
import {
  normalizeCategoryTemplatePreset,
  type TemplateBranding,
} from "./layout-studio-helpers";
import {
  getNextLayoutStudioRecentCustomerKeys,
  hydrateLayoutStudioStoredPreset,
  parseLayoutStudioRecentCustomerKeys,
  serializeLayoutStudioStoredPreset,
} from "./layout-studio-storage";

function makeBranding(overrides?: Partial<TemplateBranding>): TemplateBranding {
  return {
    variant: "news",
    headerTitle: "기본 헤더",
    headerAccentText: "핵심 브리핑",
    headerColor: "#1b3f8f",
    footerColor: "rgba(27,63,143,0.9)",
    infoLineText: "채널 | 01:22 | 조회 15634",
    fontFamily: '"Pretendard Variable", "Pretendard", sans-serif',
    imageRounded: true,
    ...overrides,
  };
}

test("parseLayoutStudioRecentCustomerKeys filters invalid values and caps the list", () => {
  const parsed = parseLayoutStudioRecentCustomerKeys(
    JSON.stringify([" default ", "", null, "brand-a", "brand-b", "brand-c", "brand-d", "brand-e", "brand-f", "brand-g"])
  );

  assert.deepEqual(parsed, ["default", "brand-a", "brand-b", "brand-c", "brand-d", "brand-e", "brand-f", "brand-g"]);
});

test("getNextLayoutStudioRecentCustomerKeys moves the active category to the front", () => {
  const next = getNextLayoutStudioRecentCustomerKeys("brand-b", ["default", "brand-b", "brand-c"]);

  assert.deepEqual(next, ["brand-b", "default", "brand-c"]);
});

test("hydrateLayoutStudioStoredPreset creates a requested-category patch when no stored preset exists", () => {
  const hydrated = hydrateLayoutStudioStoredPreset(null, {
    requestedCategory: "brand-a",
    requestedTemplateId: "black",
  });

  assert.equal(hydrated?.nextPublishCategory, "brand-a");
  assert.equal(hydrated?.replaceTemplatePresetByCategory, false);
  assert.deepEqual(hydrated?.categoryOptions, [{ key: "brand-a", label: "brand-a" }]);
  assert.equal(hydrated?.templatePresetByCategory?.["brand-a"]?.templateId, "black");
});

test("hydrateLayoutStudioStoredPreset normalizes stored presets and applies requested template overrides", () => {
  const storedBlackPreset = normalizeCategoryTemplatePreset({
    templateId: "black",
    templateData: createStudioTemplateData("black"),
  });
  const storedDefaultPreset = normalizeCategoryTemplatePreset({
    templateId: "default",
    templateData: createStudioTemplateData("default"),
  });
  const raw = serializeLayoutStudioStoredPreset({
    publishCategory: "brand-b",
    brandingDraft: makeBranding({ headerTitle: "브랜드 B 헤더" }),
    activeTemplatePreset: storedBlackPreset,
    templatePresetByCategory: {
      "brand-b": storedBlackPreset,
      "brand-c": storedDefaultPreset,
    },
  });
  const hydrated = hydrateLayoutStudioStoredPreset(raw, {
    requestedCategory: "brand-b",
    requestedTemplateId: "fun-caption",
  });

  assert.equal(hydrated?.replaceTemplatePresetByCategory, true);
  assert.equal(hydrated?.nextPublishCategory, "brand-b");
  assert.equal(hydrated?.brandingDraftPatch?.headerTitle, "브랜드 B 헤더");
  assert.deepEqual(hydrated?.categoryOptions, [
    { key: "brand-b", label: "brand-b" },
    { key: "brand-c", label: "brand-c" },
  ]);
  assert.equal(hydrated?.templatePresetByCategory?.["brand-b"]?.templateId, "fun-caption");
  assert.equal(hydrated?.templatePresetByCategory?.["brand-c"]?.templateId, "default");
  assert.equal(hydrated?.localPresetTemplateKeys["brand-b::black"], true);
  assert.equal(hydrated?.localPresetTemplateKeys["brand-b::fun-caption"], true);
});
