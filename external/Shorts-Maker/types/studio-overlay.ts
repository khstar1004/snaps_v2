export type StudioOverlayPresetId = "none" | "hearts" | "fire" | "spark";
export type StudioOverlayPlacement = "full" | "center" | "bottom";

export const STUDIO_OVERLAY_PRESET_OPTIONS: Array<{
  value: StudioOverlayPresetId;
  label: string;
  description: string;
}> = [
  { value: "none", label: "없음", description: "오버레이 없이 자막과 미디어만 사용합니다." },
  { value: "hearts", label: "하트", description: "핑크 하트가 화면 위를 떠다니는 밈형 효과입니다." },
  { value: "fire", label: "불꽃", description: "하단 불꽃과 열기를 깔아 강조하는 효과입니다." },
  { value: "spark", label: "스파크", description: "반짝이는 파티클이 화면을 감싸는 효과입니다." },
];

export const STUDIO_OVERLAY_PLACEMENT_OPTIONS: Array<{
  value: StudioOverlayPlacement;
  label: string;
}> = [
  { value: "full", label: "전체" },
  { value: "center", label: "중앙" },
  { value: "bottom", label: "하단" },
];

export function getStudioOverlayPreset(value: unknown): {
  id: StudioOverlayPresetId;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
} {
  switch (value) {
    case "hearts":
      return {
        id: "hearts",
        primaryColor: "#fb7185",
        secondaryColor: "#f9a8d4",
        accentColor: "#ffffff",
      };
    case "fire":
      return {
        id: "fire",
        primaryColor: "#f97316",
        secondaryColor: "#facc15",
        accentColor: "#ef4444",
      };
    case "spark":
      return {
        id: "spark",
        primaryColor: "#ffffff",
        secondaryColor: "#fde68a",
        accentColor: "#f472b6",
      };
    default:
      return {
        id: "none",
        primaryColor: "#ffffff",
        secondaryColor: "#ffffff",
        accentColor: "#ffffff",
      };
  }
}
