import type { StudioVoiceOption } from "./use-studio-bootstrap-data";

function asTrimmedString(value: string): string {
  return String(value || "").trim();
}

export function dedupeStudioVoiceOptionsById(options: StudioVoiceOption[]): StudioVoiceOption[] {
  const merged: StudioVoiceOption[] = [];
  const seenIds = new Set<string>();

  for (const option of options) {
    const safeId = asTrimmedString(option?.id || "");
    if (!safeId || seenIds.has(safeId)) continue;
    seenIds.add(safeId);
    merged.push({ ...option, id: safeId });
  }

  return merged;
}

export function getTypecastVoiceCatalogId(value: string): string {
  const safeValue = asTrimmedString(value);
  if (!safeValue) return "";
  if (safeValue.startsWith("typecast:voice:")) {
    return asTrimmedString(safeValue.slice("typecast:voice:".length));
  }
  return safeValue;
}

export function toNormalizedTypecastVoiceOptionId(value: string): string {
  const safeValue = asTrimmedString(value);
  if (!safeValue) return "";
  if (safeValue.startsWith("typecast:voice:")) {
    const catalogId = getTypecastVoiceCatalogId(safeValue);
    return catalogId ? `typecast:voice:${catalogId}` : "";
  }
  return `typecast:voice:${safeValue}`;
}

function getVoiceOptionCanonicalKey(input: Pick<StudioVoiceOption, "id" | "provider"> | { id: string; provider?: StudioVoiceOption["provider"] }): string {
  const safeId = asTrimmedString(input.id);
  if (!safeId) return "";
  const provider = input.provider;
  if (provider === "typecast" || safeId.startsWith("typecast:voice:") || safeId.startsWith("tc_")) {
    const catalogId = getTypecastVoiceCatalogId(safeId);
    return catalogId ? `typecast:${catalogId}` : "";
  }
  return `voice:${safeId}`;
}

export function createManualTypecastVoiceOption(
  value: string,
  options?: { preserveExactId?: boolean }
): StudioVoiceOption | null {
  const safeValue = asTrimmedString(value);
  const catalogId = getTypecastVoiceCatalogId(safeValue);
  if (!catalogId) return null;
  const optionId = options?.preserveExactId ? safeValue : toNormalizedTypecastVoiceOptionId(safeValue);
  return {
    id: optionId,
    label: `${catalogId} · Typecast 직접 추가`,
    provider: "typecast",
    source: "manual",
    description: "voice id로 직접 추가한 Typecast 음성",
  };
}

export function mergeStudioVoiceOptions(
  baseOptions: StudioVoiceOption[],
  manualOptions: StudioVoiceOption[],
  selectedVoiceId: string
): StudioVoiceOption[] {
  const merged: StudioVoiceOption[] = [];
  const seenCanonicalKeys = new Set<string>();

  const appendOption = (option: StudioVoiceOption | null) => {
    if (!option) return;
    const key = getVoiceOptionCanonicalKey(option);
    if (!key || seenCanonicalKeys.has(key)) return;
    seenCanonicalKeys.add(key);
    merged.push(option);
  };

  baseOptions.forEach(appendOption);
  manualOptions.forEach(appendOption);

  const selectedOption = createManualTypecastVoiceOption(selectedVoiceId, { preserveExactId: true });
  appendOption(selectedOption);

  return dedupeStudioVoiceOptionsById(merged);
}

export function findMatchingStudioVoiceOption(
  options: StudioVoiceOption[],
  voiceId: string
): StudioVoiceOption | null {
  const safeVoiceId = asTrimmedString(voiceId);
  if (!safeVoiceId) return null;
  const targetKey = getVoiceOptionCanonicalKey({ id: safeVoiceId });
  if (!targetKey) return null;
  return options.find((option) => getVoiceOptionCanonicalKey(option) === targetKey) || null;
}

export function addManualTypecastVoiceOption(
  baseOptions: StudioVoiceOption[],
  manualOptions: StudioVoiceOption[],
  rawVoiceId: string
): { manualOptions: StudioVoiceOption[]; selectedVoiceId: string } | null {
  const nextOption = createManualTypecastVoiceOption(rawVoiceId);
  if (!nextOption) return null;

  const nextKey = getVoiceOptionCanonicalKey(nextOption);
  const existingOption = [...manualOptions, ...baseOptions].find((option) => getVoiceOptionCanonicalKey(option) === nextKey);
  if (existingOption) {
    return {
      manualOptions,
      selectedVoiceId: existingOption.id,
    };
  }

  const dedupedManualOptions = manualOptions.filter((option) => getVoiceOptionCanonicalKey(option) !== nextKey);
  return {
    manualOptions: [...dedupedManualOptions, nextOption],
    selectedVoiceId: nextOption.id,
  };
}
