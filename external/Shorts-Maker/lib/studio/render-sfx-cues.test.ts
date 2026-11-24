import assert from "node:assert/strict";
import test from "node:test";
import { buildStudioRenderSfxCues } from "./render-sfx-cues";
import type { PreparedSlide, RenderPlan } from "@/types/studio-json";

function createSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "슬라이드",
    text: "기본 텍스트",
    lines: ["기본 텍스트"],
    layout: "photo+body",
    groupId: 0,
    stepIndex: 0,
    ...overrides,
  };
}

function createRenderPlan(sfxCuesResolved: RenderPlan["sfxCuesResolved"]): RenderPlan {
  return {
    version: 2,
    lines: [],
    frames: [],
    sfxCuesResolved,
  };
}

test("buildStudioRenderSfxCues keeps plan cue startMs unchanged at rate 1.0", () => {
  const renderPlan = createRenderPlan([
    {
      cueId: "0:0:1",
      lineId: "0:0",
      frameIndex: 0,
      tag: "일반 효과음",
      startMs: 1234,
      offsetMs: 100,
    },
  ]);

  const cues = buildStudioRenderSfxCues({
    renderPlan,
    slides: [createSlide()],
    playbackRate: 1,
  });

  assert.equal(cues.length, 1);
  assert.equal(cues[0].startMs, 1234);
  assert.equal(cues[0].offsetMs, 100);
});

test("buildStudioRenderSfxCues scales plan cue startMs and offsetMs by playbackRate", () => {
  const renderPlan = createRenderPlan([
    {
      cueId: "0:0:1",
      lineId: "0:0",
      frameIndex: 0,
      tag: "일반 효과음",
      startMs: 1500,
      offsetMs: 300,
    },
  ]);

  const cues = buildStudioRenderSfxCues({
    renderPlan,
    slides: [createSlide()],
    playbackRate: 1.5,
  });

  assert.equal(cues.length, 1);
  assert.equal(cues[0].startMs, 1500 / 1.5);
  assert.equal(cues[0].offsetMs, 300 / 1.5);
});

test("buildStudioRenderSfxCues fallback branch scales offsetMs and leaves startMs undefined", () => {
  const cues = buildStudioRenderSfxCues({
    renderPlan: null,
    slides: [
      createSlide({
        sfxCue: { enabled: true, tag: "강조 효과음", offsetMs: 300 },
      }),
    ],
    playbackRate: 1.5,
  });

  assert.equal(cues.length, 1);
  assert.equal(cues[0].startMs, undefined);
  assert.equal(cues[0].offsetMs, 300 / 1.5);
  assert.equal(cues[0].frameIndex, 0);
});

test("buildStudioRenderSfxCues keeps cueId byte-identical regardless of playbackRate", () => {
  const renderPlan = createRenderPlan([
    {
      cueId: "0:0:1",
      lineId: "0:0",
      frameIndex: 0,
      tag: "일반 효과음",
      startMs: 2000,
      offsetMs: 0,
    },
  ]);

  const cuesRate1 = buildStudioRenderSfxCues({ renderPlan, slides: [createSlide()], playbackRate: 1 });
  const cuesRate15 = buildStudioRenderSfxCues({ renderPlan, slides: [createSlide()], playbackRate: 1.5 });
  const cuesRate2 = buildStudioRenderSfxCues({ renderPlan, slides: [createSlide()], playbackRate: 2 });

  assert.equal(cuesRate1[0].cueId, "0:0:1");
  assert.equal(cuesRate15[0].cueId, "0:0:1");
  assert.equal(cuesRate2[0].cueId, "0:0:1");

  const fallbackSlides = [createSlide({ sfxCue: { enabled: true, tag: "강조 효과음" } })];
  const fallbackRate1 = buildStudioRenderSfxCues({ renderPlan: null, slides: fallbackSlides, playbackRate: 1 });
  const fallbackRate15 = buildStudioRenderSfxCues({ renderPlan: null, slides: fallbackSlides, playbackRate: 1.5 });

  assert.equal(fallbackRate1[0].cueId, "0:강조 효과음");
  assert.equal(fallbackRate15[0].cueId, "0:강조 효과음");
});

test("buildStudioRenderSfxCues caps output at 40 cues", () => {
  const sfxCuesResolved: RenderPlan["sfxCuesResolved"] = Array.from({ length: 50 }, (_, index) => ({
    cueId: `cue-${index}`,
    lineId: `${index}:0`,
    frameIndex: index,
    tag: "일반 효과음",
    startMs: index * 100,
    offsetMs: 0,
  }));
  const renderPlan = createRenderPlan(sfxCuesResolved);

  const cues = buildStudioRenderSfxCues({
    renderPlan,
    slides: [],
    playbackRate: 1,
  });

  assert.equal(cues.length, 40);
});

test("buildStudioRenderSfxCues falls back to default playbackRate when invalid or absent", () => {
  const renderPlan = createRenderPlan([
    {
      cueId: "0:0:1",
      lineId: "0:0",
      frameIndex: 0,
      tag: "일반 효과음",
      startMs: 1500,
      offsetMs: 0,
    },
  ]);

  const cuesUndefined = buildStudioRenderSfxCues({ renderPlan, slides: [createSlide()], playbackRate: undefined });
  const cuesInvalid = buildStudioRenderSfxCues({ renderPlan, slides: [createSlide()], playbackRate: Number.NaN });

  assert.equal(cuesUndefined[0].startMs, 1500 / 1.5);
  assert.equal(cuesInvalid[0].startMs, 1500 / 1.5);
});
