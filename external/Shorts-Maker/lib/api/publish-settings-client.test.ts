import assert from "node:assert/strict";
import test from "node:test";
import { saveFixedCharacterProfiles } from "./publish-settings-client";

test("saveFixedCharacterProfiles writes only the default profile roster payload", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return new Response(
      JSON.stringify({
        ok: true,
        metadata: {
          description: "기존 설명",
          tags: ["기존 태그"],
          ttsVoiceId: "voice-1",
          bgmTrackId: "bgm-1",
          templateNotes: "기존 메모",
          fixedCharacterProfiles: [
            { characterId: "hero", displayName: "쏙이", identityPrompt: "고정 외형" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await saveFixedCharacterProfiles({
      category: "alpha",
      fixedCharacterProfiles: [
        { characterId: "hero", displayName: "쏙이", identityPrompt: "고정 외형" },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedInput, "/api/publish/category-metadata");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    category: "alpha",
    templateId: "default",
    fixedCharacterProfiles: [
      { characterId: "hero", displayName: "쏙이", identityPrompt: "고정 외형" },
    ],
  });
});

test("saveFixedCharacterProfiles can clear a legacy template roster during migration", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        ok: true,
        metadata: {
          description: "기존 설명",
          tags: [],
          ttsVoiceId: "",
          bgmTrackId: "",
          templateNotes: "",
          fixedCharacterProfiles: [],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await saveFixedCharacterProfiles({
      category: "alpha",
      templateId: "black",
      fixedCharacterProfiles: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(capturedBody, {
    category: "alpha",
    templateId: "black",
    fixedCharacterProfiles: [],
  });
});
