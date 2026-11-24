import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import { buildStudioRenderReuseKey } from "./studio-render-reuse-key";

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "slide",
    text: "line 1",
    narrationText: "line 1",
    lines: ["line 1"],
    layout: "photo+body",
    imageUrl: "https://example.com/image-a.jpg",
    mediaUrl: "https://example.com/image-a.jpg",
    mediaKind: "image",
    imageRequest: {
      query: "awkward reaction",
      queryCandidates: ["awkward reaction gif"],
    },
    imageBeats: [
      {
        beatId: "0:0",
        startLineIndex: 0,
        imageUrl: "https://example.com/image-a.jpg",
        imageRequest: {
          query: "awkward reaction",
        },
      },
    ],
    groupId: 0,
    stepIndex: 0,
    ...overrides,
  };
}

test("buildStudioRenderReuseKey changes when a slide image changes", () => {
  const base = buildStudioRenderReuseKey([makeSlide()], "", "", "", {});
  const next = buildStudioRenderReuseKey(
    [
      makeSlide({
        imageUrl: "https://example.com/image-b.jpg",
        mediaUrl: "https://example.com/image-b.jpg",
        imageBeats: [
          {
            beatId: "0:0",
            startLineIndex: 0,
            imageUrl: "https://example.com/image-b.jpg",
            imageRequest: {
              query: "awkward reaction",
            },
          },
        ],
      }),
    ],
    "",
    "",
    "",
    {}
  );

  assert.notEqual(base, next);
});

test("buildStudioRenderReuseKey stays stable when visual and voice inputs are unchanged", () => {
  const slide = makeSlide();
  const left = buildStudioRenderReuseKey([slide], "tc_default_voice", "happy", "1.2", {
    mode: "dialogue",
    narrationVoice: "tc_default_voice",
  });
  const right = buildStudioRenderReuseKey([makeSlide()], "tc_default_voice", "happy", "1.2", {
    mode: "dialogue",
    narrationVoice: "tc_default_voice",
  });

  assert.equal(left, right);
});

test("buildStudioRenderReuseKey changes when planned SFX enablement or source changes", () => {
  const base = buildStudioRenderReuseKey(
    [makeSlide({ sfxPlan: [{ lineIndex: 0, enabled: true, tag: "강조", source: "manual" }] })],
    "",
    "",
    "",
    {}
  );
  const disabled = buildStudioRenderReuseKey(
    [makeSlide({ sfxPlan: [{ lineIndex: 0, enabled: false, tag: "강조", source: "manual" }] })],
    "",
    "",
    "",
    {}
  );
  const automatic = buildStudioRenderReuseKey(
    [makeSlide({ sfxPlan: [{ lineIndex: 0, enabled: true, tag: "강조", source: "auto" }] })],
    "",
    "",
    "",
    {}
  );

  assert.notEqual(base, disabled);
  assert.notEqual(base, automatic);
});

test("buildStudioRenderReuseKey changes when dialogue timing changes", () => {
  const base = buildStudioRenderReuseKey(
    [
      makeSlide({
        dialogueSegments: [
          { type: "narration", text: "첫 문장", speed: 1, pauseAfterMs: 0 },
        ],
      }),
    ],
    "",
    "",
    "1",
    {}
  );
  const faster = buildStudioRenderReuseKey(
    [
      makeSlide({
        dialogueSegments: [
          { type: "narration", text: "첫 문장", speed: 1.25, pauseAfterMs: 0 },
        ],
      }),
    ],
    "",
    "",
    "1",
    {}
  );
  const paused = buildStudioRenderReuseKey(
    [
      makeSlide({
        dialogueSegments: [
          { type: "narration", text: "첫 문장", speed: 1, pauseAfterMs: 400 },
        ],
      }),
    ],
    "",
    "",
    "1",
    {}
  );

  assert.notEqual(base, faster);
  assert.notEqual(base, paused);
});
