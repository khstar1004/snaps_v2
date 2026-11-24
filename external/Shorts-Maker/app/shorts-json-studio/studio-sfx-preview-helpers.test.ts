import test from "node:test";
import assert from "node:assert/strict";
import { STUDIO_SFX_VOLUME_TRIM_DB } from "@/lib/studio/audio-mix-constants";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import { buildRenderPlanV2 } from "@/lib/studio/render-plan";
import { selectDeterministicSfxFile } from "@/lib/studio/sfx-deterministic";
import type { PreparedSlide } from "@/types/studio-json";
import { resolveStudioSfxPreviewSelection } from "./studio-sfx-preview-helpers";

function makeSlide(input: Partial<PreparedSlide> = {}): PreparedSlide {
  return {
    title: input.title || "slide",
    text: input.text || "line",
    lines: input.lines || [input.text || "line"],
    layout: input.layout || "photo+body",
    groupId: input.groupId,
    stepIndex: input.stepIndex,
    sfxCue: input.sfxCue,
    sfxPlan: input.sfxPlan,
  };
}

function catalog(): StudioSfxCategoryOption[] {
  return [
    {
      id: "일반 효과음",
      label: "일반 효과음",
      files: [
        { id: "general-a", tag: "일반 효과음", label: "General A", path: "/sfx/general-a.wav", defaultGainDb: -3 },
        { id: "general-b", tag: "일반 효과음", label: "General B", path: "/sfx/general-b.wav", defaultGainDb: -6 },
      ],
    },
    {
      id: "강조 효과음",
      label: "강조 효과음",
      files: [{ id: "impact-a", tag: "강조 효과음", label: "Impact A", path: "/sfx/impact-a.wav", defaultGainDb: -4 }],
    },
    {
      id: "전환 효과음",
      label: "전환 효과음",
      files: [{ id: "whoosh-a", tag: "전환 효과음", label: "Whoosh A", path: "/sfx/whoosh-a.wav", defaultGainDb: -5 }],
    },
    {
      id: "file category",
      label: "file category",
      files: [{ id: "exact-file", tag: "file category", label: "Exact File", path: "/sfx/exact.wav", defaultGainDb: -12 }],
    },
  ];
}

function linear(db: number): number {
  return Math.pow(10, db / 20);
}

test("resolveStudioSfxPreviewSelection returns exact file-id tag without category hashing", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ sfxCue: { enabled: true, tag: "exact-file", source: "manual" } })],
    0,
    catalog()
  );

  assert.deepEqual(result, {
    path: "/sfx/exact.wav",
    fileId: "exact-file",
    label: "Exact File",
    categoryId: "file category",
    includedInRender: true,
    previewVolume: linear(STUDIO_SFX_VOLUME_TRIM_DB - 12),
  });
});

test("resolveStudioSfxPreviewSelection uses render cueId for deterministic category file selection", () => {
  const slides = [makeSlide({ sfxCue: { enabled: true, tag: "일반 효과음", source: "manual" } })];
  const plan = buildRenderPlanV2(slides, [1]);
  const cue = plan.sfxCuesResolved[0];
  assert.ok(cue);
  const files = [
    { path: "/sfx/general-a.wav", defaultGainDb: -3 },
    { path: "/sfx/general-b.wav", defaultGainDb: -6 },
  ];
  const expected = selectDeterministicSfxFile(files, { cueId: cue.cueId, tag: "일반 효과음" });

  const result = resolveStudioSfxPreviewSelection(slides, 0, catalog());

  assert.equal(result?.path, expected.path);
  assert.equal(result?.includedInRender, true);
  assert.equal(result?.categoryId, "일반 효과음");
});

test("resolveStudioSfxPreviewSelection returns null for blank, missing, and empty catalog cases", () => {
  assert.equal(
    resolveStudioSfxPreviewSelection([makeSlide({ sfxCue: { enabled: true, tag: " " } })], 0, catalog()),
    null
  );
  assert.equal(
    resolveStudioSfxPreviewSelection([makeSlide({ sfxCue: { enabled: true, tag: "없는 효과음" } })], 0, catalog()),
    null
  );
  assert.equal(resolveStudioSfxPreviewSelection([makeSlide({ sfxCue: { enabled: true, tag: "일반 효과음" } })], 0, []), null);
  assert.equal(resolveStudioSfxPreviewSelection([], 0, catalog()), null);
});

test("resolveStudioSfxPreviewSelection supports sfxPlan fallback", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ stepIndex: 2, sfxPlan: [{ lineIndex: 2, tag: "강조 효과음" }] })],
    0,
    catalog()
  );

  assert.equal(result?.path, "/sfx/impact-a.wav");
  assert.equal(result?.fileId, "impact-a");
  assert.equal(result?.includedInRender, true);
});

test("resolveStudioSfxPreviewSelection respects disabled sfxPlan cues", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ stepIndex: 0, sfxPlan: [{ lineIndex: 0, enabled: false, tag: "강조 효과음", source: "manual" }] })],
    0,
    catalog()
  );

  assert.equal(result, null);
});

test("resolveStudioSfxPreviewSelection preserves manual sfxPlan inclusion", () => {
  const result = resolveStudioSfxPreviewSelection(
    [
      makeSlide({ groupId: 4, stepIndex: 0, sfxPlan: [{ lineIndex: 0, tag: "일반 효과음" }] }),
      makeSlide({ groupId: 4, stepIndex: 1, sfxPlan: [{ lineIndex: 1, tag: "강조 효과음" }] }),
      makeSlide({ groupId: 4, stepIndex: 2, sfxPlan: [{ lineIndex: 2, tag: "전환 효과음", source: "manual" }] }),
    ],
    2,
    catalog()
  );

  assert.equal(result?.path, "/sfx/whoosh-a.wav");
  assert.equal(result?.fileId, "whoosh-a");
  assert.equal(result?.includedInRender, true);
});

test("resolveStudioSfxPreviewSelection treats a disabled explicit cue as authoritative", () => {
  const result = resolveStudioSfxPreviewSelection(
    [
      makeSlide({
        stepIndex: 0,
        sfxCue: { enabled: false, tag: "전환 효과음" },
        sfxPlan: [{ lineIndex: 0, tag: "강조 효과음" }],
      }),
    ],
    0,
    catalog()
  );

  assert.equal(result, null);
});

test("resolveStudioSfxPreviewSelection uses cue gain over file default gain for preview volume", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ sfxCue: { enabled: true, tag: "exact-file", gainDb: 0 } })],
    0,
    catalog()
  );

  assert.equal(result?.previewVolume, linear(STUDIO_SFX_VOLUME_TRIM_DB));
});

test("resolveStudioSfxPreviewSelection uses file default gain when cue gain is absent", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ sfxCue: { enabled: true, tag: "exact-file" } })],
    0,
    catalog()
  );

  assert.equal(result?.previewVolume, linear(STUDIO_SFX_VOLUME_TRIM_DB - 12));
});

test("resolveStudioSfxPreviewSelection returns includedInRender false for cue excluded by render rules", () => {
  const slides = [
    makeSlide({ groupId: 9, stepIndex: 0, sfxPlan: [{ lineIndex: 0, tag: "일반 효과음" }] }),
    makeSlide({ groupId: 9, stepIndex: 1, sfxPlan: [{ lineIndex: 1, tag: "강조 효과음" }] }),
    makeSlide({ groupId: 9, stepIndex: 2, sfxPlan: [{ lineIndex: 2, tag: "전환 효과음" }] }),
  ];
  const result = resolveStudioSfxPreviewSelection(slides, 2, catalog());

  assert.equal(result?.path, "/sfx/whoosh-a.wav");
  assert.equal(result?.fileId, "whoosh-a");
  assert.equal(result?.includedInRender, false);
});

test("resolveStudioSfxPreviewSelection marks a planned cue excluded when global SFX is disabled", () => {
  const result = resolveStudioSfxPreviewSelection(
    [makeSlide({ sfxCue: { enabled: true, tag: "일반 효과음", source: "manual" } })],
    0,
    catalog(),
    false
  );

  assert.ok(result);
  assert.equal(result.includedInRender, false);
});
