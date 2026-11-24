import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudioImageSettingsVisibility } from "./studio-image-settings-visibility";

test("image settings visibility separates crawl, manual, and automatic modes", () => {
  assert.deepEqual(resolveStudioImageSettingsVisibility("crawl-only", false), {
    showCrawlSettings: true,
    showFixedCharacterSelection: false,
    showImageStyle: false,
  });
  for (const imageSource of ["manual-ai-prompt", "auto-ai-generate"] as const) {
    assert.deepEqual(resolveStudioImageSettingsVisibility(imageSource, false), {
      showCrawlSettings: false,
      showFixedCharacterSelection: true,
      showImageStyle: true,
    });
    assert.deepEqual(resolveStudioImageSettingsVisibility(imageSource, true), {
      showCrawlSettings: false,
      showFixedCharacterSelection: true,
      showImageStyle: false,
    });
  }
});
