import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlidesFromSourceBody,
  buildSlidesFromTexts,
  normalizeParsedSlideLines,
  parseParsedDialogueSegments,
  shouldPreferDeterministicSlides,
  type ScriptStructure,
} from "./codex-script-to-json-slides-helpers";
import type { ScriptToJsonSlide } from "@/lib/studio/codex-script-to-json";
import { captionLineFits, createCaptionLayoutPolicy } from "./caption-layout";

test("buildSlidesFromTexts keeps short chunks merged into valid slides", () => {
  const slides = buildSlidesFromTexts(["첫 문장", "두 문장", "세 문장"]);

  assert.ok(slides.length >= 1);
  assert.ok(slides.every((slide) => slide.lines.length >= 2 && slide.lines.length <= 4));
});

test("normalizeParsedSlideLines repairs valid text when raw lines are too fragmented", () => {
  const result = normalizeParsedSlideLines("첫 문장 두 문장 세 문장", ["첫", "문장", "두", "문장", "세", "문장"]);

  assert.equal(result.repaired, true);
  assert.equal(result.lines.join(" "), "첫 문장 두 문장 세 문장");
});

test("shouldPreferDeterministicSlides prefers deterministic output for many short slides", () => {
  const source: ScriptStructure = {
    lines: ["후크", "첫 문장", "두 문장"],
    title: "후크",
    bodyLines: ["첫 문장", "두 문장", "세 문장", "네 문장"],
    cta: "",
    bodyText: "첫 문장 두 문장 세 문장 네 문장",
  };
  const slides: ScriptToJsonSlide[] = Array.from({ length: 8 }, (_, index) => ({
    text: `짧은 ${index}`,
    lines: [`짧${index}`, `짧${index}`],
  }));

  assert.equal(shouldPreferDeterministicSlides(slides, source), true);
  assert.ok(buildSlidesFromSourceBody(source).length >= 1);
});

test("buildSlidesFromSourceBody keeps a dangling connective with its following predicate", () => {
  const bodyText = "어느 날 일이 끝났음 그래서 오늘은 밥을 먹었다 집에 갔다 그리고 잠을 잤다 다음 날 일어났다";
  const source: ScriptStructure = {
    lines: ["매일 같은 자리", bodyText],
    title: "매일 같은 자리",
    bodyLines: [bodyText],
    cta: bodyText,
    bodyText,
  };
  const slides = buildSlidesFromSourceBody(source);

  assert.equal(slides.map((slide) => slide.text).join(" "), bodyText);
  assert.ok(slides.every((slide) => slide.lines.length >= 2 && slide.lines.length <= 4));
  assert.ok(slides.every((slide) => slide.lines.every((line) => Array.from(line).length <= 12)));
  assert.equal(slides.slice(0, -1).some((slide) => /그래서 오늘은$/.test(slide.text)), false);
  assert.equal(slides.slice(0, -1).some((slide) => /밥을$/.test(slide.text)), false);
});

test("buildSlidesFromSourceBody keeps a quote that fits within 12 characters on one line", () => {
  const bodyText = "옆에서 \"여기 앉으실래요?\" 하는데 그 여자였음";
  const source: ScriptStructure = {
    lines: ["제목", bodyText],
    title: "제목",
    bodyLines: [bodyText],
    cta: bodyText,
    bodyText,
  };
  const slides = buildSlidesFromSourceBody(source);

  assert.equal(slides.map((slide) => slide.text).join(" "), bodyText);
  assert.ok(slides.some((slide) => slide.lines.includes("\"여기 앉으실래요?\"")));
  assert.equal(slides.some((slide) => slide.lines.includes("\"여기")), false);
});

test("buildSlidesFromSourceBody keeps a dependent predicate phrase with its verb", () => {
  const bodyText = "작년에 사업장 피해 있었으면 이것도 챙길 수 있어";
  const source: ScriptStructure = {
    lines: ["제목", bodyText],
    title: "제목",
    bodyLines: [bodyText],
    cta: bodyText,
    bodyText,
  };
  const slides = buildSlidesFromSourceBody(source);

  assert.equal(slides.map((slide) => slide.text).join(" "), bodyText);
  assert.ok(slides.some((slide) => slide.lines.includes("챙길 수 있어")));
  assert.equal(slides.some((slide) => slide.lines.includes("수 있어")), false);
});

test("buildSlidesFromSourceBody splits a Hanja list and explanation when their rendered lines exceed four", () => {
  const glossLine = "달 월(月) 불 화(火) 물 수(水) 나무 목(木) 쇠 금(金) 흙 토(土) 해 일(日)";
  const followupLine = "요일 이름이 다 한자였던 거예요";
  const source: ScriptStructure = {
    lines: ["월화수목금토일", glossLine, followupLine],
    title: "월화수목금토일",
    bodyLines: [glossLine, followupLine],
    cta: followupLine,
    bodyText: `${glossLine} ${followupLine}`,
  };
  const captionLayoutPolicy = createCaptionLayoutPolicy({
    templateId: "default",
    templateData: { bodyScale: 1 },
    templateImageEnabled: true,
    templateImageLayout: {
      bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
      bodySize: 16,
    },
  });
  const slides = buildSlidesFromSourceBody(source, captionLayoutPolicy);

  assert.equal(slides.length, 2);
  assert.equal(slides[0]?.lines.length, 3);
  assert.deepEqual(slides[1]?.lines, ["요일 이름이 다", "한자였던 거예요"]);
  assert.equal(slides[0]?.lines.some((line) => /(?:달|불|물|나무|쇠|흙|해)$/.test(line)), false);
  assert.ok(slides.every((slide) => slide.lines.every((line) => captionLineFits(line, captionLayoutPolicy))));
  assert.equal(slides.map((slide) => slide.text).join(" "), `${glossLine} ${followupLine}`);
});

test("parseParsedDialogueSegments preserves clamped explicit speed and pause overrides", () => {
  const segments = parseParsedDialogueSegments(
    [
      { type: "narration", text: "첫 문장", speed: 0.1, pauseAfterMs: -5 },
      { type: "quote", text: "둘째 문장", speed: "2.4", pauseAfterMs: "4000.9" },
      { type: "narration", text: "기본값", speed: "", pauseAfterMs: "invalid" },
    ],
    0
  );

  assert.equal(segments?.[0]?.speed, 0.5);
  assert.equal(segments?.[0]?.pauseAfterMs, 0);
  assert.equal(segments?.[1]?.speed, 2);
  assert.equal(segments?.[1]?.pauseAfterMs, 3000);
  assert.equal(Object.prototype.hasOwnProperty.call(segments?.[2] || {}, "speed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(segments?.[2] || {}, "pauseAfterMs"), false);
});
