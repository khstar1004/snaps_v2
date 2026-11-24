import type { PreparedSlide } from "@/types/studio-json";
import type { StudioAssetSnapshot, StudioAssetSnapshotDraft } from "@/types/studio-snapshot";
import { inferMediaKindFromUrl } from "@/lib/studio/media-url-utils";

type JsonObject = Record<string, unknown>;

const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type DurableSnapshotMediaResult = {
  snapshot: StudioAssetSnapshot;
  removedCount: number;
};

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function isNonDurableMediaUrl(value: unknown): boolean {
  return typeof value === "string" && /^(?:blob|data):/i.test(value.trim());
}

function isUrlField(key: string): boolean {
  return /(?:url|uri)$/i.test(key);
}

function isAnchorUrlField(key: string): boolean {
  return key === "anchorImageUrl" || key === "mascotAnchorImageUrl";
}

function stripTransientUrlSecrets(value: string): string {
  const normalized = value.trim();
  if (!normalized) return value;
  try {
    const isRelative = normalized.startsWith("/");
    const parsed = new URL(normalized, "http://local.invalid");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return value;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return isRelative ? parsed.pathname : parsed.toString();
  } catch {
    return value;
  }
}

function redactTransientUrlsInPrompt(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']+/giu, (rawUrl) => {
    const punctuation = rawUrl.match(/[),.;!?]+$/u)?.[0] || "";
    const url = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
    return `${stripTransientUrlSecrets(url)}${punctuation}`;
  });
}

function repairMediaKindAfterUrlRemoval(row: JsonObject, removedUrlFields: Set<string>): void {
  if (
    typeof row.mediaKind !== "string" ||
    !["imageUrl", "resolvedImageUrl", "mediaUrl", "resolvedMediaUrl"].some((field) => removedUrlFields.has(field))
  ) {
    return;
  }
  const remainingUrl = [row.mediaUrl, row.resolvedMediaUrl, row.imageUrl, row.resolvedImageUrl].find(
    (value): value is string => typeof value === "string" && Boolean(value.trim())
  );
  const inferredKind = inferMediaKindFromUrl(remainingUrl);
  if (inferredKind) {
    row.mediaKind = inferredKind;
  } else {
    delete row.mediaKind;
  }
}

function sanitizeValue(value: unknown, key = ""): { value: unknown; removedCount: number } {
  if (isUrlField(key) && isNonDurableMediaUrl(value)) {
    return { value: undefined, removedCount: 1 };
  }
  if (isAnchorUrlField(key) && typeof value === "string") {
    return { value: stripTransientUrlSecrets(value), removedCount: 0 };
  }
  if ((key === "basePrompt" || key === "finalPrompt") && typeof value === "string") {
    return { value: redactTransientUrlsInPrompt(value), removedCount: 0 };
  }
  if (Array.isArray(value)) {
    let removedCount = 0;
    const next = value
      .map((item) => {
        const sanitized = sanitizeValue(item);
        removedCount += sanitized.removedCount;
        return sanitized.value;
      })
      .filter((item) => item !== undefined);
    return { value: next, removedCount };
  }
  const row = asObject(value);
  if (!row) return { value, removedCount: 0 };

  let removedCount = 0;
  const removedUrlFields = new Set<string>();
  const next: JsonObject = {};
  for (const [field, fieldValue] of Object.entries(row)) {
    if (DANGEROUS_OBJECT_KEYS.has(field)) continue;
    const sanitized = sanitizeValue(fieldValue, field);
    removedCount += sanitized.removedCount;
    if (sanitized.value !== undefined) {
      next[field] = sanitized.value;
    } else if (sanitized.removedCount > 0 && isUrlField(field)) {
      removedUrlFields.add(field);
    }
  }
  repairMediaKindAfterUrlRemoval(next, removedUrlFields);
  return { value: next, removedCount };
}

function cleanImageSelections(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(cleanImageSelections);
    return;
  }
  const row = asObject(value);
  if (!row) return;
  const selection = asObject(row.imageSelection);
  if (selection && Array.isArray(selection.candidateOptions)) {
    const candidates = selection.candidateOptions.filter((candidate) => {
      const candidateRow = asObject(candidate);
      return Boolean(candidateRow && typeof candidateRow.imageUrl === "string" && candidateRow.imageUrl.trim());
    });
    selection.candidateOptions = candidates;
    const selectedCandidateId = typeof selection.selectedCandidateId === "string" ? selection.selectedCandidateId.trim() : "";
    if (
      selectedCandidateId &&
      !candidates.some((candidate) => String(asObject(candidate)?.candidateId || "").trim() === selectedCandidateId)
    ) {
      delete selection.selectedCandidateId;
    }
  }
  Object.values(row).forEach(cleanImageSelections);
}

function sanitizeJsonText(value: unknown): { value: unknown; removedCount: number } {
  if (typeof value !== "string" || !value.trim()) return { value, removedCount: 0 };
  try {
    const parsed = JSON.parse(value) as unknown;
    const sanitized = sanitizeValue(parsed);
    const changed = JSON.stringify(sanitized.value) !== JSON.stringify(parsed);
    if (sanitized.removedCount <= 0 && !changed) return { value, removedCount: 0 };
    cleanImageSelections(sanitized.value);
    return {
      value: JSON.stringify(sanitized.value, null, 2),
      removedCount: sanitized.removedCount,
    };
  } catch {
    return { value, removedCount: 0 };
  }
}

function cleanSnapshotCollections(draft: StudioAssetSnapshotDraft): void {
  if (Array.isArray(draft.preselectedMediaItems)) {
    draft.preselectedMediaItems = draft.preselectedMediaItems.filter(
      (item) => typeof item.imageUrl === "string" && item.imageUrl.trim()
    );
  }
  if (Array.isArray(draft.slides)) {
    cleanImageSelections(draft.slides);
  }
}

export function sanitizeStudioAssetSnapshotMedia(snapshot: StudioAssetSnapshot): DurableSnapshotMediaResult {
  const sanitized = sanitizeValue(snapshot);
  const next = (asObject(sanitized.value) || {}) as StudioAssetSnapshot;
  const draft = asObject(next.draft) as StudioAssetSnapshotDraft | null;
  let removedCount = sanitized.removedCount;
  if (draft) {
    const jsonText = sanitizeJsonText(draft.jsonText);
    if (jsonText.value !== undefined) draft.jsonText = jsonText.value as string;
    removedCount += jsonText.removedCount;
    cleanSnapshotCollections(draft);
    if (removedCount > 0 || draft.nonDurableMediaRemoved === true) {
      draft.nonDurableMediaRemoved = true;
    }
  }
  return {
    snapshot: next,
    removedCount,
  };
}

export function sanitizeStudioSnapshotSlides(slides: PreparedSlide[]): {
  slides: PreparedSlide[];
  removedCount: number;
} {
  const sanitized = sanitizeValue(slides);
  const next = Array.isArray(sanitized.value) ? (sanitized.value as PreparedSlide[]) : [];
  cleanImageSelections(next);
  return {
    slides: next,
    removedCount: sanitized.removedCount,
  };
}
