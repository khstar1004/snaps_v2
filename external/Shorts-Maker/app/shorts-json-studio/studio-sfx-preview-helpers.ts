import { STUDIO_SFX_VOLUME_TRIM_DB } from "@/lib/studio/audio-mix-constants";
import { canonicalizeStudioSfxTag, type StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import { buildRenderPlanV2 } from "@/lib/studio/render-plan";
import { selectDeterministicSfxFile } from "@/lib/studio/sfx-deterministic";
import type { PreparedSlide, RenderPlanSfxCueResolved } from "@/types/studio-json";

type SfxCatalogEntry = {
  categoryId: string;
  fileId: string;
  path: string;
  label: string;
  defaultGainDb: number;
};

type PreviewCue = {
  tag: string;
  gainDb?: number;
  offsetMs?: number;
};

export type StudioSfxPreviewSelection = {
  path: string;
  fileId: string;
  label: string;
  categoryId: string;
  includedInRender: boolean;
  previewVolume: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function toPreviewVolume(gainDb: number | undefined, defaultGainDb: number): number {
  const cueOrFileGainDb = Number.isFinite(gainDb) ? Number(gainDb) : defaultGainDb;
  // Standalone preview intentionally applies only the cue/file gain plus the renderer's shared SFX trim.
  // Master volume and preset offsets are render-mix concerns and are not folded into this per-file preview.
  const effectiveDb = clamp(STUDIO_SFX_VOLUME_TRIM_DB + cueOrFileGainDb, -24, 12);
  return clamp(dbToLinear(effectiveDb), 0, 1);
}

function normalizeDefaultGainDb(value: unknown): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? clamp(raw, -24, 12) : -3;
}

function buildCatalog(categories: StudioSfxCategoryOption[]): {
  entriesByFileId: Map<string, SfxCatalogEntry>;
  entriesByCategoryId: Map<string, SfxCatalogEntry[]>;
} {
  const entriesByFileId = new Map<string, SfxCatalogEntry>();
  const entriesByCategoryId = new Map<string, SfxCatalogEntry[]>();
  for (const category of Array.isArray(categories) ? categories : []) {
    const categoryId = canonicalizeStudioSfxTag(String(category?.id || "").trim());
    if (!categoryId || !Array.isArray(category?.files)) continue;
    const entries = category.files
      .map((file): SfxCatalogEntry | null => {
        const fileId = canonicalizeStudioSfxTag(String(file?.id || "").trim());
        const path = String(file?.path || "").trim();
        if (!fileId || !path) return null;
        return {
          categoryId,
          fileId,
          path,
          label: String(file?.label || fileId).trim() || fileId,
          defaultGainDb: normalizeDefaultGainDb(file?.defaultGainDb),
        };
      })
      .filter((entry): entry is SfxCatalogEntry => Boolean(entry));
    if (entries.length <= 0) continue;
    entriesByCategoryId.set(categoryId, entries);
    for (const entry of entries) {
      entriesByFileId.set(entry.fileId, entry);
    }
  }
  return { entriesByFileId, entriesByCategoryId };
}

function resolveFrameCue(frame: PreparedSlide): PreviewCue | null {
  const explicitCue = frame.sfxCue;
  const explicitTag = String(explicitCue?.tag || "").trim();
  if (explicitCue) {
    if (explicitCue.enabled === false || !explicitTag) return null;
    return {
      tag: explicitTag,
      gainDb: explicitCue.gainDb,
      offsetMs: explicitCue.offsetMs,
    };
  }

  const stepIndex = Number.isFinite(frame.stepIndex) ? Number(frame.stepIndex) : 0;
  const matchedPlanCue = Array.isArray(frame.sfxPlan)
    ? frame.sfxPlan.find((item) => Number.isFinite(item?.lineIndex) && Number(item.lineIndex) === stepIndex)
    : null;
  const planTag = String(matchedPlanCue?.tag || "").trim();
  if (!matchedPlanCue || matchedPlanCue.enabled === false || !planTag) return null;
  return {
    tag: planTag,
    gainDb: matchedPlanCue.gainDb,
    offsetMs: matchedPlanCue.offsetMs,
  };
}

function resolveSelectionForFrame(
  slides: PreparedSlide[],
  slideIndex: number,
  catalog: ReturnType<typeof buildCatalog>,
  resolvedCuesByFrame: Map<number, RenderPlanSfxCueResolved>,
  renderPlanFrameStartsMs: Map<number, number>,
  sfxEnabled: boolean
): StudioSfxPreviewSelection | null {
  const previewCue = resolveFrameCue(slides[slideIndex]);
  if (!previewCue) return null;

  const tag = canonicalizeStudioSfxTag(previewCue.tag);
  if (!tag) return null;

  const resolvedCue = resolvedCuesByFrame.get(slideIndex) || null;
  const includedInRenderPlan = Boolean(resolvedCue && canonicalizeStudioSfxTag(String(resolvedCue.tag || "")) === tag);
  const includedInRender = sfxEnabled && includedInRenderPlan;
  const seedCueId = includedInRenderPlan ? resolvedCue?.cueId : undefined;
  const offsetMs = Number.isFinite(previewCue.offsetMs) ? Math.max(-1200, Math.min(1200, Math.floor(Number(previewCue.offsetMs)))) : 0;
  const renderPlanFrameStartMs = renderPlanFrameStartsMs.get(slideIndex) ?? slideIndex * 1000;
  const startMs = includedInRenderPlan && resolvedCue ? resolvedCue.startMs : Math.max(0, renderPlanFrameStartMs + offsetMs);
  const gainDb = Number.isFinite(previewCue.gainDb) ? clamp(Number(previewCue.gainDb), -24, 12) : undefined;

  const exactFile = catalog.entriesByFileId.get(tag);
  if (exactFile) {
    return {
      path: exactFile.path,
      fileId: exactFile.fileId,
      label: exactFile.label,
      categoryId: exactFile.categoryId,
      includedInRender,
      previewVolume: toPreviewVolume(gainDb, exactFile.defaultGainDb),
    };
  }

  const categoryFiles = catalog.entriesByCategoryId.get(tag);
  if (!categoryFiles || categoryFiles.length <= 0) return null;
  const picked = selectDeterministicSfxFile(categoryFiles, {
    cueId: seedCueId,
    tag,
    frameIndex: slideIndex,
    startMs,
    offsetMs,
    gainDb,
  });
  const pickedEntry = categoryFiles.find((entry) => entry.path === picked.path) || categoryFiles[0];
  if (!pickedEntry) return null;
  return {
    path: pickedEntry.path,
    fileId: pickedEntry.fileId,
    label: pickedEntry.label,
    categoryId: pickedEntry.categoryId,
    includedInRender,
    previewVolume: toPreviewVolume(gainDb, pickedEntry.defaultGainDb),
  };
}

export function resolveStudioSfxPreviewSelections(
  slides: PreparedSlide[],
  sfxCategories: StudioSfxCategoryOption[],
  sfxEnabled = true
): Array<StudioSfxPreviewSelection | null> {
  if (!Array.isArray(slides) || slides.length <= 0) return [];
  const catalog = buildCatalog(sfxCategories);
  if (catalog.entriesByFileId.size <= 0 && catalog.entriesByCategoryId.size <= 0) {
    return slides.map(() => null);
  }

  const renderPlan = buildRenderPlanV2(slides, slides.map(() => 1));
  const resolvedCuesByFrame = new Map(renderPlan.sfxCuesResolved.map((cue) => [cue.frameIndex, cue]));
  const renderPlanFrameStartsMs = new Map(renderPlan.frames.map((frame) => [frame.frameIndex, frame.startMs]));
  return slides.map((_, slideIndex) =>
    resolveSelectionForFrame(
      slides,
      slideIndex,
      catalog,
      resolvedCuesByFrame,
      renderPlanFrameStartsMs,
      sfxEnabled
    )
  );
}

export function resolveStudioSfxPreviewSelection(
  slides: PreparedSlide[],
  slideIndex: number,
  sfxCategories: StudioSfxCategoryOption[],
  sfxEnabled = true
): StudioSfxPreviewSelection | null {
  if (!Array.isArray(slides) || slideIndex < 0 || slideIndex >= slides.length) return null;
  return resolveStudioSfxPreviewSelections(slides, sfxCategories, sfxEnabled)[slideIndex] || null;
}
