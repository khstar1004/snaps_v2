export const STUDIO_AUDIO_MIX_PRESET_IDS = ["balanced", "voice-focus", "impact"] as const;

export type StudioAudioMixPresetId = (typeof STUDIO_AUDIO_MIX_PRESET_IDS)[number];

export type StudioAudioMixPreset = {
  id: StudioAudioMixPresetId;
  label: string;
  narrationGainDb: number;
  bgmVolume: number;
  sfxGainOffsetDb: number;
  ducking: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
  };
};

export const DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID: StudioAudioMixPresetId = "voice-focus";
export const STUDIO_BGM_VOLUME_MIN = 0;
export const STUDIO_BGM_VOLUME_MAX = 1;

export const STUDIO_AUDIO_MIX_PRESETS: StudioAudioMixPreset[] = [
  {
    id: "balanced",
    label: "밸런스",
    narrationGainDb: 0.8,
    bgmVolume: 0.3,
    sfxGainOffsetDb: 0,
    ducking: {
      enabled: true,
      threshold: 0.05,
      ratio: 4.5,
      attackMs: 10,
      releaseMs: 180,
    },
  },
  {
    id: "voice-focus",
    label: "보이스 선명",
    narrationGainDb: 2.2,
    bgmVolume: 0.28,
    sfxGainOffsetDb: -1,
    ducking: {
      enabled: true,
      threshold: 0.038,
      ratio: 6,
      attackMs: 7,
      releaseMs: 220,
    },
  },
  {
    id: "impact",
    label: "임팩트",
    narrationGainDb: 0.4,
    bgmVolume: 0.34,
    sfxGainOffsetDb: 1.5,
    ducking: {
      enabled: true,
      threshold: 0.046,
      ratio: 4,
      attackMs: 12,
      releaseMs: 160,
    },
  },
];

const PRESET_BY_ID = new Map<StudioAudioMixPresetId, StudioAudioMixPreset>(
  STUDIO_AUDIO_MIX_PRESETS.map((preset) => [preset.id, preset])
);

export function normalizeStudioAudioMixPresetId(value: unknown): StudioAudioMixPresetId {
  const raw = typeof value === "string" ? value.trim() : "";
  if ((STUDIO_AUDIO_MIX_PRESET_IDS as readonly string[]).includes(raw)) {
    return raw as StudioAudioMixPresetId;
  }
  return DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID;
}

export function getStudioAudioMixPreset(value?: string): StudioAudioMixPreset {
  const id = normalizeStudioAudioMixPresetId(value);
  const preset = PRESET_BY_ID.get(id);
  return preset || PRESET_BY_ID.get(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID) || STUDIO_AUDIO_MIX_PRESETS[0];
}

export function normalizeStudioBgmVolume(value: unknown, mixPresetId?: string): number {
  const fallback = getStudioAudioMixPreset(mixPresetId).bgmVolume;
  if (value === null || typeof value === "undefined" || (typeof value === "string" && !value.trim())) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(STUDIO_BGM_VOLUME_MIN, Math.min(STUDIO_BGM_VOLUME_MAX, parsed));
}
