import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";

const CHANNEL_COLORS_STORAGE_KEY = "home-channel-colors-v1";
const DEFAULT_CHANNEL_COLOR = "#3B82F6";
const CHANNEL_COLOR_PALETTE = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];

export function loadChannelColors(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = readScopedStorage(CHANNEL_COLORS_STORAGE_KEY) || "";
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return {};
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)) {
        safe[key] = value;
      }
    }
    return safe;
  } catch {
    return {};
  }
}

export function saveChannelColors(colors: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    writeScopedStorage(CHANNEL_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    return;
  }
}

export function getChannelColor(channelId: string, colors: Record<string, string>): string {
  const saved = colors[channelId];
  if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) return saved;
  let hash = 0;
  for (let i = 0; i < channelId.length; i += 1) {
    hash = (hash * 31 + channelId.charCodeAt(i)) >>> 0;
  }
  return CHANNEL_COLOR_PALETTE[hash % CHANNEL_COLOR_PALETTE.length] || DEFAULT_CHANNEL_COLOR;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(59,130,246,${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
