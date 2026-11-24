export type SfxCatalogFile = {
  path: string;
  defaultGainDb: number;
};

export type SfxSelectionSeed = {
  cueId?: string;
  tag: string;
  frameIndex?: number;
  startMs?: number;
  offsetMs?: number;
  gainDb?: number;
};

function toStableHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toSelectionSeedString(seed: SfxSelectionSeed): string {
  const cueId = String(seed.cueId || "").trim();
  if (cueId) return `${seed.tag}|${cueId}`;
  const frameIndex = Number.isFinite(seed.frameIndex) ? Math.floor(Number(seed.frameIndex)) : -1;
  const startMs = Number.isFinite(seed.startMs) ? Math.floor(Number(seed.startMs)) : -1;
  const offsetMs = Number.isFinite(seed.offsetMs) ? Math.floor(Number(seed.offsetMs)) : 0;
  const gainDb = Number.isFinite(seed.gainDb) ? Number(seed.gainDb).toFixed(2) : "na";
  return `${seed.tag}|f:${frameIndex}|s:${startMs}|o:${offsetMs}|g:${gainDb}`;
}

export function selectDeterministicSfxFile(files: SfxCatalogFile[], seed: SfxSelectionSeed): SfxCatalogFile {
  if (!Array.isArray(files) || files.length <= 0) {
    throw new Error("SFX file list is empty");
  }
  const sorted = files.slice().sort((a, b) => a.path.localeCompare(b.path));
  if (sorted.length === 1) return sorted[0];
  const hash = toStableHash(toSelectionSeedString(seed));
  return sorted[hash % sorted.length];
}
