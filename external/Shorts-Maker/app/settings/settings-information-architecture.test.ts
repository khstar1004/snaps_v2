import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalPersonalV1SettingsHref,
  buildPersonalV1SettingsHref,
  getPersonalV1SettingsTabFromSearch,
  PERSONAL_V1_SETTINGS_SECTIONS,
} from "./settings-information-architecture";

test("personal V1 settings exposes the five approved top-level sections", () => {
  assert.deepEqual(
    PERSONAL_V1_SETTINGS_SECTIONS.map((section) => section.label),
    ["콘텐츠 프로필", "외부 연결", "템플릿·출력", "저장소·복구", "고급"]
  );
});

test("personal V1 settings keeps publishing and first-level layout tools out of standard sections", () => {
  const standardLinks = PERSONAL_V1_SETTINGS_SECTIONS.flatMap((section) => section.links.filter((link) => link.exposure === "standard"));
  assert.equal(standardLinks.some((link) => link.href === "/publish"), false);
  assert.equal(standardLinks.some((link) => link.href === "/layout-studio"), false);
});

test("advanced layout studio is only exposed in the advanced section", () => {
  const layoutLinks = PERSONAL_V1_SETTINGS_SECTIONS.flatMap((section) =>
    section.links.filter((link) => link.href === "/layout-studio").map((link) => ({ sectionId: section.id, exposure: link.exposure }))
  );
  assert.deepEqual(layoutLinks, [{ sectionId: "advanced", exposure: "advanced" }]);
});

test("content profile settings are managed inside settings without a legacy outbound link", () => {
  const contentProfileSection = PERSONAL_V1_SETTINGS_SECTIONS.find((section) => section.id === "contentProfile");
  assert.ok(contentProfileSection);
  assert.deepEqual(contentProfileSection.links, []);
  assert.equal(buildPersonalV1SettingsHref("contentProfile"), "/settings?tab=contentProfile");
  assert.equal(
    PERSONAL_V1_SETTINGS_SECTIONS.flatMap((section) => section.links).some((link) => link.href === "/channel-categories"),
    false
  );
});

test("settings query restores a valid section and safely falls back for invalid values", () => {
  assert.equal(getPersonalV1SettingsTabFromSearch("?tab=connections"), "connections");
  assert.equal(getPersonalV1SettingsTabFromSearch("?tab=storageRecovery"), "storageRecovery");
  assert.equal(getPersonalV1SettingsTabFromSearch("?tab=publish"), "contentProfile");
  assert.equal(getPersonalV1SettingsTabFromSearch(""), "contentProfile");
});

test("settings links preserve the selected section across external connection redirects", () => {
  assert.equal(buildPersonalV1SettingsHref("connections"), "/settings?tab=connections");
});

test("settings canonical URL keeps callback details while resolving the selected section", () => {
  assert.equal(buildCanonicalPersonalV1SettingsHref(""), "/settings?tab=contentProfile");
  assert.equal(
    buildCanonicalPersonalV1SettingsHref("?auth=success&channel=My+Channel"),
    "/settings?auth=success&channel=My+Channel&tab=contentProfile"
  );
  assert.equal(
    buildCanonicalPersonalV1SettingsHref("?tab=publish&auth=failed&reason=denied"),
    "/settings?tab=contentProfile&auth=failed&reason=denied"
  );
});
