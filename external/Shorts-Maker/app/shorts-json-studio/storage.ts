import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import { rebaseLocalStorageUrlsInJson } from "@/lib/local/asset-url-origin";
import {
  getClientWorkspaceScope,
  getScopedStorageKey,
  readScopedStorage,
  removeScopedStorage,
  writeScopedStorage,
} from "@/lib/ui/scoped-storage";
import {
  STUDIO_WORK_DRAFT_STORAGE_KEY,
  STUDIO_WORK_HISTORY_STORAGE_KEY,
  type StudioHistoryEntry,
  type StudioHistoryState,
  type StudioWorkDraft,
} from "./types";

export const STUDIO_LAST_PUBLISH_CATEGORY_KEY = "studio-last-publish-category-v1";
export const STUDIO_WORK_DRAFT_UPDATED_AT_STORAGE_KEY = "studio-work-draft-updated-at-v1";

const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";
const STUDIO_CATEGORY_SCOPE_SEGMENT = "category";
const STUDIO_STORAGE_MIGRATION_KEY = "studio-work-storage-migrated-v2";
const STUDIO_LEGACY_HISTORY_IGNORED_CATEGORIES_KEY = "studio-work-legacy-history-ignored-categories-v1";

function asObject<T extends object>(value: unknown): T | null {
  return value && typeof value === "object" ? (value as T) : null;
}

function parseStudioDraft(raw: string | null): StudioWorkDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject<StudioWorkDraft>(parsed);
  } catch {
    return null;
  }
}

function normalizeHistoryState(raw: string | null): StudioHistoryState {
  if (!raw) {
    return {
      activeHistoryId: null,
      historyEntries: [],
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asObject<Record<string, unknown>>(parsed);
    if (!record) {
      return {
        activeHistoryId: null,
        historyEntries: [],
      };
    }
    return {
      activeHistoryId: typeof record.activeHistoryId === "string" ? record.activeHistoryId : null,
      historyEntries: Array.isArray(record.historyEntries) ? (record.historyEntries as StudioHistoryEntry[]) : [],
    };
  } catch {
    return {
      activeHistoryId: null,
      historyEntries: [],
    };
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("QuotaExceededError") || message.includes("exceeded the quota");
}

function getCategoryScopedBaseKey(baseKey: string, category: PublishCategory): string {
  return `${baseKey}:${STUDIO_CATEGORY_SCOPE_SEGMENT}:${category}`;
}

function getDraftCategory(entry: StudioHistoryEntry): PublishCategory {
  return normalizeStudioStorageCategory(entry?.draft?.publishCategory);
}

function normalizeHistoryEntriesForCategory(entries: StudioHistoryEntry[], category: PublishCategory): StudioHistoryEntry[] {
  return entries
    .filter((entry) => entry && typeof entry === "object" && getDraftCategory(entry) === category)
    .map((entry) => ({
      ...entry,
      draft: {
        ...(entry.draft || {}),
        publishCategory: category,
      },
    }));
}

function mergeHistoryEntries(existing: StudioHistoryEntry[], incoming: StudioHistoryEntry[]): StudioHistoryEntry[] {
  const merged = new Map<string, StudioHistoryEntry>();
  for (const entry of [...incoming, ...existing]) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id || merged.has(id)) continue;
    merged.set(id, entry);
  }
  return Array.from(merged.values()).sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
}

function collectStoredStudioCategories(baseKey: string): PublishCategory[] {
  if (typeof window === "undefined") return [];
  const workspaceScope = getClientWorkspaceScope();
  const prefix = `${baseKey}:${STUDIO_CATEGORY_SCOPE_SEGMENT}:`;
  const suffix = `:${workspaceScope}`;
  const categories = new Set<PublishCategory>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || "";
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const categorySegment = key.slice(prefix.length, Math.max(prefix.length, key.length - suffix.length));
    const category = normalizeStudioStorageCategory(categorySegment);
    if (category) categories.add(category);
  }
  if (baseKey === STUDIO_WORK_HISTORY_STORAGE_KEY) {
    const ignoredCategories = readLegacyHistoryIgnoredCategories();
    const legacyHistoryState = readLegacyStudioHistoryState();
    for (const entry of legacyHistoryState.historyEntries) {
      const category = getDraftCategory(entry);
      if (!category || ignoredCategories.has(category)) continue;
      categories.add(category);
    }
  }
  return Array.from(categories);
}

function createHistoryStatePayload(
  category: PublishCategory,
  entries: StudioHistoryEntry[],
  activeHistoryId: string | null
): StudioHistoryState {
  const normalizedEntries = normalizeHistoryEntriesForCategory(entries, category);
  return {
    activeHistoryId:
      activeHistoryId && normalizedEntries.some((entry) => entry.id === activeHistoryId) ? activeHistoryId : null,
    historyEntries: normalizedEntries,
  };
}

function readLegacyHistoryIgnoredCategories(): Set<PublishCategory> {
  try {
    const raw = readScopedStorage(STUDIO_LEGACY_HISTORY_IGNORED_CATEGORIES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map((value) => normalizeStudioStorageCategory(value))
        .filter((value): value is PublishCategory => Boolean(value))
    );
  } catch {
    return new Set();
  }
}

function writeLegacyHistoryIgnoredCategories(categories: Set<PublishCategory>): void {
  writeScopedStorage(STUDIO_LEGACY_HISTORY_IGNORED_CATEGORIES_KEY, JSON.stringify(Array.from(categories.values()).sort()));
}

function markLegacyHistoryCategoryIgnored(category: PublishCategory): void {
  const next = readLegacyHistoryIgnoredCategories();
  if (next.has(category)) return;
  next.add(category);
  try {
    writeLegacyHistoryIgnoredCategories(next);
  } catch {
    // ignore localStorage failures
  }
}

function readLegacyStudioHistoryState(): StudioHistoryState {
  return normalizeHistoryState(readScopedStorage(STUDIO_WORK_HISTORY_STORAGE_KEY));
}

function readLegacyStudioHistoryForCategory(category: PublishCategory): StudioHistoryState {
  const ignoredCategories = readLegacyHistoryIgnoredCategories();
  if (ignoredCategories.has(category)) {
    return {
      activeHistoryId: null,
      historyEntries: [],
    };
  }
  const legacyState = readLegacyStudioHistoryState();
  const payload = createHistoryStatePayload(category, legacyState.historyEntries, legacyState.activeHistoryId);
  return payload;
}

function mergeHistoryStates(category: PublishCategory, states: StudioHistoryState[]): StudioHistoryState {
  const mergedEntries = mergeHistoryEntries(
    [],
    states.flatMap((state) => normalizeHistoryEntriesForCategory(state.historyEntries || [], category))
  );
  const nextActiveHistoryId =
    states.map((state) => state.activeHistoryId).find((id) => id && mergedEntries.some((entry) => entry.id === id)) || null;
  return {
    activeHistoryId: nextActiveHistoryId,
    historyEntries: mergedEntries,
  };
}

function writeStudioHistoryState(category: PublishCategory, state: StudioHistoryState): void {
  const normalizedEntries = normalizeHistoryEntriesForCategory(state.historyEntries || [], category);
  const nextActiveHistoryId =
    state.activeHistoryId && normalizedEntries.some((entry) => entry.id === state.activeHistoryId) ? state.activeHistoryId : null;
  if (normalizedEntries.length <= 0 && !nextActiveHistoryId) {
    markLegacyHistoryCategoryIgnored(category);
    removeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, category));
    return;
  }

  let candidateEntries = [...normalizedEntries];
  while (candidateEntries.length > 0) {
    try {
      writeScopedStorage(
        getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, category),
        JSON.stringify(createHistoryStatePayload(category, candidateEntries, nextActiveHistoryId))
      );
      markLegacyHistoryCategoryIgnored(category);
      return;
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      if (candidateEntries.length <= 1) break;
      const activeEntry =
        nextActiveHistoryId ? candidateEntries.find((entry) => entry.id === nextActiveHistoryId) || null : null;
      const trimmedEntries = candidateEntries.slice(0, Math.max(1, Math.floor(candidateEntries.length * 0.6)));
      candidateEntries =
        activeEntry && !trimmedEntries.some((entry) => entry.id === activeEntry.id)
          ? [activeEntry, ...trimmedEntries].slice(0, trimmedEntries.length)
          : trimmedEntries;
    }
  }

  try {
    writeScopedStorage(
      getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, category),
      JSON.stringify(createHistoryStatePayload(category, candidateEntries.slice(0, 1), nextActiveHistoryId))
    );
    markLegacyHistoryCategoryIgnored(category);
  } catch {
    // Keep the existing stored state if even a minimal payload does not fit.
  }
}

function migrateLegacyStudioStorage(): void {
  if (typeof window === "undefined") return;

  const alreadyMigrated = readScopedStorage(STUDIO_STORAGE_MIGRATION_KEY) === "1";
  if (alreadyMigrated) return;
  const legacyDraftRaw = readScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY);
  const legacyHistoryRaw = readScopedStorage(STUDIO_WORK_HISTORY_STORAGE_KEY);
  if (!legacyDraftRaw && !legacyHistoryRaw) {
    writeScopedStorage(STUDIO_STORAGE_MIGRATION_KEY, "1");
    return;
  }

  const legacyDraft = parseStudioDraft(legacyDraftRaw);
  if (legacyDraft) {
    const category = normalizeStudioStorageCategory(legacyDraft.publishCategory);
    const nextDraft: StudioWorkDraft = {
      ...legacyDraft,
      publishCategory: category,
    };
    const existingDraft = parseStudioDraft(readScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, category)));
    if (!existingDraft) {
      try {
        writeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, category), JSON.stringify(nextDraft));
      } catch {
        // Keep the legacy draft in place if the migrated key cannot be written.
        writeScopedStorage(STUDIO_STORAGE_MIGRATION_KEY, "1");
        return;
      }
    }
  }

  if (legacyDraftRaw) removeScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY);
  writeScopedStorage(STUDIO_STORAGE_MIGRATION_KEY, "1");
}

export function normalizeStudioStorageCategory(value: unknown): PublishCategory {
  return normalizeCategory(value) || DEFAULT_CATEGORY;
}

export function getStudioDraftScopedStorageKey(category: unknown): string {
  return getScopedStorageKey(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, normalizeStudioStorageCategory(category)));
}

export function getStudioHistoryScopedStorageKey(category: unknown): string {
  return getScopedStorageKey(getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, normalizeStudioStorageCategory(category)));
}

function matchesStudioStorageKey(key: string, baseKey: string): boolean {
  const workspaceScope = getClientWorkspaceScope();
  return key === getScopedStorageKey(baseKey) || (key.startsWith(`${baseKey}:${STUDIO_CATEGORY_SCOPE_SEGMENT}:`) && key.endsWith(`:${workspaceScope}`));
}

function rebaseStoredStudioLocalStorageUrls<T>(value: T): T {
  if (typeof window === "undefined") return value;
  try {
    return rebaseLocalStorageUrlsInJson(value, window.location.origin);
  } catch {
    return value;
  }
}

function readStoredStudioHistoryState(category: PublishCategory): StudioHistoryState {
  const scopedState = normalizeHistoryState(
    readScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, category))
  );
  const legacyState = readLegacyStudioHistoryForCategory(category);
  return mergeHistoryStates(category, [scopedState, legacyState]);
}

export function isStudioDraftStorageKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return matchesStudioStorageKey(key, STUDIO_WORK_DRAFT_STORAGE_KEY);
}

export function isStudioHistoryStorageKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return matchesStudioStorageKey(key, STUDIO_WORK_HISTORY_STORAGE_KEY);
}

export function readStoredStudioDraft(category: unknown): StudioWorkDraft | null {
  migrateLegacyStudioStorage();
  const normalizedCategory = normalizeStudioStorageCategory(category);
  const parsed =
    parseStudioDraft(readScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, normalizedCategory))) ||
    (() => {
      const legacyDraft = parseStudioDraft(readScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY));
      if (!legacyDraft) return null;
      return normalizeStudioStorageCategory(legacyDraft.publishCategory) === normalizedCategory ? legacyDraft : null;
    })();
  if (!parsed) return null;
  return rebaseStoredStudioLocalStorageUrls({
    ...parsed,
    publishCategory: normalizedCategory,
  });
}

export function listStoredStudioDraftCategories(): PublishCategory[] {
  migrateLegacyStudioStorage();
  return collectStoredStudioCategories(STUDIO_WORK_DRAFT_STORAGE_KEY).sort((left, right) =>
    left.localeCompare(right, "ko-KR")
  );
}

export function readStoredStudioDraftUpdatedAt(category: unknown): number {
  const normalizedCategory = normalizeStudioStorageCategory(category);
  const raw = readScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_UPDATED_AT_STORAGE_KEY, normalizedCategory));
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function writeStoredStudioDraft(category: unknown, draft: StudioWorkDraft): void {
  migrateLegacyStudioStorage();
  const normalizedCategory = normalizeStudioStorageCategory(category);
  const payload: StudioWorkDraft = {
    ...draft,
    publishCategory: normalizedCategory,
  };
  writeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, normalizedCategory), JSON.stringify(payload));
  try {
    writeScopedStorage(
      getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_UPDATED_AT_STORAGE_KEY, normalizedCategory),
      String(Date.now())
    );
  } catch {
    // The draft itself is authoritative; timestamp failure must not undo a successful save.
  }
  try {
    const legacyDraft = parseStudioDraft(readScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY));
    if (legacyDraft && normalizeStudioStorageCategory(legacyDraft.publishCategory) === normalizedCategory) {
      removeScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY);
    }
  } catch {
    // The scoped draft write has already succeeded; legacy cleanup is best-effort.
  }
}

export function removeStoredStudioDraft(category: unknown): void {
  migrateLegacyStudioStorage();
  const normalizedCategory = normalizeStudioStorageCategory(category);
  removeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_STORAGE_KEY, normalizedCategory));
  removeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_DRAFT_UPDATED_AT_STORAGE_KEY, normalizedCategory));
  const legacyDraft = parseStudioDraft(readScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY));
  if (legacyDraft && normalizeStudioStorageCategory(legacyDraft.publishCategory) === normalizedCategory) {
    removeScopedStorage(STUDIO_WORK_DRAFT_STORAGE_KEY);
  }
}

export function readStoredStudioHistory(category: unknown): StudioHistoryState {
  migrateLegacyStudioStorage();
  const normalizedCategory = normalizeStudioStorageCategory(category);
  return rebaseStoredStudioLocalStorageUrls(readStoredStudioHistoryState(normalizedCategory));
}

export function writeStoredStudioHistory(category: unknown, state: StudioHistoryState): void {
  migrateLegacyStudioStorage();
  writeStudioHistoryState(normalizeStudioStorageCategory(category), state);
}

export function setStoredStudioHistoryActiveId(category: unknown, activeHistoryId: string | null): void {
  const normalizedCategory = normalizeStudioStorageCategory(category);
  const current = readStoredStudioHistoryState(normalizedCategory);
  writeStudioHistoryState(normalizedCategory, {
    activeHistoryId,
    historyEntries: current.historyEntries,
  });
}

export function removeStoredStudioHistory(category: unknown): void {
  migrateLegacyStudioStorage();
  const normalizedCategory = normalizeStudioStorageCategory(category);
  markLegacyHistoryCategoryIgnored(normalizedCategory);
  removeScopedStorage(getCategoryScopedBaseKey(STUDIO_WORK_HISTORY_STORAGE_KEY, normalizedCategory));
}

export function listStoredStudioHistoryEntries(limit?: number): StudioHistoryEntry[] {
  migrateLegacyStudioStorage();
  const entriesById = new Map<string, StudioHistoryEntry>();
  for (const category of collectStoredStudioCategories(STUDIO_WORK_HISTORY_STORAGE_KEY)) {
    const state = readStoredStudioHistory(category);
    for (const entry of state.historyEntries) {
      const id = typeof entry?.id === "string" ? `${category}:${entry.id.trim()}` : "";
      if (!id || entriesById.has(id)) continue;
      entriesById.set(id, {
        ...entry,
        draft: {
          ...(entry.draft || {}),
          publishCategory: category,
        },
      });
    }
  }
  const sortedEntries = Array.from(entriesById.values()).sort(
    (left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "")
  );
  if (!Number.isFinite(Number(limit))) return sortedEntries;
  return sortedEntries.slice(0, Math.max(0, Math.floor(Number(limit))));
}
