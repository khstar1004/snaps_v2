import { toImageProxyUrl } from "@/lib/studio/image-proxy";
import type { StoryCharacterProfileEditorRow } from "./studio-page-helpers";

export type StoryCharacterProfileEditableField =
  | "displayName"
  | "identityPrompt"
  | "anchorImageUrl"
  | "anchorAssetId";

export function getNextStoryCharacterId(rows: Pick<StoryCharacterProfileEditorRow, "characterId">[]): string {
  const usedIds = new Set(rows.map((row) => String(row.characterId || "").trim()).filter(Boolean));
  let index = 1;
  while (usedIds.has(`character_${index}`)) {
    index += 1;
  }
  return `character_${index}`;
}

export function createEmptyStoryCharacterProfileRow(
  rows: Pick<StoryCharacterProfileEditorRow, "characterId">[]
): StoryCharacterProfileEditorRow {
  const characterId = getNextStoryCharacterId(rows);
  const index = characterId.match(/^character_(\d+)$/u)?.[1] || "";
  return {
    characterId,
    displayName: index ? `새 캐릭터 ${index}` : "새 캐릭터",
    identityPrompt: "",
    anchorImageUrl: "",
    anchorAssetId: "",
    sampleTexts: [],
    isInferred: false,
  };
}

export function updateStoryCharacterProfileRow(
  rows: StoryCharacterProfileEditorRow[],
  characterId: string,
  field: StoryCharacterProfileEditableField,
  value: string
): StoryCharacterProfileEditorRow[] {
  return rows.map((row) => (row.characterId === characterId ? { ...row, [field]: value } : row));
}

export function removeStoryCharacterProfileRow(
  rows: StoryCharacterProfileEditorRow[],
  characterId: string
): StoryCharacterProfileEditorRow[] {
  return rows.filter((row) => row.characterId !== characterId);
}

export function resolveStoryCharacterAnchorPreviewUrl(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("/api/local-storage/") && !value.startsWith("//")) return value;
  return toImageProxyUrl(value);
}
