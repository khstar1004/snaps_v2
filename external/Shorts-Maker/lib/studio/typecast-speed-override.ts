import { normalizeTypecastSpeed } from "./tts-typecast";

type TypecastSpeedCarrier = {
  typecast: {
    speed: number;
  };
};

export function applyTypecastSpeedOverride<T extends TypecastSpeedCarrier>(settings: T, typecastSpeed?: number | null): T {
  if (!Number.isFinite(typecastSpeed)) return settings;
  const nextSpeed = normalizeTypecastSpeed(Number(typecastSpeed));
  if (Math.abs(nextSpeed - settings.typecast.speed) < 0.0001) return settings;
  return {
    ...settings,
    typecast: {
      ...settings.typecast,
      speed: nextSpeed,
    },
  } as T;
}
