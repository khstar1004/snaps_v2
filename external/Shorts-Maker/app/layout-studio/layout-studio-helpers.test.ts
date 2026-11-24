import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultCategoryTemplatePreset,
  DEFAULT_CATEGORY,
  DEFAULT_TEMPLATE_IMAGE_LAYOUT,
  LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT,
  mergeCategoryOptions,
  normalizeCategoryTemplatePreset,
  normalizeTemplateImageLayout,
  serializeTemplateLayoutForEditor,
} from "./layout-studio-helpers";

test("mergeCategoryOptions keeps the default category first and lets later labels win", () => {
  const merged = mergeCategoryOptions(
    [
      { key: "brand-b", label: "브랜드 B" },
      { key: DEFAULT_CATEGORY, label: "기본" },
    ],
    [
      { key: "brand-a", label: "브랜드 A" },
      { key: "brand-b", label: "업데이트 브랜드 B" },
    ]
  );

  assert.deepEqual(
    merged.map((item) => item.key),
    [DEFAULT_CATEGORY, "brand-a", "brand-b"]
  );
  assert.equal(merged.find((item) => item.key === "brand-b")?.label, "업데이트 브랜드 B");
});

test("normalizeTemplateImageLayout upgrades legacy generic slots to the current defaults", () => {
  const normalized = normalizeTemplateImageLayout({
    ...LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT,
    bodyAlign: "right",
    titleSize: 99,
    headerTitleWeight: 655,
  });

  assert.deepEqual(normalized.titleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot);
  assert.deepEqual(normalized.bodySlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot);
  assert.deepEqual(normalized.infoSlot, { ...DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot, h: 0.04 });
  assert.equal(normalized.bodyAlign, "right");
  assert.equal(normalized.titleSize, 52);
  assert.equal(normalized.headerTitleWeight, 700);
});

test("normalizeCategoryTemplatePreset normalizes stored layout json and apply flags", () => {
  const preset = normalizeCategoryTemplatePreset({
    templateImageEnabled: true,
    templateLayoutApply: {
      title: 1,
      body: 0,
      image: "",
      info: "yes",
    },
    templateLayoutJson: JSON.stringify({
      ...DEFAULT_TEMPLATE_IMAGE_LAYOUT,
      titleSlot: { x: -1, y: 0.1, w: 2, h: 0.3 },
      imageSlot: { x: 0.5, y: 0.5, w: 0.8, h: 0.8 },
    }),
  });
  const parsedLayoutJson = JSON.parse(preset.templateLayoutJson) as Record<string, unknown>;

  assert.equal(preset.templateId, "default");
  assert.deepEqual(preset.templateLayoutApply, {
    title: true,
    body: false,
    image: false,
    info: true,
  });
  assert.deepEqual(parsedLayoutJson.titleSlot, { x: 0, y: 0.1, w: 1, h: 0.3 });
  assert.equal("imageSlot" in parsedLayoutJson, false);
});

test("createDefaultCategoryTemplatePreset keeps its serialized layout in sync with the default layout", () => {
  const preset = createDefaultCategoryTemplatePreset();

  assert.deepEqual(preset.templateImageLayout, DEFAULT_TEMPLATE_IMAGE_LAYOUT);
  assert.equal(preset.templateLayoutJson, serializeTemplateLayoutForEditor(DEFAULT_TEMPLATE_IMAGE_LAYOUT));
});
