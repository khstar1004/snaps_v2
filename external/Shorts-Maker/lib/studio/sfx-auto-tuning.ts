export type StudioSfxAutoLevel = "sparse" | "balanced" | "dense";

type StudioSfxAutoLevelConfig = {
  id: StudioSfxAutoLevel;
  label: string;
  description: string;
  maxPerSlide: number;
  maxSlidesRatio: number;
  minSlideGap: number;
  promptGuide: string;
};

export const DEFAULT_STUDIO_SFX_AUTO_LEVEL: StudioSfxAutoLevel = "sparse";

export const STUDIO_SFX_AUTO_LEVEL_OPTIONS: Array<Pick<StudioSfxAutoLevelConfig, "id" | "label" | "description">> = [
  { id: "sparse", label: "적게", description: "강조 포인트만 드물게 배정합니다." },
  { id: "balanced", label: "보통", description: "과하지 않게 균형 있게 배정합니다." },
  { id: "dense", label: "많게", description: "효과음을 비교적 적극적으로 배정합니다." },
];

const STUDIO_SFX_AUTO_LEVEL_CONFIG: Record<StudioSfxAutoLevel, StudioSfxAutoLevelConfig> = {
  sparse: {
    id: "sparse",
    label: "적게",
    description: "강조 포인트만 드물게 배정합니다.",
    maxPerSlide: 1,
    maxSlidesRatio: 0.35,
    minSlideGap: 1,
    promptGuide: "자동 배정 강도는 적게다. slide당 최대 1개, 전체 슬라이드의 약 35% 이내, 연속 슬라이드 남발 금지.",
  },
  balanced: {
    id: "balanced",
    label: "보통",
    description: "과하지 않게 균형 있게 배정합니다.",
    maxPerSlide: 1,
    maxSlidesRatio: 0.6,
    minSlideGap: 0,
    promptGuide: "자동 배정 강도는 보통이다. slide당 최대 1개, 전체 슬라이드의 약 60% 이내로 유지.",
  },
  dense: {
    id: "dense",
    label: "많게",
    description: "효과음을 비교적 적극적으로 배정합니다.",
    maxPerSlide: 2,
    maxSlidesRatio: 1,
    minSlideGap: 0,
    promptGuide: "자동 배정 강도는 많게다. 정말 필요한 경우에만 slide당 최대 2개까지 허용한다.",
  },
};

export function normalizeStudioSfxAutoLevel(value: unknown): StudioSfxAutoLevel {
  return value === "balanced" || value === "dense" ? value : DEFAULT_STUDIO_SFX_AUTO_LEVEL;
}

export function getStudioSfxAutoLevelConfig(value: unknown): StudioSfxAutoLevelConfig {
  return STUDIO_SFX_AUTO_LEVEL_CONFIG[normalizeStudioSfxAutoLevel(value)];
}
