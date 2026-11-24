import assert from "node:assert/strict";
import test from "node:test";
import {
  addStudioScene,
  applyStudioSceneStructureEdit,
  deleteStudioScene,
  mergeStudioSceneLineWithNext,
  mergeStudioSceneLineWithPrevious,
  moveStudioScene,
  parseStudioSceneStructure,
  splitStudioSceneLine,
  updateStudioSceneLine,
  updateStudioSceneTitle,
} from "./studio-scene-structure-editor";

function parse(jsonText: string): Record<string, unknown> {
  return JSON.parse(jsonText) as Record<string, unknown>;
}

function slidesOf(jsonText: string): Array<Record<string, unknown>> {
  return parse(jsonText).slides as Array<Record<string, unknown>>;
}

test("parseStudioSceneStructure returns scene indexes, titles, and normalized lines", () => {
  const model = parseStudioSceneStructure(
    JSON.stringify({
      slides: [
        { title: " 첫 장면 ", lines: [" 첫 줄 ", "", "둘째 줄"] },
        { title: "둘째 장면", text: "본문만 있는 장면" },
      ],
    })
  );

  assert.deepEqual(model, {
    scenes: [
      { index: 0, title: "첫 장면", lines: ["첫 줄", "둘째 줄"] },
      { index: 1, title: "둘째 장면", lines: ["본문만 있는 장면"] },
    ],
  });
});

test("title and line edits preserve top-level and slide unknown fields", () => {
  const source = JSON.stringify({
    title: "원본",
    customTop: { keep: true },
    slides: [
      {
        title: "장면 A",
        text: "첫 줄 둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        layout: "photo+body",
        customSlide: { token: "keep" },
        dialogueSegments: [
          { type: "quote", text: "첫 줄", speakerId: "female_1", voice: "voice-f", speed: 0.9, pauseAfterMs: 120, volume: 0.8 },
          { type: "quote", text: "둘째 줄", speakerId: "male_1", voice: "voice-m", speed: 1.1, pauseAfterMs: 0, volume: 0.7 },
        ],
      },
    ],
  });

  const titled = updateStudioSceneTitle(source, 0, "새 제목");
  const edited = updateStudioSceneLine(titled, 0, 1, "새 둘째 줄");
  const parsed = parse(edited);
  const slide = (parsed.slides as Array<Record<string, unknown>>)[0];

  assert.deepEqual(parsed.customTop, { keep: true });
  assert.equal(slide?.title, "새 제목");
  assert.equal(slide?.customSlide && (slide.customSlide as Record<string, unknown>).token, "keep");
  assert.equal(slide?.text, "첫 줄 새 둘째 줄");
  assert.deepEqual(slide?.lines, ["첫 줄", "새 둘째 줄"]);
  assert.deepEqual(slide?.dialogueSegments, [
    { type: "quote", text: "첫 줄", speakerId: "female_1", voice: "voice-f", speed: 0.9, pauseAfterMs: 120, volume: 0.8 },
    { type: "quote", text: "새 둘째 줄", speakerId: "male_1", voice: "voice-m", speed: 1.1, pauseAfterMs: 0, volume: 0.7 },
  ]);
});

test("line split uses the optional cursor offset and duplicates safe segment metadata", () => {
  const source = JSON.stringify({
    slides: [
      {
        title: "장면",
        text: "abcdef",
        lines: ["abcdef"],
        dialogueSegments: [{ type: "narration", text: "abcdef", voice: "narrator", speed: 1.2, pauseAfterMs: 300, volume: 0.5 }],
      },
    ],
  });

  const slide = slidesOf(splitStudioSceneLine(source, 0, 0, 3))[0];

  assert.deepEqual(slide?.lines, ["abc", "def"]);
  assert.equal(slide?.text, "abc def");
  assert.deepEqual(slide?.dialogueSegments, [
    { type: "narration", text: "abc", voice: "narrator", speed: 1.2, pauseAfterMs: 300, volume: 0.5 },
    { type: "narration", text: "def", voice: "narrator", speed: 1.2, pauseAfterMs: 300, volume: 0.5 },
  ]);
});

test("line split falls back to automatic word splitting when offset is invalid", () => {
  const source = JSON.stringify({
    slides: [{ title: "장면", text: "하나 둘 셋 넷", lines: ["하나 둘 셋 넷"] }],
  });

  assert.deepEqual(slidesOf(splitStudioSceneLine(source, 0, 0, 999))[0]?.lines, ["하나 둘", "셋 넷"]);
});

test("line split and merge keep manual SFX and image indexes attached to the same content", () => {
  const source = JSON.stringify({
    slides: [
      {
        title: "장면",
        text: "첫 줄 둘째 줄 셋째 줄",
        lines: ["첫 줄", "둘째 줄", "셋째 줄"],
        sfxPlan: [
          { lineIndex: 0, tag: "first", source: "manual" },
          { lineIndex: 2, tag: "third", source: "manual" },
        ],
        imageBeats: [{ beatId: "third-beat", startLineIndex: 2 }],
        imageVariantStartLineIndex: 2,
      },
    ],
  });

  const split = splitStudioSceneLine(source, 0, 1, 2);
  const splitSlide = slidesOf(split)[0];
  assert.deepEqual(splitSlide?.sfxPlan, [
    { lineIndex: 0, tag: "first", source: "manual" },
    { lineIndex: 3, tag: "third", source: "manual" },
  ]);
  assert.deepEqual(splitSlide?.imageBeats, [{ beatId: "third-beat", startLineIndex: 3 }]);
  assert.equal(splitSlide?.imageVariantStartLineIndex, 3);

  const merged = mergeStudioSceneLineWithNext(split, 0, 1);
  const mergedSlide = slidesOf(merged)[0];
  assert.deepEqual(mergedSlide?.sfxPlan, [
    { lineIndex: 0, tag: "first", source: "manual" },
    { lineIndex: 2, tag: "third", source: "manual" },
  ]);
  assert.deepEqual(mergedSlide?.imageBeats, [{ beatId: "third-beat", startLineIndex: 2 }]);
  assert.equal(mergedSlide?.imageVariantStartLineIndex, 2);
});

test("line split and merge preserve caption overrides without shifting later cues", () => {
  const source = JSON.stringify({
    slides: [
      {
        title: "장면",
        text: "A BB C",
        lines: ["A", "BB", "C"],
        captionCues: [
          { text: "A", overrides: { style: "neon-pink" } },
          { text: "BB", overrides: { style: "bold-yellow" } },
          { text: "C", overrides: { style: "flame-gold" } },
        ],
      },
    ],
  });

  const split = splitStudioSceneLine(source, 0, 1, 1);
  assert.deepEqual(slidesOf(split)[0]?.captionCues, [
    { text: "A", overrides: { style: "neon-pink" } },
    { text: "B", overrides: { style: "bold-yellow" } },
    { text: "B", overrides: { style: "bold-yellow" } },
    { text: "C", overrides: { style: "flame-gold" } },
  ]);

  const merged = mergeStudioSceneLineWithNext(split, 0, 1);
  assert.deepEqual(slidesOf(merged)[0]?.captionCues, [
    { text: "A", overrides: { style: "neon-pink" } },
    { text: "B B", overrides: { style: "bold-yellow" } },
    { text: "C", overrides: { style: "flame-gold" } },
  ]);
});

test("line merge collapses matching routes and keeps distinct routes safely", () => {
  const matchingRoutes = JSON.stringify({
    slides: [
      {
        title: "장면",
        text: "첫 줄 둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        dialogueSegments: [
          { type: "narration", text: "첫 줄", voice: "same", speed: 1 },
          { type: "narration", text: "둘째 줄", voice: "same", speed: 1 },
        ],
      },
    ],
  });
  const distinctRoutes = JSON.stringify({
    slides: [
      {
        title: "장면",
        text: "여자 대사 남자 대사",
        lines: ["여자 대사", "남자 대사"],
        dialogueSegments: [
          { type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" },
          { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" },
        ],
      },
    ],
  });

  const mergedMatching = slidesOf(mergeStudioSceneLineWithNext(matchingRoutes, 0, 0))[0];
  const mergedDistinct = slidesOf(mergeStudioSceneLineWithPrevious(distinctRoutes, 0, 1))[0];

  assert.deepEqual(mergedMatching?.lines, ["첫 줄 둘째 줄"]);
  assert.deepEqual(mergedMatching?.dialogueSegments, [{ type: "narration", text: "첫 줄 둘째 줄", voice: "same", speed: 1 }]);
  assert.deepEqual(mergedDistinct?.lines, ["여자 대사 남자 대사"]);
  assert.deepEqual(mergedDistinct?.dialogueSegments, [
    { type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" },
    { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" },
  ]);
});

test("add, delete, and move scenes preserve existing rows and enforce the last-scene delete guard", () => {
  const source = JSON.stringify({
    customTop: "keep",
    slides: [
      { title: "A", text: "A line", lines: ["A line"], custom: "a" },
      { title: "B", text: "B line", lines: ["B line"], custom: "b" },
    ],
  });

  const added = addStudioScene(source, 0, { title: "삽입", lines: ["새 첫 줄", "새 둘째 줄"] });
  assert.deepEqual(slidesOf(added).map((slide) => slide.title), ["A", "삽입", "B"]);
  assert.equal(slidesOf(added)[1]?.text, "새 첫 줄 새 둘째 줄");

  const deleted = deleteStudioScene(added, 0);
  assert.deepEqual(slidesOf(deleted).map((slide) => slide.title), ["삽입", "B"]);
  assert.equal(parse(deleted).customTop, "keep");
  assert.equal(slidesOf(deleted)[1]?.custom, "b");

  const moved = moveStudioScene(deleted, 1, 0);
  assert.deepEqual(slidesOf(moved).map((slide) => slide.title), ["B", "삽입"]);

  const onlyOne = JSON.stringify({ slides: [{ title: "하나", text: "한 줄", lines: ["한 줄"] }] }, null, 2);
  assert.equal(deleteStudioScene(onlyOne, 0), onlyOne);
});

test("line edits keep at least one line and invalid operations are no-ops", () => {
  const source = JSON.stringify(
    {
      slides: [{ title: "장면", text: "기존", lines: ["기존"] }],
    },
    null,
    2
  );

  const blankEdited = updateStudioSceneLine(source, 0, 0, "   ");
  assert.deepEqual(slidesOf(blankEdited)[0]?.lines, ["기존"]);

  const unsplittable = JSON.stringify(
    {
      slides: [{ title: "장면", text: "한", lines: ["한"] }],
    },
    null,
    2
  );
  assert.equal(splitStudioSceneLine(unsplittable, 0, 0, 0), unsplittable);
  assert.equal(mergeStudioSceneLineWithPrevious(source, 0, 0), source);
  assert.equal(updateStudioSceneTitle(source, 5, "없는 장면"), source);
  assert.equal(updateStudioSceneLine("{ invalid", 0, 0, "새 줄"), "{ invalid");
  assert.equal(moveStudioScene(source, 0, 5), source);
});

test("applyStudioSceneStructureEdit dispatches supported edit commands", () => {
  const source = JSON.stringify({ slides: [{ title: "A", text: "old", lines: ["old"] }] });
  const next = applyStudioSceneStructureEdit(source, {
    type: "update-line",
    sceneIndex: 0,
    lineIndex: 0,
    text: "new",
  });

  assert.deepEqual(slidesOf(next)[0]?.lines, ["new"]);
});
