"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import {
  filterStudioVoiceOptions,
  normalizeStudioVoiceFavoriteId,
  normalizeStudioVoiceFavoriteIds,
  STUDIO_VOICE_FAVORITES_CHANGED_EVENT,
  STUDIO_VOICE_FAVORITES_STORAGE_KEY,
  type StudioVoiceSearchOption,
} from "@/lib/studio/voice-picker-helpers";

type StudioVoicePickerProps<TOption extends StudioVoiceSearchOption> = {
  id?: string;
  value: string;
  options: TOption[];
  emptyLabel: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  customValueLabel?: string;
  className?: string;
  onChangeAction: (value: string) => void;
};

type StudioVoiceFavoritesChangedDetail = {
  favoriteIds?: string[];
};

function parseStoredFavoriteIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeStudioVoiceFavoriteIds(
      parsed.map((item) => (typeof item === "string" ? item : ""))
    ).slice(0, 200);
  } catch {
    return [];
  }
}

function readStoredFavoriteIds(): string[] {
  return parseStoredFavoriteIds(readScopedStorage(STUDIO_VOICE_FAVORITES_STORAGE_KEY));
}

function writeStoredFavoriteIds(favoriteIds: string[]): void {
  writeScopedStorage(
    STUDIO_VOICE_FAVORITES_STORAGE_KEY,
    JSON.stringify(normalizeStudioVoiceFavoriteIds(favoriteIds).slice(0, 200))
  );
}

function useStudioVoiceFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(readStoredFavoriteIds());

    const handleStorageChange = () => {
      setFavoriteIds(readStoredFavoriteIds());
    };
    const handleLocalChange = (event: Event) => {
      const customEvent = event as CustomEvent<StudioVoiceFavoritesChangedDetail>;
      setFavoriteIds(normalizeStudioVoiceFavoriteIds(customEvent.detail?.favoriteIds || []));
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(STUDIO_VOICE_FAVORITES_CHANGED_EVENT, handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(STUDIO_VOICE_FAVORITES_CHANGED_EVENT, handleLocalChange);
    };
  }, []);

  const persistFavoriteIds = useCallback((nextFavoriteIds: string[]) => {
    const normalized = normalizeStudioVoiceFavoriteIds(nextFavoriteIds).slice(0, 200);
    setFavoriteIds(normalized);
    try {
      writeStoredFavoriteIds(normalized);
      window.dispatchEvent(
        new CustomEvent<StudioVoiceFavoritesChangedDetail>(STUDIO_VOICE_FAVORITES_CHANGED_EVENT, {
          detail: { favoriteIds: normalized },
        })
      );
    } catch {
      return;
    }
  }, []);

  const toggleFavorite = useCallback(
    (voiceId: string) => {
      const normalizedVoiceId = normalizeStudioVoiceFavoriteId(voiceId);
      if (!normalizedVoiceId) return;
      const current = new Set(favoriteIds);
      if (current.has(normalizedVoiceId)) current.delete(normalizedVoiceId);
      else current.add(normalizedVoiceId);
      persistFavoriteIds(Array.from(current));
    },
    [favoriteIds, persistFavoriteIds]
  );

  return {
    favoriteIds,
    toggleFavorite,
  };
}

function toSelectedOptionFallback(value: string, label?: string): StudioVoiceSearchOption | null {
  const safeValue = value.trim();
  if (!safeValue) return null;
  return {
    id: safeValue,
    label: label || `custom: ${safeValue}`,
    provider: "typecast",
    source: "manual",
    description: "현재 선택된 커스텀 음성",
  };
}

function getVoiceLabel(option: StudioVoiceSearchOption | null, fallback: string): string {
  return option?.label || fallback;
}

export function StudioVoicePicker<TOption extends StudioVoiceSearchOption>({
  id,
  value,
  options,
  emptyLabel,
  disabled = false,
  searchPlaceholder = "영어 이름, voice id 검색",
  customValueLabel,
  className,
  onChangeAction,
}: StudioVoicePickerProps<TOption>) {
  const generatedId = useId();
  const searchInputId = id || `studio-voice-picker-search-${generatedId}`;
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const { favoriteIds, toggleFavorite } = useStudioVoiceFavorites();
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const safeValue = value.trim();
  const safeFavoriteId = normalizeStudioVoiceFavoriteId(safeValue);

  const allOptions = useMemo<StudioVoiceSearchOption[]>(() => {
    if (
      !safeValue ||
      options.some(
        (option) =>
          option.id === safeValue ||
          (safeFavoriteId && normalizeStudioVoiceFavoriteId(option.id) === safeFavoriteId)
      )
    ) {
      return options;
    }
    const fallback = toSelectedOptionFallback(safeValue, customValueLabel);
    return fallback ? [fallback, ...options] : options;
  }, [customValueLabel, options, safeFavoriteId, safeValue]);

  const selectedOption = useMemo(
    () =>
      allOptions.find(
        (option) =>
          option.id === safeValue ||
          (safeFavoriteId && normalizeStudioVoiceFavoriteId(option.id) === safeFavoriteId)
      ) || null,
    [allOptions, safeFavoriteId, safeValue]
  );

  const visibleOptions = useMemo(
    () =>
      filterStudioVoiceOptions({
        options: allOptions,
        query,
        favoriteIds,
        selectedId: safeValue,
        favoriteOnly,
      }),
    [allOptions, favoriteIds, favoriteOnly, query, safeValue]
  );

  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const showDefaultOption =
    !favoriteOnly &&
    (!normalizedQuery || emptyLabel.toLocaleLowerCase("en-US").includes(normalizedQuery));
  const selectedLabel = safeValue ? getVoiceLabel(selectedOption, safeValue) : emptyLabel;
  const handleSelectOption = useCallback(
    (nextValue: string) => {
      onChangeAction(nextValue);
      if (detailsRef.current) detailsRef.current.open = false;
    },
    [onChangeAction]
  );

  return (
    <details
      ref={detailsRef}
      className={`studio-voice-picker${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <summary className="studio-voice-picker-summary">
        <span className="studio-voice-picker-summary-copy">
          <span className="studio-voice-picker-summary-label">선택 음성</span>
          <strong>{selectedLabel}</strong>
        </span>
        <span className="studio-voice-picker-summary-count">{favoriteIds.length > 0 ? `즐겨찾기 ${favoriteIds.length}` : "열기"}</span>
      </summary>
      <div className="studio-voice-picker-panel">
        <div className="studio-voice-picker-tools">
          <input
            id={searchInputId}
            className="input-field studio-voice-picker-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            disabled={disabled}
          />
          <button
            type="button"
            className={`btn-secondary studio-voice-picker-favorites-filter${favoriteOnly ? " is-active" : ""}`}
            aria-pressed={favoriteOnly}
            onClick={() => setFavoriteOnly((current) => !current)}
            disabled={disabled}
          >
            즐겨찾기만
          </button>
        </div>
        <div className="studio-voice-picker-list" aria-label="음성 목록">
          {showDefaultOption ? (
            <button
              type="button"
              className={`studio-voice-picker-option-main studio-voice-picker-default-option${safeValue ? "" : " is-selected"}`}
              onClick={() => handleSelectOption("")}
              disabled={disabled}
            >
              <span className="studio-voice-picker-option-label">{emptyLabel}</span>
            </button>
          ) : null}
          {visibleOptions.map((option) => {
            const favoriteId = normalizeStudioVoiceFavoriteId(option.id);
            const isFavorite = favoriteSet.has(favoriteId);
            const isSelected = option.id === safeValue || (favoriteId && favoriteId === safeFavoriteId);
            return (
              <div key={option.id} className={`studio-voice-picker-option${isSelected ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="studio-voice-picker-option-main"
                  onClick={() => handleSelectOption(option.id)}
                  disabled={disabled}
                >
                  <span className="studio-voice-picker-option-label">{option.label}</span>
                  {option.description ? <span className="studio-voice-picker-option-description">{option.description}</span> : null}
                  <span className="studio-voice-picker-option-id">{option.id}</span>
                </button>
                <button
                  type="button"
                  className={`studio-voice-picker-favorite-button${isFavorite ? " is-active" : ""}`}
                  aria-pressed={isFavorite}
                  aria-label={`${option.label} 즐겨찾기 ${isFavorite ? "해제" : "추가"}`}
                  onClick={() => toggleFavorite(option.id)}
                  disabled={disabled}
                >
                  {isFavorite ? "★" : "☆"}
                </button>
              </div>
            );
          })}
          {!showDefaultOption && visibleOptions.length <= 0 ? (
            <div className="studio-voice-picker-empty">검색 결과 없음</div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
