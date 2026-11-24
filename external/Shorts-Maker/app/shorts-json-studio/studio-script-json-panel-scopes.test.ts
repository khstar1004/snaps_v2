import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStudioScriptJsonPanelScopeVisibility,
  resolveStudioScriptJsonPanelSectionScope,
} from "./studio-script-json-panel-scopes";

test("resolveStudioScriptJsonPanelSectionScope defaults to the legacy all-in-one panel", () => {
  assert.equal(resolveStudioScriptJsonPanelSectionScope(), "all");
  assert.deepEqual(resolveStudioScriptJsonPanelScopeVisibility(undefined, "auto-ai-generate"), {
    showScriptSections: true,
    showNarrationVoiceSection: true,
    showVoiceDialogueSections: true,
    showImageStyleSection: true,
    showCharacterSection: false,
  });
});

test("resolveStudioScriptJsonPanelScopeVisibility isolates script, voice, and image scopes", () => {
  assert.deepEqual(resolveStudioScriptJsonPanelScopeVisibility("script", "auto-ai-generate"), {
    showScriptSections: true,
    showNarrationVoiceSection: false,
    showVoiceDialogueSections: false,
    showImageStyleSection: false,
    showCharacterSection: false,
  });
  assert.deepEqual(resolveStudioScriptJsonPanelScopeVisibility("voice", "auto-ai-generate"), {
    showScriptSections: false,
    showNarrationVoiceSection: false,
    showVoiceDialogueSections: true,
    showImageStyleSection: false,
    showCharacterSection: false,
  });
  assert.deepEqual(resolveStudioScriptJsonPanelScopeVisibility("image", "auto-ai-generate"), {
    showScriptSections: false,
    showNarrationVoiceSection: false,
    showVoiceDialogueSections: false,
    showImageStyleSection: true,
    showCharacterSection: false,
  });
  assert.equal(resolveStudioScriptJsonPanelScopeVisibility("image", "manual-ai-prompt").showImageStyleSection, true);
  assert.equal(resolveStudioScriptJsonPanelScopeVisibility("image", "crawl-only").showImageStyleSection, false);
  assert.equal(
    resolveStudioScriptJsonPanelScopeVisibility("image", "auto-ai-generate", true).showImageStyleSection,
    false
  );
});
