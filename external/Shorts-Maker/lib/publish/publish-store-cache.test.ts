import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultStudioPromptTemplates } from "@/lib/studio/prompt-templates";
import { STUDIO_TEMPLATE_IDS } from "@/types/studio-template";
import {
  compactStoredCategoryTemplatePresetMap,
  compactStoredTemplatePromptMap,
  sanitizeStoredCategoryTemplatePreset,
  sanitizeStoredCategoryTemplatePresetMap,
  sanitizeStoredPromptTemplatePayload,
  sanitizeStoredTemplatePromptMap,
} from "./publish-store-cache";

test("sanitizeStoredTemplatePromptMap keeps legacy prompts and nested template maps", () => {
  const sanitized = sanitizeStoredTemplatePromptMap({
    topicToScriptPrompt: " legacy topic ",
    templates: {
      default: {
        scriptToJsonPrompt: " default script ",
      },
      black: {
        topicToScriptPrompt: " black topic ",
      },
    },
  });

  assert.equal(sanitized.default?.topicToScriptPrompt, "legacy topic");
  assert.equal(sanitized.default?.scriptToJsonPrompt, "default script");
  assert.equal(sanitized.black?.topicToScriptPrompt, "black topic");
});

test("sanitizeStoredPromptTemplatePayload strips default prompt values", () => {
  const defaults = getDefaultStudioPromptTemplates("default");
  const payload = sanitizeStoredPromptTemplatePayload(
    {
      topicToScriptPrompt: defaults.topicToScriptPrompt,
      scriptToJsonPrompt: "custom json prompt",
    },
    "default"
  );

  assert.deepEqual(payload, {
    scriptToJsonPrompt: "custom json prompt",
  });
});

test("sanitizeStoredCategoryTemplatePreset trims stored fields", () => {
  const preset = sanitizeStoredCategoryTemplatePreset(
    {
      templateImageEnabled: 1,
      templateImageUrl: "  https://example.com/image.png  ",
      templateLayoutJson: "  {\"ok\":true}  ",
      templateData: { foo: "bar" },
      templateImageLayout: { titleSlot: { x: 0, y: 0, w: 1, h: 1 } },
      templateLayoutApply: { title: true },
    },
    "default"
  );

  assert.equal(preset?.templateId, "default");
  assert.equal(preset?.templateImageEnabled, true);
  assert.equal(preset?.templateImageUrl, "https://example.com/image.png");
  assert.equal(preset?.templateLayoutJson, "{\"ok\":true}");
});

test("sanitizeStoredCategoryTemplatePreset keeps the visual template id separate from its storage slot", () => {
  const preset = sanitizeStoredCategoryTemplatePreset(
    {
      templateId: "black",
      templateData: {},
      templateImageLayout: {},
      templateLayoutApply: {},
    },
    "default"
  );

  assert.equal(preset?.templateId, "black");
});

test("sanitizeStoredCategoryTemplatePreset removes dangerous JSON keys and bounds oversized payloads", () => {
  const dangerousTemplateData = JSON.parse(
    '{"safe":true,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'
  ) as Record<string, unknown>;
  const sanitized = sanitizeStoredCategoryTemplatePreset(
    {
      templateData: dangerousTemplateData,
      templateImageLayout: {},
      templateLayoutApply: {},
    },
    "default"
  );

  assert.equal((sanitized?.templateData as Record<string, unknown>).safe, true);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized?.templateData || {}, "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized?.templateData || {}, "constructor"), false);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);

  const oversized = sanitizeStoredCategoryTemplatePreset(
    {
      templateData: Object.fromEntries(
        Array.from({ length: 80 }, (_, index) => [`field-${index}`, "x".repeat(4_000)])
      ),
      templateImageLayout: {},
      templateLayoutApply: {},
    },
    "default"
  );
  assert.equal(oversized, null);
});

test("sanitizeStoredCategoryTemplatePresetMap and compaction keep template ids stable", () => {
  const sanitized = sanitizeStoredCategoryTemplatePresetMap({
    templates: {
      black: {
        templateImageEnabled: false,
        templateImageUrl: "https://example.com/a.png",
        templateLayoutJson: "{\"a\":1}",
      },
      extra: {
        templateImageEnabled: true,
        templateImageUrl: "https://example.com/b.png",
        templateLayoutJson: "{\"b\":2}",
      },
    },
  });
  const compacted = compactStoredCategoryTemplatePresetMap(
    {
      extra: sanitized.default,
      black: sanitized.black,
      default: sanitized.black ? { ...sanitized.black, templateId: "default" } : undefined,
    } as unknown as Parameters<typeof compactStoredCategoryTemplatePresetMap>[0],
    STUDIO_TEMPLATE_IDS
  );

  assert.equal(sanitized.black?.templateLayoutJson, "{\"a\":1}");
  assert.equal(sanitized.default?.templateImageEnabled, true);
  assert.deepEqual(Object.keys(compacted), ["default", "black"]);
});

test("compactStoredTemplatePromptMap keeps only known template ids", () => {
  const compacted = compactStoredTemplatePromptMap(
    {
      default: { topicToScriptPrompt: "a", scriptToJsonPrompt: "b" },
      extra: { topicToScriptPrompt: "x", scriptToJsonPrompt: "y" },
    } as unknown as Parameters<typeof compactStoredTemplatePromptMap>[0],
    STUDIO_TEMPLATE_IDS
  );

  assert.deepEqual(Object.keys(compacted), ["default"]);
});
