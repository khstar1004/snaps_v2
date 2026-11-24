import { randomUUID } from "node:crypto";
import { deleteAppCacheEntry, getAppCacheEntry, normalizeAppCacheUserScope, setAppCacheEntry } from "@/lib/supabase/app-cache";
import { hasSupabaseServiceConfig, selectSupabaseRows } from "@/lib/supabase/server";
import { getSharedStudioLibraryScope } from "@/lib/studio/library-scope";
import {
  DEFAULT_TYPECAST_EMOTION_TYPE,
  fetchTypecastVoices,
  getTypecastDefaultEmotionTypeFromEnv,
  normalizeTypecastEmotionType,
  normalizeTypecastSpeed,
} from "@/lib/studio/tts-typecast";
import { applyTypecastSpeedOverride } from "@/lib/studio/typecast-speed-override";

export type StudioTtsProvider = "typecast";

export type StudioTypecastSettingsRecord = {
  apiKey: string;
  defaultVoiceId: string;
  modelId: string;
  defaultLanguage: string;
  defaultEmotionType: string;
  speed: number;
};

type AppCacheEntryRow = {
  scope: string;
  user_scope: string;
  cache_key: string;
  value_text?: string | null;
  value_json?: unknown | null;
  updated_at_ms: number;
};

export type StudioTtsSettingsRecord = {
  defaultProvider: StudioTtsProvider;
  defaultVoiceId: string;
  previewText: string;
  typecast: StudioTypecastSettingsRecord;
  updatedAtMs: number;
};

export type StudioVoiceAssetRecord = {
  id: string;
  provider: StudioTtsProvider;
  name: string;
  description: string;
  previewText: string;
  tags: string[];
  createdAtMs: number;
  updatedAtMs: number;
  typecast: {
    voiceId: string;
    modelId: string;
    language: string;
    emotionType?: string;
  };
};

export type StudioVoiceOption = {
  id: string;
  label: string;
  provider: StudioTtsProvider;
  source: "asset" | "runtime" | "builtin";
  description?: string;
  previewText?: string;
};

export type StudioTtsRuntimeSnapshot = {
  reachable: boolean;
  provider: StudioTtsProvider;
  error?: string;
};

export type ResolvedStudioVoiceSelection = {
  id: string;
  label: string;
  provider: StudioTtsProvider;
  previewText: string;
  settings: StudioTtsSettingsRecord;
  typecast: {
    voiceId: string;
    modelId: string;
    language: string;
    emotionType: string;
  };
};

export type StudioVoiceSelectionOverrides = {
  typecastEmotionType?: string;
  typecastSpeed?: number;
};

const TTS_SETTINGS_SCOPE = "studio_tts_settings";
const TTS_SETTINGS_KEY = "default";
const TTS_VOICE_ASSET_SCOPE = "studio_tts_voice_asset";

const DEFAULT_PREVIEW_TEXT = "안녕하세요. 반갑습니다.";
const DEFAULT_TYPECAST_MODEL_ID = "ssfm-v30";
const DEFAULT_TYPECAST_LANGUAGE = "kor";
const DEFAULT_TYPECAST_VOICE_OPTIONS: Array<{ id: string; label: string }> = [];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function applyVoiceSelectionOverrides(settings: StudioTtsSettingsRecord, overrides: StudioVoiceSelectionOverrides): StudioTtsSettingsRecord {
  return applyTypecastSpeedOverride(settings, overrides.typecastSpeed);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter(Boolean)
    )
  );
}

function getSharedScope(): string {
  return normalizeAppCacheUserScope(getSharedStudioLibraryScope());
}

function parseTypecastVoiceOptionsFromEnv(): Array<{ id: string; label: string }> {
  const raw = (process.env.TYPECAST_VOICE_OPTIONS || "").trim();
  if (!raw) return [];
  const options: Array<{ id: string; label: string }> = [];
  for (const row of raw.split(",")) {
    const [idRaw, labelRaw] = row.split("|");
    const id = asString(idRaw);
    if (!id) continue;
    options.push({
      id,
      label: asString(labelRaw) || id,
    });
  }
  return options;
}

function createEnvBackedSettings(): StudioTtsSettingsRecord {
  const typecastDefaultVoiceId =
    asString(process.env.TYPECAST_DEFAULT_VOICE_ID) ||
    asString(process.env.TYPECAST_VOICE_ID);
  return {
    defaultProvider: "typecast",
    defaultVoiceId:
      asString(process.env.STUDIO_TTS_DEFAULT_VOICE_ID) ||
      (typecastDefaultVoiceId ? `typecast:voice:${typecastDefaultVoiceId}` : ""),
    previewText: asString(process.env.STUDIO_TTS_PREVIEW_TEXT) || DEFAULT_PREVIEW_TEXT,
    typecast: {
      apiKey: asString(process.env.TYPECAST_API_KEY),
      defaultVoiceId: typecastDefaultVoiceId,
      modelId: asString(process.env.TYPECAST_MODEL_ID) || DEFAULT_TYPECAST_MODEL_ID,
      defaultLanguage: asString(process.env.TYPECAST_DEFAULT_LANGUAGE) || DEFAULT_TYPECAST_LANGUAGE,
      defaultEmotionType: getTypecastDefaultEmotionTypeFromEnv(),
      speed: normalizeTypecastSpeed(Number(process.env.TYPECAST_SPEED || "1")),
    },
    updatedAtMs: Date.now(),
  };
}

function normalizeStudioTtsSettings(value: unknown): StudioTtsSettingsRecord {
  const envDefaults = createEnvBackedSettings();
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const typecast = row.typecast && typeof row.typecast === "object" ? (row.typecast as Record<string, unknown>) : {};
  const updatedAtMsRaw = Number(row.updatedAtMs);
  return {
    defaultProvider: "typecast",
    defaultVoiceId: asString(row.defaultVoiceId) || envDefaults.defaultVoiceId,
    previewText: asString(row.previewText) || envDefaults.previewText,
    typecast: {
      apiKey: asString(typecast.apiKey) || envDefaults.typecast.apiKey,
      defaultVoiceId: asString(typecast.defaultVoiceId) || envDefaults.typecast.defaultVoiceId,
      modelId: asString(typecast.modelId) || envDefaults.typecast.modelId,
      defaultLanguage: asString(typecast.defaultLanguage) || envDefaults.typecast.defaultLanguage,
      defaultEmotionType: normalizeTypecastEmotionType(
        asString(typecast.defaultEmotionType) || envDefaults.typecast.defaultEmotionType
      ),
      speed: normalizeTypecastSpeed(Number(typecast.speed ?? envDefaults.typecast.speed)),
    },
    updatedAtMs: Number.isFinite(updatedAtMsRaw) ? updatedAtMsRaw : envDefaults.updatedAtMs,
  };
}

function normalizeVoiceAsset(value: unknown, fallbackId?: string): StudioVoiceAssetRecord | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (asString(row.provider) && asString(row.provider) !== "typecast") return null;
  const typecast = row.typecast && typeof row.typecast === "object" ? (row.typecast as Record<string, unknown>) : {};
  const now = Date.now();
  const createdAtMs = Number(row.createdAtMs);
  const updatedAtMs = Number(row.updatedAtMs);
  const id = asString(row.id) || fallbackId || randomUUID();
  return {
    id,
    provider: "typecast",
    name: asString(row.name) || id,
    description: asString(row.description),
    previewText: asString(row.previewText) || DEFAULT_PREVIEW_TEXT,
    tags: asStringArray(row.tags).slice(0, 12),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : now,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : now,
    typecast: {
      voiceId: asString(typecast.voiceId),
      modelId: asString(typecast.modelId) || DEFAULT_TYPECAST_MODEL_ID,
      language: asString(typecast.language) || DEFAULT_TYPECAST_LANGUAGE,
      emotionType: asString(typecast.emotionType) || undefined,
    },
  };
}

async function listVoiceAssetRows(): Promise<AppCacheEntryRow[]> {
  if (!hasSupabaseServiceConfig()) return [];
  return selectSupabaseRows<AppCacheEntryRow>("app_cache_entries", {
    filters: {
      scope: TTS_VOICE_ASSET_SCOPE,
      user_scope: getSharedScope(),
    },
    orderBy: {
      column: "updated_at_ms",
      ascending: false,
    },
    limit: 500,
  });
}

export async function getStudioTtsSettings(): Promise<StudioTtsSettingsRecord> {
  if (!hasSupabaseServiceConfig()) {
    return createEnvBackedSettings();
  }
  const entry = await getAppCacheEntry(TTS_SETTINGS_SCOPE, getSharedScope(), TTS_SETTINGS_KEY);
  if (!entry) return createEnvBackedSettings();
  return normalizeStudioTtsSettings(entry.valueJson ?? entry.valueText);
}

export async function saveStudioTtsSettings(
  input: Partial<StudioTtsSettingsRecord> & {
    typecast?: Partial<StudioTtsSettingsRecord["typecast"]>;
  }
): Promise<StudioTtsSettingsRecord> {
  const current = await getStudioTtsSettings();
  const next = normalizeStudioTtsSettings({
    ...current,
    ...input,
    defaultProvider: "typecast",
    typecast: {
      ...current.typecast,
      ...(input.typecast || {}),
    },
    updatedAtMs: Date.now(),
  });
  await setAppCacheEntry({
    scope: TTS_SETTINGS_SCOPE,
    userScope: getSharedScope(),
    key: TTS_SETTINGS_KEY,
    value: next,
  });
  return next;
}

export async function listStudioVoiceAssets(): Promise<StudioVoiceAssetRecord[]> {
  const rows = await listVoiceAssetRows();
  return rows
    .map((row) => normalizeVoiceAsset(row.value_json ?? row.value_text, row.cache_key))
    .filter((asset): asset is StudioVoiceAssetRecord => Boolean(asset))
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs);
}

export async function getStudioVoiceAssetById(id: string): Promise<StudioVoiceAssetRecord | null> {
  const safeId = asString(id);
  if (!safeId) return null;
  if (!hasSupabaseServiceConfig()) return null;
  const entry = await getAppCacheEntry(TTS_VOICE_ASSET_SCOPE, getSharedScope(), safeId);
  if (!entry) return null;
  return normalizeVoiceAsset(entry.valueJson ?? entry.valueText, safeId);
}

export async function saveStudioVoiceAsset(input: Partial<StudioVoiceAssetRecord> & { id?: string }): Promise<StudioVoiceAssetRecord> {
  const existing = input.id ? await getStudioVoiceAssetById(input.id) : null;
  const next = normalizeVoiceAsset(
    {
      ...existing,
      ...input,
      provider: "typecast",
      typecast: {
        ...(existing?.typecast || {}),
        ...(input.typecast || {}),
      },
      createdAtMs: existing?.createdAtMs || Date.now(),
      updatedAtMs: Date.now(),
    },
    input.id
  );
  if (!next) {
    throw new Error("Typecast voice asset is required");
  }
  await setAppCacheEntry({
    scope: TTS_VOICE_ASSET_SCOPE,
    userScope: getSharedScope(),
    key: next.id,
    value: next,
  });
  return next;
}

export async function importTypecastVoiceCatalogAssets(input?: { limit?: number }): Promise<StudioVoiceAssetRecord[]> {
  const settings = await getStudioTtsSettings();
  if (!settings.typecast.apiKey) {
    throw new Error("TYPECAST_API_KEY가 필요합니다.");
  }
  const voices = await fetchTypecastVoices(
    { apiKey: settings.typecast.apiKey },
    { model: settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID }
  );
  const limit = Number.isFinite(input?.limit) ? Math.max(1, Math.min(100, Math.floor(Number(input?.limit)))) : 40;
  const imported: StudioVoiceAssetRecord[] = [];
  for (const voice of voices.slice(0, limit)) {
    const voiceId = asString(voice.voiceId);
    if (!voiceId) continue;
    imported.push(
      await saveStudioVoiceAsset({
        id: `typecast-sample-${voiceId}`,
        provider: "typecast",
        name: voice.voiceName || voiceId,
        description: [voice.gender, voice.age, ...voice.useCases].filter(Boolean).join(" · "),
        previewText: settings.previewText,
        tags: ["typecast", "sample", settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID],
        typecast: {
          voiceId,
          modelId: settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID,
          language: settings.typecast.defaultLanguage || DEFAULT_TYPECAST_LANGUAGE,
          emotionType: settings.typecast.defaultEmotionType || DEFAULT_TYPECAST_EMOTION_TYPE,
        },
      })
    );
  }
  return imported;
}

export async function deleteStudioVoiceAsset(id: string): Promise<void> {
  const safeId = asString(id);
  if (!safeId) return;
  if (!hasSupabaseServiceConfig()) return;
  await deleteAppCacheEntry(TTS_VOICE_ASSET_SCOPE, getSharedScope(), safeId);
}

function toVoiceOptionLabel(asset: StudioVoiceAssetRecord): string {
  return `${asset.name} · Typecast`;
}

function buildBuiltinTypecastOptions(settings: StudioTtsSettingsRecord): StudioVoiceOption[] {
  const merged = new Map<string, StudioVoiceOption>();
  for (const option of [...DEFAULT_TYPECAST_VOICE_OPTIONS, ...parseTypecastVoiceOptionsFromEnv()]) {
    merged.set(option.id, {
      id: `typecast:voice:${option.id}`,
      label: `${option.label} · Typecast`,
      provider: "typecast",
      source: "builtin",
    });
  }
  if (settings.typecast.defaultVoiceId) {
    const key = settings.typecast.defaultVoiceId;
    if (!merged.has(key)) {
      merged.set(key, {
        id: `typecast:voice:${key}`,
        label: "기본 Typecast 보이스",
        provider: "typecast",
        source: "builtin",
      });
    }
  }
  return Array.from(merged.values());
}

function dedupeStudioVoiceOptionsById(options: StudioVoiceOption[]): StudioVoiceOption[] {
  const merged = new Map<string, StudioVoiceOption>();
  for (const option of options) {
    const id = asString(option.id);
    if (!id || merged.has(id)) continue;
    merged.set(id, { ...option, id });
  }
  return Array.from(merged.values());
}

async function listTypecastVoiceOptions(settings: StudioTtsSettingsRecord): Promise<StudioVoiceOption[]> {
  if (!settings.typecast.apiKey) {
    return buildBuiltinTypecastOptions(settings);
  }

  try {
    const voices = await fetchTypecastVoices(
      { apiKey: settings.typecast.apiKey },
      { includeAllModels: true }
    );
    const options = new Map<string, StudioVoiceOption>();
    for (const voice of voices) {
      options.set(voice.voiceId, {
        id: `typecast:voice:${voice.voiceId}`,
        label: `${voice.voiceName} · Typecast`,
        provider: "typecast",
        source: "runtime",
        description: [voice.gender, voice.age, ...voice.useCases, ...voice.models.map((model) => model.version)]
          .filter(Boolean)
          .join(" · ") || undefined,
        previewText: settings.previewText,
      });
    }
    for (const option of buildBuiltinTypecastOptions(settings)) {
      const key = option.id.replace(/^typecast:voice:/, "");
      if (!options.has(key)) options.set(key, option);
    }
    return Array.from(options.values());
  } catch (error) {
    console.warn(`[studio] typecast voice list fallback: ${error instanceof Error ? error.message : String(error)}`);
    return buildBuiltinTypecastOptions(settings);
  }
}

export async function fetchStudioTtsRuntimeSnapshot(settings?: StudioTtsSettingsRecord): Promise<StudioTtsRuntimeSnapshot> {
  const current = settings || (await getStudioTtsSettings());
  return {
    provider: "typecast",
    reachable: Boolean(current.typecast.apiKey),
    error: current.typecast.apiKey ? undefined : "TYPECAST_API_KEY is not configured",
  };
}

export async function listStudioVoiceOptions(
  settings?: StudioTtsSettingsRecord,
  _runtime?: StudioTtsRuntimeSnapshot
): Promise<StudioVoiceOption[]> {
  const currentSettings = settings || (await getStudioTtsSettings());
  const assets = await listStudioVoiceAssets();
  const options = new Map<string, StudioVoiceOption>();

  for (const asset of assets) {
    options.set(asset.id, {
      id: asset.id,
      label: toVoiceOptionLabel(asset),
      provider: "typecast",
      source: "asset",
      description: asset.description || undefined,
      previewText: asset.previewText || undefined,
    });
  }

  for (const option of await listTypecastVoiceOptions(currentSettings)) {
    if (!options.has(option.id)) {
      options.set(option.id, option);
    }
  }

  return dedupeStudioVoiceOptionsById(Array.from(options.values()));
}

async function resolveTypecastDefaultVoiceId(settings: StudioTtsSettingsRecord): Promise<string> {
  const configured = asString(settings.typecast.defaultVoiceId);
  if (configured) return configured;
  try {
    const voices = await fetchTypecastVoices(
      { apiKey: settings.typecast.apiKey },
      { model: settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID }
    );
    return asString(voices[0]?.voiceId);
  } catch {
    return "";
  }
}

function resolveTypecastEmotionType(
  settings: StudioTtsSettingsRecord,
  overrides?: StudioVoiceSelectionOverrides,
  fallbackEmotionType?: string
): string {
  return normalizeTypecastEmotionType(
    asString(overrides?.typecastEmotionType) || asString(fallbackEmotionType) || settings.typecast.defaultEmotionType
  );
}

function buildTypecastDefaultSelection(
  settings: StudioTtsSettingsRecord,
  voiceId: string,
  overrides?: StudioVoiceSelectionOverrides,
  modelId?: string
): ResolvedStudioVoiceSelection {
  return {
    id: `typecast:voice:${voiceId || "default"}`,
    label: voiceId ? "Typecast 기본 설정" : "Typecast Voice",
    provider: "typecast",
    previewText: settings.previewText,
    settings,
    typecast: {
      voiceId,
      modelId: modelId || settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID,
      language: settings.typecast.defaultLanguage || DEFAULT_TYPECAST_LANGUAGE,
      emotionType: resolveTypecastEmotionType(
        settings,
        overrides,
        settings.typecast.defaultEmotionType || DEFAULT_TYPECAST_EMOTION_TYPE
      ),
    },
  };
}

async function resolveTypecastModelIdForVoice(settings: StudioTtsSettingsRecord, voiceId: string): Promise<string> {
  const configuredModelId = settings.typecast.modelId || DEFAULT_TYPECAST_MODEL_ID;
  if (!settings.typecast.apiKey || !voiceId) return configuredModelId;
  try {
    const voices = await fetchTypecastVoices(
      { apiKey: settings.typecast.apiKey },
      { includeAllModels: true }
    );
    const matched = voices.find((voice) => voice.voiceId === voiceId);
    if (!matched) return configuredModelId;
    const modelVersions = matched.models.map((model) => model.version).filter(Boolean);
    if (modelVersions.includes(configuredModelId)) return configuredModelId;
    if (modelVersions.includes(DEFAULT_TYPECAST_MODEL_ID)) return DEFAULT_TYPECAST_MODEL_ID;
    return modelVersions[0] || configuredModelId;
  } catch {
    return configuredModelId;
  }
}

export async function resolveStudioVoiceSelection(
  voiceId?: string,
  input?: {
    settings?: StudioTtsSettingsRecord;
    runtime?: StudioTtsRuntimeSnapshot;
    voiceAssets?: StudioVoiceAssetRecord[];
    typecastEmotionType?: string;
    typecastSpeed?: number;
  }
): Promise<ResolvedStudioVoiceSelection> {
  const baseSettings = input?.settings || (await getStudioTtsSettings());
  const voiceAssets = input?.voiceAssets || (await listStudioVoiceAssets());
  const overrides: StudioVoiceSelectionOverrides = {
    typecastEmotionType: asString(input?.typecastEmotionType) || undefined,
    typecastSpeed: Number.isFinite(input?.typecastSpeed) ? normalizeTypecastSpeed(Number(input?.typecastSpeed)) : undefined,
  };
  const settings = applyVoiceSelectionOverrides(baseSettings, overrides);
  const requestedId = asString(voiceId) || settings.defaultVoiceId;

  const matchedAsset = requestedId ? voiceAssets.find((asset) => asset.id === requestedId) : null;
  if (matchedAsset) {
    return {
      id: matchedAsset.id,
      label: matchedAsset.name,
      provider: "typecast",
      previewText: matchedAsset.previewText || settings.previewText,
      settings,
      typecast: {
        voiceId: matchedAsset.typecast.voiceId || settings.typecast.defaultVoiceId,
        modelId: matchedAsset.typecast.modelId || settings.typecast.modelId,
        language: matchedAsset.typecast.language || settings.typecast.defaultLanguage,
        emotionType: resolveTypecastEmotionType(settings, overrides, matchedAsset.typecast.emotionType),
      },
    };
  }

  if (requestedId.startsWith("typecast:voice:")) {
    const candidate = requestedId.slice("typecast:voice:".length).trim();
    const resolvedVoiceId = candidate || settings.typecast.defaultVoiceId;
    return buildTypecastDefaultSelection(
      settings,
      resolvedVoiceId,
      overrides,
      await resolveTypecastModelIdForVoice(settings, resolvedVoiceId)
    );
  }

  if (requestedId.startsWith("tc_")) {
    return buildTypecastDefaultSelection(
      settings,
      requestedId,
      overrides,
      await resolveTypecastModelIdForVoice(settings, requestedId)
    );
  }

  return buildTypecastDefaultSelection(settings, await resolveTypecastDefaultVoiceId(settings), overrides);
}
