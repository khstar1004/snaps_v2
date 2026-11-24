import type { SfxTag } from "@/types/studio-json";

export type StudioBgmOption = {
  id: string;
  label: string;
  path: string;
};

export const DEFAULT_STUDIO_BGM_TRACK_ID = "tango";
export const DEFAULT_STUDIO_BGM_PATH = "/bgm/Tango de la Noche - Wayne Jones.mp3";

export const STUDIO_BGM_OPTIONS: StudioBgmOption[] = [
  {
    id: DEFAULT_STUDIO_BGM_TRACK_ID,
    label: "Tango de la Noche",
    path: DEFAULT_STUDIO_BGM_PATH,
  },
  {
    id: "morning-stroll",
    label: "Morning Stroll",
    path: "/bgm/Morning Stroll - Josh Kirsch_Media Right Productions.mp3",
  },
];

export type StudioSfxOption = {
  id: string;
  tag: SfxTag;
  label: string;
  path: string;
  defaultGainDb: number;
};

export type StudioSfxCategoryOption = {
  id: string;
  label: string;
  files: StudioSfxOption[];
};

export const GENERAL_STUDIO_SFX_CATEGORY_ID = "일반 효과음";

export const LEGACY_STUDIO_SFX_TAG_ALIASES: Record<string, string> = {
  alert: "경고",
  fail: "실패",
  fun: "재미",
  general: GENERAL_STUDIO_SFX_CATEGORY_ID,
  generic: GENERAL_STUDIO_SFX_CATEGORY_ID,
  impact: "임팩트",
  question: "의문",
  sad: "슬픔",
  success: "성공",
  surprise: "놀람",
  tension: "긴장감",
  whoosh: "전환",
};

export function canonicalizeStudioSfxTag(tag: string): string {
  const safe = String(tag || "").trim();
  return LEGACY_STUDIO_SFX_TAG_ALIASES[safe] || safe;
}

export function resolveAutoSfxCategoryIds(
  categories: Array<{ id: string }>,
  generalCategoryId = GENERAL_STUDIO_SFX_CATEGORY_ID
): string[] {
  const normalized = Array.from(
    new Set(
      categories
        .map((category) => String(category?.id || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 24);
  if (normalized.length <= 0) return [];
  const specific = normalized.filter((categoryId) => categoryId !== generalCategoryId);
  if (specific.length > 0) return specific;
  const general = normalized.find((categoryId) => categoryId === generalCategoryId);
  if (general) return [general];
  return normalized.slice(0, 1);
}
