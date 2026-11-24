export function buildReservationDelta(current: Set<string>, baseline: Set<string>): string[] {
  const delta: string[] = [];
  for (const value of current) {
    if (baseline.has(value)) continue;
    delta.push(value);
  }
  return delta;
}

export function hasReservationDeltaConflict(
  target: Set<string>,
  baseline: Set<string>,
  current: Set<string>
): boolean {
  for (const value of current) {
    if (baseline.has(value)) continue;
    if (target.has(value)) return true;
  }
  return false;
}
