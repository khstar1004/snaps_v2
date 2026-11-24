function asFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
  return fallback;
}

export function isHomeV1Enabled(): boolean {
  return asFlag(process.env.NEXT_PUBLIC_HOME_V1, true);
}

export function isStudioStepperV1Enabled(): boolean {
  return asFlag(process.env.NEXT_PUBLIC_STUDIO_STEPPER_V1, true);
}
