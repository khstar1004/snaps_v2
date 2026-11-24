import test from "node:test";
import assert from "node:assert/strict";
import { planRenderAudioMemoryBudget, resolveRenderMemoryBudgetLimits } from "./render-memory-budget";

const MB = 1024 * 1024;

test("resolveRenderMemoryBudgetLimits uses intended defaults for missing or blank environment values", () => {
  const previousSoft = process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB;
  const previousHard = process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB;
  try {
    delete process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB;
    process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB = "  ";

    assert.deepEqual(resolveRenderMemoryBudgetLimits(), { softLimitMb: 850, hardLimitMb: 1200 });
  } finally {
    if (previousSoft === undefined) delete process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB;
    else process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB = previousSoft;
    if (previousHard === undefined) delete process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB;
    else process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB = previousHard;
  }
});

test("resolveRenderMemoryBudgetLimits keeps the hard limit at least 128MB above soft", () => {
  const previousSoft = process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB;
  const previousHard = process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB;
  try {
    process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB = "900";
    process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB = "910";

    assert.deepEqual(resolveRenderMemoryBudgetLimits(), { softLimitMb: 900, hardLimitMb: 1028 });
  } finally {
    if (previousSoft === undefined) delete process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB;
    else process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_SOFT_LIMIT_MB = previousSoft;
    if (previousHard === undefined) delete process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB;
    else process.env.NEXT_PUBLIC_STUDIO_RENDER_MEMORY_HARD_LIMIT_MB = previousHard;
  }
});

test("planRenderAudioMemoryBudget preserves the complete audio plan below the soft limit", () => {
  const plan = planRenderAudioMemoryBudget({
    frameCount: 1,
    imageBytes: MB,
    narrationAudioBytes: MB,
    bgmEnabled: true,
    sfxCueCount: 2,
    softLimitMb: 256,
    hardLimitMb: 384,
  });

  assert.equal(plan.blocked, false);
  assert.equal(plan.degradeLevel, "none");
  assert.equal(plan.degraded, false);
  assert.equal(plan.softLimitExceeded, false);
  assert.equal(plan.bgmEnabled, true);
  assert.equal(plan.maxSfxCues, 2);
});

test("planRenderAudioMemoryBudget keeps BGM and every SFX cue above the soft limit", () => {
  const plan = planRenderAudioMemoryBudget({
    frameCount: 100,
    imageBytes: 100 * MB,
    narrationAudioBytes: 0,
    bgmEnabled: true,
    sfxCueCount: 12,
    softLimitMb: 256,
    hardLimitMb: 384,
  });

  assert.equal(plan.blocked, false);
  assert.equal(plan.degradeLevel, "none");
  assert.equal(plan.degraded, false);
  assert.equal(plan.softLimitExceeded, true);
  assert.equal(plan.bgmEnabled, true);
  assert.equal(plan.maxSfxCues, 12);
  assert.equal(plan.estimatedMb > plan.softLimitMb, true);
  assert.equal(plan.estimatedMb <= plan.hardLimitMb, true);
});

test("planRenderAudioMemoryBudget blocks the complete requested mix above the hard limit", () => {
  const plan = planRenderAudioMemoryBudget({
    frameCount: 100,
    imageBytes: 150 * MB,
    narrationAudioBytes: 0,
    bgmEnabled: true,
    sfxCueCount: 12,
    softLimitMb: 256,
    hardLimitMb: 384,
  });

  assert.equal(plan.blocked, true);
  assert.equal(plan.degradeLevel, "blocked");
  assert.equal(plan.degraded, false);
  assert.equal(plan.softLimitExceeded, true);
  assert.equal(plan.bgmEnabled, true);
  assert.equal(plan.maxSfxCues, 12);
  assert.equal(plan.estimatedMb > plan.hardLimitMb, true);
});
