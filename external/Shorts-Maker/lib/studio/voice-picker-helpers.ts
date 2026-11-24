export const STUDIO_VOICE_FAVORITES_STORAGE_KEY = "shorts-json-studio:voice-favorites:v1";
export const STUDIO_VOICE_FAVORITES_CHANGED_EVENT = "shorts-json-studio:voice-favorites-changed";
export const STUDIO_VOICE_PICKER_RESULT_LIMIT = 48;

export type StudioVoiceSearchOption = {
  id: string;
  label: string;
  provider?: string;
  source?: string;
  description?: string;
};

type FilterStudioVoiceOptionsInput<TOption extends StudioVoiceSearchOption> = {
  options: TOption[];
  query?: string;
  favoriteIds?: Iterable<string>;
  selectedId?: string;
  favoriteOnly?: boolean;
  limit?: number;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function getTypecastVoiceId(value: string): string {
  const safeValue = asTrimmedString(value);
  if (!safeValue) return "";
  if (safeValue.startsWith("typecast:voice:")) {
    return asTrimmedString(safeValue.slice("typecast:voice:".length));
  }
  return safeValue;
}

export function normalizeStudioVoiceFavoriteId(value: string): string {
  const safeValue = asTrimmedString(value);
  if (!safeValue) return "";
  if (safeValue.startsWith("typecast:voice:") || safeValue.startsWith("tc_")) {
    const typecastVoiceId = getTypecastVoiceId(safeValue);
    return typecastVoiceId ? `typecast:voice:${typecastVoiceId}` : "";
  }
  return safeValue;
}

export function normalizeStudioVoiceFavoriteIds(values: Iterable<string>): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const id = normalizeStudioVoiceFavoriteId(value);
    if (id) normalized.add(id);
  }
  return Array.from(normalized);
}

export function getStudioVoiceSearchCorpus(option: StudioVoiceSearchOption): string {
  return [
    option.label,
    option.id,
    option.description,
    option.provider,
    option.source,
  ]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .join(" ");
}

function matchesSearchQuery(option: StudioVoiceSearchOption, query: string): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/u).filter(Boolean);
  if (tokens.length <= 0) return true;
  const corpus = getStudioVoiceSearchCorpus(option);
  return tokens.every((token) => corpus.includes(token));
}

export function filterStudioVoiceOptions<TOption extends StudioVoiceSearchOption>({
  options,
  query = "",
  favoriteIds = [],
  selectedId = "",
  favoriteOnly = false,
  limit = STUDIO_VOICE_PICKER_RESULT_LIMIT,
}: FilterStudioVoiceOptionsInput<TOption>): TOption[] {
  const favoriteSet = new Set(normalizeStudioVoiceFavoriteIds(favoriteIds));
  const selectedFavoriteId = normalizeStudioVoiceFavoriteId(selectedId);
  const cappedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : STUDIO_VOICE_PICKER_RESULT_LIMIT;
  const seenIds = new Set<string>();

  return options
    .map((option, index) => ({
      option,
      index,
      favorite: favoriteSet.has(normalizeStudioVoiceFavoriteId(option.id)),
      selected: Boolean(selectedFavoriteId && normalizeStudioVoiceFavoriteId(option.id) === selectedFavoriteId),
    }))
    .filter((entry) => {
      const id = asTrimmedString(entry.option.id);
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      if (favoriteOnly && !entry.favorite) return false;
      return matchesSearchQuery(entry.option, query);
    })
    .sort((left, right) => {
      if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      return left.index - right.index;
    })
    .slice(0, cappedLimit)
    .map((entry) => entry.option);
}
