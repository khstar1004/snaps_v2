import assert from "node:assert/strict";
import test from "node:test";
import { buildPublishCategoryRow, normalizeDeletedAt, normalizeStringArray, normalizeUserScope, safeTrim, toCategoryBranding, toCategoryMetadata, toSoftDeleteFilter } from "./publish-store-category-settings-helpers";
import type { PublishCategoryRow } from "./publish-store-category-settings";

test("publish category settings helpers normalize and serialize rows", () => {
  assert.equal(safeTrim("  hello  "), "hello");
  assert.equal(normalizeUserScope(" user-1 "), "user-1");
  assert.deepEqual(normalizeStringArray([" a ", "", 1, "b"]), ["a", "b"]);
  assert.equal(normalizeDeletedAt(123), 123);
  assert.equal(normalizeDeletedAt(-1), null);
  assert.deepEqual(toSoftDeleteFilter(), null);
  assert.deepEqual(toSoftDeleteFilter("deleted"), { op: "gt", value: 0 });

  const row: PublishCategoryRow = {
    user_id: "user_1",
    customer_key: "news",
    is_default: true,
    channel_id: "channel-1",
    description: " desc ",
    tags: [" a ", "b"],
    tts_voice_id: "voice",
    bgm_enabled: true,
    bgm_track_id: "bgm",
    mix_preset_id: "preset",
    bgm_volume: 1.2,
    playback_rate: 9,
    sfx_enabled: false,
    sfx_master_gain_db: -3,
    header_title: "Title",
    header_accent_text: "Accent",
    header_color: "#111111",
    footer_color: "#eeeeee",
    info_line_text: "Info",
    font_family: "Inter",
    image_rounded: true,
    created_at_ms: 1,
    updated_at_ms: 2,
  };

  assert.deepEqual(toCategoryMetadata(row), {
    description: "desc",
    tags: ["a", "b"],
    ttsVoiceId: "voice",
    bgmEnabled: true,
    bgmTrackId: "bgm",
    mixPresetId: "preset",
    bgmVolume: 1,
    playbackRate: 3,
    sfxEnabled: false,
    sfxMasterGainDb: -3,
    templateNotes: "",
  });
  assert.deepEqual(toCategoryBranding(row), {
    headerTitle: "Title",
    headerAccentText: "Accent",
    headerColor: "#111111",
    footerColor: "#eeeeee",
    infoLineText: "Info",
    fontFamily: "Inter",
    imageRounded: true,
  });

  const built = buildPublishCategoryRow({
    userId: " user-1 ",
    category: "news",
    existing: row,
    overrides: {
      description: "next",
      bgm_volume: 0.42,
      playback_rate: 2.25,
      image_rounded: false,
    },
  });
  assert.equal(built.user_id, "user-1");
  assert.equal(built.description, "next");
  assert.equal(built.bgm_volume, 0.42);
  assert.equal(built.playback_rate, 2.25);
  assert.equal(built.image_rounded, false);
  assert.equal(built.created_at_ms, 1);
});
