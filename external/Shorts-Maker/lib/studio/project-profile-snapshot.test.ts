import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneStudioProjectProfileSnapshot,
  createStudioProjectProfileSnapshot,
  parseStudioProjectProfileSnapshot,
} from "./project-profile-snapshot";

function makeSnapshotInput() {
  return {
    version: 1,
    projectId: "project-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "news",
      label: "뉴스 프로필",
      metadataSnapshot: {
        description: "desc",
        tags: ["  tag-a  ", "tag-b", ""],
        ttsVoiceId: "voice-main",
        bgmEnabled: true,
        bgmTrackId: "bgm-main",
        mixPresetId: "mix-main",
        bgmVolume: 0.5,
        playbackRate: 1.25,
        sfxEnabled: true,
        sfxMasterGainDb: 2,
        templateNotes: "notes",
        topicToScriptPrompt: "topic prompt",
        scriptToJsonPrompt: "json prompt",
        mascotPrompt: "mascot prompt",
        mascotName: "Mascot",
        mascotDescription: "mascot desc",
        mascotStyle: "flat",
        mascotTone: "bright",
        mascotNegativePrompt: "bad hands",
        mascotAnchorImageUrl: "https://example.com/mascot.png",
        mascotAnchorAssetId: "asset-1",
        fixedCharacterProfiles: [
          {
            characterId: " lead 1 ",
            displayName: " 주인공 ",
            identityPrompt: " 검은 머리\n남색 재킷 ",
          },
        ],
        unknown: "remove-me",
        templatePreset: {
          templateId: "black",
          templateData: { accentColor: "#fff", nested: { ok: true } },
          templateImageEnabled: true,
          templateImageUrl: "https://example.com/template.png",
          templateImageLayout: {
            headerTitleSlot: { x: 0, y: 0, w: 1, h: 1 },
            headerAccentSlot: { x: 0, y: 0, w: 1, h: 1 },
            titleSlot: { x: 0, y: 0, w: 1, h: 1 },
            bodySlot: { x: 0, y: 0, w: 1, h: 1 },
            imageSlot: { x: 0, y: 0, w: 1, h: 1 },
            infoSlot: { x: 0, y: 0, w: 1, h: 1 },
            titleColor: "#111",
            bodyColor: "#222",
            infoColor: "#333",
            titleAlign: "center",
            bodyAlign: "left",
            headerSize: 20,
            titleSize: 30,
            bodySize: 18,
            infoSize: 12,
          },
          templateLayoutApply: {
            title: true,
            body: false,
            image: true,
            info: false,
          },
          templateLayoutJson: "{\"drop\":true}",
        },
      },
    },
  };
}

test("parseStudioProjectProfileSnapshot clones and keeps only profile metadata allowlist", () => {
  const input = makeSnapshotInput();
  const parsed = parseStudioProjectProfileSnapshot(input, { expectedCategory: "news" });

  assert.equal(parsed?.projectId, "project-1");
  assert.equal(parsed?.contentProfile.category, "news");
  assert.deepEqual(parsed?.contentProfile.metadataSnapshot?.tags, ["tag-a", "tag-b"]);
  assert.equal(parsed?.contentProfile.metadataSnapshot?.ttsVoiceId, "voice-main");
  assert.equal(parsed?.contentProfile.metadataSnapshot?.mascotAnchorAssetId, "asset-1");
  assert.deepEqual(parsed?.contentProfile.metadataSnapshot?.fixedCharacterProfiles, [
    {
      characterId: "lead_1",
      displayName: "주인공",
      identityPrompt: "검은 머리 남색 재킷",
      anchorImageUrl: undefined,
      anchorAssetId: undefined,
    },
  ]);
  assert.equal(parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateId, "black");
  assert.equal("unknown" in (parsed?.contentProfile.metadataSnapshot as Record<string, unknown>), false);
  assert.equal("templateLayoutJson" in (parsed?.contentProfile.metadataSnapshot?.templatePreset as Record<string, unknown>), false);

  input.contentProfile.metadataSnapshot.tags.push("mutated");
  input.contentProfile.metadataSnapshot.templatePreset.templateData.accentColor = "#000";
  assert.deepEqual(parsed?.contentProfile.metadataSnapshot?.tags, ["tag-a", "tag-b"]);
  assert.equal(
    (parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateData as Record<string, unknown>).accentColor,
    "#fff"
  );
});

test("parseStudioProjectProfileSnapshot rejects invalid or mismatched required fields", () => {
  assert.equal(parseStudioProjectProfileSnapshot(null), null);
  assert.equal(parseStudioProjectProfileSnapshot({ ...makeSnapshotInput(), version: 2 }), null);
  assert.equal(parseStudioProjectProfileSnapshot(makeSnapshotInput(), { expectedCategory: "other" }), null);
  assert.equal(
    parseStudioProjectProfileSnapshot({
      ...makeSnapshotInput(),
      contentProfile: { ...makeSnapshotInput().contentProfile, label: "" },
    }),
    null
  );
});

test("parseStudioProjectProfileSnapshot bounds oversized metadata", () => {
  const input = makeSnapshotInput();
  input.contentProfile.metadataSnapshot.tags = Array.from({ length: 40 }, (_, index) => `tag-${index}`);
  input.contentProfile.metadataSnapshot.topicToScriptPrompt = "x".repeat(25_000);
  input.contentProfile.metadataSnapshot.templatePreset.templateData = {
    huge: Array.from({ length: 200 }, (_, index) => ({ index, text: "y".repeat(5_000) })),
  } as never;

  const parsed = parseStudioProjectProfileSnapshot(input);
  assert.equal(parsed?.contentProfile.metadataSnapshot?.tags.length, 32);
  assert.equal(parsed?.contentProfile.metadataSnapshot?.topicToScriptPrompt.length, 20_000);
  const huge = (parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateData as { huge?: unknown[] }).huge || [];
  assert.equal(huge.length, 80);
});

test("parseStudioProjectProfileSnapshot preserves an explicit null template preset", () => {
  const input = makeSnapshotInput();
  input.contentProfile.metadataSnapshot.templatePreset = null as never;

  const parsed = parseStudioProjectProfileSnapshot(input);

  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed?.contentProfile.metadataSnapshot || {}, "templatePreset"),
    true
  );
  assert.equal(parsed?.contentProfile.metadataSnapshot?.templatePreset, null);
});

test("parseStudioProjectProfileSnapshot strips prototype-pollution keys from template JSON", () => {
  const input = makeSnapshotInput();
  input.contentProfile.metadataSnapshot.templatePreset.templateData = JSON.parse(
    `{"safe":true,"__proto__":{"polluted":true},"nested":{"constructor":{"polluted":true},"prototype":{"polluted":true},"ok":"yes"}}`
  );
  input.contentProfile.metadataSnapshot.templatePreset.templateImageLayout = JSON.parse(
    `{"imageSlot":{"x":0,"y":0,"w":1,"h":1},"__proto__":{"polluted":true}}`
  );

  const parsed = parseStudioProjectProfileSnapshot(input);
  const templateData = parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateData as Record<string, unknown>;
  const nested = templateData.nested as Record<string, unknown>;
  const templateImageLayout = parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateImageLayout as Record<
    string,
    unknown
  >;

  assert.equal(templateData.safe, true);
  assert.equal(Object.prototype.hasOwnProperty.call(templateData, "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(nested, "constructor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(nested, "prototype"), false);
  assert.equal(nested.ok, "yes");
  assert.equal(Object.getPrototypeOf(templateData), null);
  assert.equal(Object.getPrototypeOf(nested), null);
  assert.equal(Object.prototype.hasOwnProperty.call(templateImageLayout, "__proto__"), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("parseStudioProjectProfileSnapshot strips prototype-pollution keys from template arrays", () => {
  const input = makeSnapshotInput();
  input.contentProfile.metadataSnapshot.templatePreset.templateData = JSON.parse(
    `{"items":[{"label":"safe","__proto__":{"polluted":true}},{"constructor":{"polluted":true},"value":1}]}`
  );

  const parsed = parseStudioProjectProfileSnapshot(input);
  const templateData = parsed?.contentProfile.metadataSnapshot?.templatePreset?.templateData as { items?: unknown[] };
  const first = templateData.items?.[0] as Record<string, unknown>;
  const second = templateData.items?.[1] as Record<string, unknown>;

  assert.equal(first.label, "safe");
  assert.equal(Object.prototype.hasOwnProperty.call(first, "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(second, "constructor"), false);
  assert.equal(second.value, 1);
  assert.equal(Object.getPrototypeOf(first), null);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("createStudioProjectProfileSnapshot and cloneStudioProjectProfileSnapshot are immutable", () => {
  const context = makeSnapshotInput();
  const snapshot = createStudioProjectProfileSnapshot(context);
  const clone = cloneStudioProjectProfileSnapshot(snapshot);

  context.contentProfile.metadataSnapshot.tags.push("context mutated");
  snapshot.contentProfile.metadataSnapshot?.tags.push("snapshot mutated");

  assert.deepEqual(clone.contentProfile.metadataSnapshot?.tags, ["tag-a", "tag-b"]);
  assert.equal(clone.projectId, "project-1");
});
