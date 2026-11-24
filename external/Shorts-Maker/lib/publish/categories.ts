import type { PublishCategory } from "@/lib/publish/types";

export const DEFAULT_PUBLISH_CATEGORY_OPTIONS: Array<{ key: PublishCategory; label: string }> = [
  { key: "default", label: "기본" },
];

export const DEFAULT_PUBLISH_CATEGORIES: PublishCategory[] = DEFAULT_PUBLISH_CATEGORY_OPTIONS.map((item) => item.key);

export function normalizeCategory(value: unknown): PublishCategory {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw;
}

export function toCategoryLabel(category: PublishCategory): string {
  const matched = DEFAULT_PUBLISH_CATEGORY_OPTIONS.find((item) => item.key === category);
  if (matched) return matched.label;
  return category;
}
