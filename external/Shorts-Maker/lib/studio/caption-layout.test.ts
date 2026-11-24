import assert from "node:assert/strict";
import test from "node:test";
import {
  captionLineFits,
  createCaptionLayoutPolicy,
  estimateTextWidthPxApprox,
  measureCaptionLine,
} from "./caption-layout";

const currentNewsLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.05, y: 0.1, w: 0.9, h: 0.07 },
  bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  titleColor: "#111111",
  bodyColor: "#111111",
  infoColor: "#666666",
  titleAlign: "center" as const,
  bodyAlign: "center" as const,
  headerSize: 17,
  titleSize: 20,
  bodySize: 16,
  infoSize: 15,
};

test("caption width measures Hanja, parentheses, spaces, Hangul, and ASCII separately", () => {
  const fontPx = 64;

  assert.ok(estimateTextWidthPxApprox("月", fontPx) > estimateTextWidthPxApprox("A", fontPx));
  assert.ok(estimateTextWidthPxApprox("한", fontPx) > estimateTextWidthPxApprox("A", fontPx));
  assert.ok(estimateTextWidthPxApprox("(月)", fontPx) > estimateTextWidthPxApprox("月", fontPx));
  assert.ok(estimateTextWidthPxApprox("달 월", fontPx) > estimateTextWidthPxApprox("달월", fontPx));
});

test("default template creates a render-width policy with safety margin", () => {
  const policy = createCaptionLayoutPolicy({
    templateId: "default",
    templateData: { bodyScale: 1 },
    templateImageEnabled: true,
    templateImageLayout: currentNewsLayout,
  });

  assert.equal(policy.mode, "render-width");
  if (policy.mode !== "render-width") return;
  assert.equal(policy.fontSizePx, 64);
  assert.ok(policy.maxWidthPx > 850 && policy.maxWidthPx < 870);
  assert.equal(captionLineFits("달 월(月) 불 화(火) 물 수(水)", policy), true);
  assert.equal(captionLineFits("달 월(月) 불 화(火) 물 수(水) 나무 목(木)", policy), false);
});

test("legacy policy counts every displayed character including Hanja, parentheses, and spaces", () => {
  const policy = createCaptionLayoutPolicy({ templateId: "black" });

  assert.equal(policy.mode, "character-count");
  assert.equal(measureCaptionLine("달 월(月) 불 화(火)", policy), Array.from("달 월(月) 불 화(火)").length);
  assert.equal(captionLineFits("달 월(月) 불 화(火)", policy), false);
});

test("missing default layout falls back to the full visible 12-character limit", () => {
  const policy = createCaptionLayoutPolicy({ templateId: "default", templateData: { bodyScale: 1 } });

  assert.deepEqual(policy, { mode: "character-count", maxCharacters: 12 });
});
