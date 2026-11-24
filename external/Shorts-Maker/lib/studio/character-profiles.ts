import type { CharacterProfile } from "@/types/character-profile";

const DEFAULT_MAX_CHARACTER_PROFILES = 24;

function normalizeWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeStudioCharacterId(value: unknown): string {
  return normalizeWhitespace(value).replace(/\s+/g, "_").slice(0, 40);
}

export function normalizeStudioCharacterProfiles(
  value: unknown,
  options?: { maxProfiles?: number }
): CharacterProfile[] {
  if (!Array.isArray(value)) return [];
  const maxProfiles = Math.max(1, Math.min(80, Math.floor(options?.maxProfiles || DEFAULT_MAX_CHARACTER_PROFILES)));
  const deduped = new Map<string, CharacterProfile>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const characterId = normalizeStudioCharacterId(row.characterId);
    if (!characterId || deduped.has(characterId)) continue;
    deduped.set(characterId, {
      characterId,
      displayName: normalizeWhitespace(row.displayName).slice(0, 80) || undefined,
      identityPrompt: normalizeWhitespace(row.identityPrompt) || undefined,
      anchorImageUrl: normalizeWhitespace(row.anchorImageUrl).slice(0, 400) || undefined,
      anchorAssetId: normalizeWhitespace(row.anchorAssetId).slice(0, 120) || undefined,
    });
    if (deduped.size >= maxProfiles) break;
  }
  return Array.from(deduped.values());
}

export function hasStudioCharacterIdentity(
  profile: Pick<CharacterProfile, "identityPrompt" | "anchorImageUrl" | "anchorAssetId">
): boolean {
  return Boolean(
    String(profile.identityPrompt || "").trim() ||
      String(profile.anchorImageUrl || "").trim() ||
      String(profile.anchorAssetId || "").trim()
  );
}

export function resolveStudioCharacterProfileById(
  value: unknown,
  characterId: unknown
): CharacterProfile | undefined {
  const normalizedCharacterId = normalizeStudioCharacterId(characterId);
  if (!normalizedCharacterId) return undefined;
  return normalizeStudioCharacterProfiles(value).find(
    (profile) =>
      profile.characterId === normalizedCharacterId &&
      hasStudioCharacterIdentity(profile)
  );
}

export function resolveStudioFixedCharacterProfileRoster(
  canonicalValue: unknown,
  legacyValue: unknown
): {
  profiles: CharacterProfile[];
  source: "default" | "legacy" | "empty";
} {
  const canonicalProfiles = normalizeStudioCharacterProfiles(canonicalValue);
  if (canonicalProfiles.length > 0) {
    return { profiles: canonicalProfiles, source: "default" };
  }
  const legacyProfiles = normalizeStudioCharacterProfiles(legacyValue);
  if (legacyProfiles.length > 0) {
    return { profiles: legacyProfiles, source: "legacy" };
  }
  return { profiles: [], source: "empty" };
}

export function areStudioCharacterProfilesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeStudioCharacterProfiles(left)) ===
    JSON.stringify(normalizeStudioCharacterProfiles(right));
}
