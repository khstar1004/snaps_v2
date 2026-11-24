import { normalizeStudioTemplateId, STUDIO_TEMPLATE_IDS, type StudioTemplateId } from "@/types/studio-template";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import type { StudioPromptTemplates } from "@/lib/studio/prompt-templates";
import { isDefaultStudioPromptTemplate, sanitizeStoredStudioPromptTemplates } from "@/lib/studio/prompt-templates";

export type StoredTemplatePromptMap = Partial<Record<StudioTemplateId, Partial<StudioPromptTemplates>>>;
export type StoredCategoryTemplatePresetMap = Partial<Record<StudioTemplateId, PublishCategoryTemplatePreset>>;

const MAX_TEMPLATE_JSON_DEPTH = 8;
const MAX_TEMPLATE_JSON_KEYS = 80;
const MAX_TEMPLATE_JSON_ARRAY_LENGTH = 80;
const MAX_TEMPLATE_JSON_STRING_LENGTH = 2_000;
const MAX_TEMPLATE_JSON_NODES = 600;
const MAX_TEMPLATE_PRESET_SERIALIZED_LENGTH = 100_000;
const MAX_TEMPLATE_URL_LENGTH = 2_000;
const MAX_TEMPLATE_LAYOUT_JSON_LENGTH = 20_000;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function safeTrim(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cloneBoundedTemplateJsonObject(value: unknown): Record<string, unknown> | null {
  let nodeCount = 0;
  const visit = (item: unknown, depth: number): unknown => {
    nodeCount += 1;
    if (nodeCount > MAX_TEMPLATE_JSON_NODES || depth > MAX_TEMPLATE_JSON_DEPTH) return undefined;
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : undefined;
    if (typeof item === "string") return item.slice(0, MAX_TEMPLATE_JSON_STRING_LENGTH);
    if (Array.isArray(item)) {
      return item
        .slice(0, MAX_TEMPLATE_JSON_ARRAY_LENGTH)
        .map((entry) => visit(entry, depth + 1))
        .filter((entry) => typeof entry !== "undefined");
    }
    const record = asRecord(item);
    if (!record) return undefined;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [rawKey, entry] of Object.entries(record).slice(0, MAX_TEMPLATE_JSON_KEYS)) {
      const key = safeTrim(rawKey, 240);
      if (!key || DANGEROUS_JSON_KEYS.has(key)) continue;
      const next = visit(entry, depth + 1);
      if (typeof next !== "undefined") result[key] = next;
    }
    return result;
  };
  return asRecord(visit(value, 0));
}

export function sanitizeStoredTemplatePromptMap(
  input: unknown,
  defaultTemplateId: StudioTemplateId = STUDIO_TEMPLATE_IDS[0]
): StoredTemplatePromptMap {
  const result: StoredTemplatePromptMap = {};
  const legacy = sanitizeStoredStudioPromptTemplates(input);
  if (Object.keys(legacy).length > 0) {
    result[defaultTemplateId] = legacy;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  const row = input as Record<string, unknown>;
  const templateRow =
    row.templates && typeof row.templates === "object" && !Array.isArray(row.templates)
      ? (row.templates as Record<string, unknown>)
      : row;
  for (const [rawTemplateId, value] of Object.entries(templateRow)) {
    const templateId = normalizeStudioTemplateId(rawTemplateId);
    const sanitized = sanitizeStoredStudioPromptTemplates(value);
    if (Object.keys(sanitized).length <= 0) continue;
    result[templateId] = {
      ...(result[templateId] || {}),
      ...sanitized,
    };
  }
  return result;
}

export function sanitizeStoredPromptTemplatePayload(
  templates: Partial<StudioPromptTemplates> | null,
  templateId: StudioTemplateId
): Partial<StudioPromptTemplates> {
  const sanitized = sanitizeStoredStudioPromptTemplates(templates);
  const payload: Partial<StudioPromptTemplates> = {};
  if (
    sanitized.topicToScriptPrompt &&
    !isDefaultStudioPromptTemplate("topicToScriptPrompt", sanitized.topicToScriptPrompt, templateId)
  ) {
    payload.topicToScriptPrompt = sanitized.topicToScriptPrompt;
  }
  if (
    sanitized.scriptToJsonPrompt &&
    !isDefaultStudioPromptTemplate("scriptToJsonPrompt", sanitized.scriptToJsonPrompt, templateId)
  ) {
    payload.scriptToJsonPrompt = sanitized.scriptToJsonPrompt;
  }
  return payload;
}

export function compactStoredTemplatePromptMap(
  map: StoredTemplatePromptMap,
  templateIds: readonly StudioTemplateId[] = STUDIO_TEMPLATE_IDS
): StoredTemplatePromptMap {
  const compacted: StoredTemplatePromptMap = {};
  for (const templateId of templateIds) {
    const sanitized = sanitizeStoredStudioPromptTemplates(map[templateId]);
    if (Object.keys(sanitized).length <= 0) continue;
    compacted[templateId] = sanitized;
  }
  return compacted;
}

export function sanitizeStoredCategoryTemplatePreset(
  input: unknown,
  fallbackTemplateId: StudioTemplateId
): PublishCategoryTemplatePreset | null {
  const row = asRecord(input);
  if (!row) return null;
  const templateData = cloneBoundedTemplateJsonObject(row.templateData ?? {});
  const templateImageLayout = cloneBoundedTemplateJsonObject(row.templateImageLayout ?? {});
  const templateLayoutApply = asRecord(row.templateLayoutApply) || {};
  if (!templateData || !templateImageLayout || !templateLayoutApply) return null;
  const sanitized: PublishCategoryTemplatePreset = {
    templateId: normalizeStudioTemplateId(row.templateId ?? fallbackTemplateId),
    templateData: templateData as PublishCategoryTemplatePreset["templateData"],
    templateImageEnabled: Boolean(row.templateImageEnabled),
    templateImageUrl: safeTrim(row.templateImageUrl, MAX_TEMPLATE_URL_LENGTH),
    templateImageLayout: templateImageLayout as PublishCategoryTemplatePreset["templateImageLayout"],
    templateLayoutApply: {
      title: templateLayoutApply.title === true,
      body: templateLayoutApply.body === true,
      image: templateLayoutApply.image === true,
      info: templateLayoutApply.info === true,
    },
    templateLayoutJson: safeTrim(row.templateLayoutJson, MAX_TEMPLATE_LAYOUT_JSON_LENGTH) || undefined,
  };
  return JSON.stringify(sanitized).length <= MAX_TEMPLATE_PRESET_SERIALIZED_LENGTH ? sanitized : null;
}

export function sanitizeStoredCategoryTemplatePresetMap(
  input: unknown
): StoredCategoryTemplatePresetMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const row = input as Record<string, unknown>;
  const templateRow =
    row.templates && typeof row.templates === "object" && !Array.isArray(row.templates)
      ? (row.templates as Record<string, unknown>)
      : row;
  const result: StoredCategoryTemplatePresetMap = {};
  for (const [rawTemplateId, value] of Object.entries(templateRow)) {
    const templateId = normalizeStudioTemplateId(rawTemplateId);
    const sanitized = sanitizeStoredCategoryTemplatePreset(value, templateId);
    if (!sanitized) continue;
    result[templateId] = sanitized;
  }
  return result;
}

export function compactStoredCategoryTemplatePresetMap(
  map: StoredCategoryTemplatePresetMap,
  templateIds: readonly StudioTemplateId[] = STUDIO_TEMPLATE_IDS
): StoredCategoryTemplatePresetMap {
  const compacted: StoredCategoryTemplatePresetMap = {};
  for (const templateId of templateIds) {
    const sanitized = sanitizeStoredCategoryTemplatePreset(map[templateId], templateId);
    if (!sanitized) continue;
    compacted[templateId] = sanitized;
  }
  return compacted;
}
