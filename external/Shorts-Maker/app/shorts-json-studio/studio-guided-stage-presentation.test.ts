import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudioGuidedStagePresentation } from "./studio-guided-stage-presentation";

const emptyProgress = {
  isJsonValid: false,
  hasPreparedSlides: false,
  imageApproved: false,
};

test("guided stage presentation sends blocked work to the earliest required stage", () => {
  assert.deepEqual(resolveStudioGuidedStagePresentation({ step: 4, ...emptyProgress }), {
    blocked: true,
    blockReason: "대본과 장면 구조를 먼저 준비해 주세요.",
    recoveryStep: 1,
    recoveryLabel: "대본 단계로",
    primaryAction: null,
    primaryLabel: null,
  });

  const captionBlocked = resolveStudioGuidedStagePresentation({
    step: 3,
    ...emptyProgress,
    isJsonValid: true,
  });
  assert.equal(captionBlocked.recoveryStep, 2);
  assert.equal(captionBlocked.recoveryLabel, "이미지 단계로");
});

test("script stage hands off to the image stage once the scene structure is valid", () => {
  const script = resolveStudioGuidedStagePresentation({
    step: 1,
    ...emptyProgress,
    isJsonValid: true,
  });
  assert.equal(script.primaryAction, "go-to-image");
  assert.equal(script.primaryLabel, "이미지 단계로");

  const image = resolveStudioGuidedStagePresentation({
    step: 2,
    ...emptyProgress,
    imageSource: "manual-ai-prompt",
    isJsonValid: true,
  });
  assert.equal(image.primaryAction, "prepare-images");
  assert.equal(image.primaryLabel, "이미지 프롬프트 준비");
});

test("image and caption stages expose one state-driven primary action", () => {
  const prepareIncomplete = resolveStudioGuidedStagePresentation({
    step: 2,
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: false,
    imagePreparationHasFailures: false,
    imageApproved: false,
  });
  assert.equal(prepareIncomplete.primaryAction, "prepare-incomplete-images");
  assert.equal(prepareIncomplete.primaryLabel, "미완료 장면 준비");

  const retryFailed = resolveStudioGuidedStagePresentation({
    step: 2,
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: false,
    imagePreparationHasFailures: true,
    imageApproved: false,
  });
  assert.equal(retryFailed.primaryAction, "retry-failed-images");
  assert.equal(retryFailed.primaryLabel, "실패 장면 재시도");

  const approveImages = resolveStudioGuidedStagePresentation({
    step: 2,
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: true,
    imageApproved: false,
  });
  assert.equal(approveImages.primaryAction, "approve-images");
  assert.equal(approveImages.primaryLabel, "후보 승인");

  const crawlApproveImages = resolveStudioGuidedStagePresentation({
    step: 2,
    imageSource: "crawl-only",
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: true,
    imageApproved: false,
  });
  assert.equal(crawlApproveImages.primaryAction, "approve-images");
  assert.equal(crawlApproveImages.primaryLabel, "후보 승인");

  const captionAudio = resolveStudioGuidedStagePresentation({
    step: 2,
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: true,
    imageApproved: true,
  });
  assert.equal(captionAudio.primaryAction, "go-to-caption-audio");

  const review = resolveStudioGuidedStagePresentation({
    step: 3,
    isJsonValid: true,
    hasPreparedSlides: true,
    imageApproved: true,
  });
  assert.equal(review.primaryAction, "go-to-review");
  assert.equal(review.primaryLabel, "검수 시작");
});

test("auto-ai-generate skips the candidate approval action once every scene has an image", () => {
  const autoComplete = resolveStudioGuidedStagePresentation({
    step: 2,
    imageSource: "auto-ai-generate",
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: true,
    imageApproved: false,
  });
  assert.equal(autoComplete.primaryAction, "go-to-caption-audio");
  assert.equal(autoComplete.primaryLabel, "자막·오디오 단계로");

  const autoIncomplete = resolveStudioGuidedStagePresentation({
    step: 2,
    imageSource: "auto-ai-generate",
    isJsonValid: true,
    hasPreparedSlides: true,
    imagesComplete: false,
    imagePreparationHasFailures: false,
    imageApproved: false,
  });
  assert.equal(autoIncomplete.primaryAction, "prepare-incomplete-images");
});
