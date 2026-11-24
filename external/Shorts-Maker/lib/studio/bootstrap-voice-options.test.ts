import assert from "node:assert/strict";
import test from "node:test";
import { filterStudioBootstrapVoiceOptions } from "./bootstrap-voice-options";

test("filterStudioBootstrapVoiceOptions keeps every typecast voice from the runtime catalog", () => {
  const filtered = filterStudioBootstrapVoiceOptions(
    [
      {
        id: "legacy:speaker:sohee",
        label: "Legacy Custom",
        provider: "legacy",
        source: "runtime",
      },
      {
        id: "typecast-asset-1",
        label: "Brand Voice · Typecast",
        provider: "typecast",
        source: "asset",
      },
      {
        id: "typecast:voice:tc_default_voice",
        label: "기본 Typecast 보이스",
        provider: "typecast",
        source: "builtin",
      },
      {
        id: "typecast:voice:tc_other_voice",
        label: "다른 Typecast 보이스",
        provider: "typecast",
        source: "runtime",
      },
    ],
    "typecast:voice:tc_default_voice",
    "tc_default_voice"
  );

  assert.deepEqual(
    filtered.map((voice) => voice.id),
    ["typecast-asset-1", "typecast:voice:tc_default_voice", "typecast:voice:tc_other_voice"]
  );
});
