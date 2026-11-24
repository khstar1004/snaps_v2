import assert from "node:assert/strict";
import test from "node:test";
import { isSameTemplateBranding, resolveCategoryBranding } from "./studio-category-preset-storage";
import type { TemplateBranding } from "./types";

function makeBranding(overrides?: Partial<TemplateBranding>): TemplateBranding {
  return {
    variant: "news",
    headerTitle: "기본 헤더",
    headerAccentText: "ACCENT",
    headerColor: "#111111",
    footerColor: "#222222",
    infoLineText: "정보줄",
    fontFamily: "Pretendard",
    imageRounded: true,
    ...overrides,
  };
}

test("resolveCategoryBranding prefers per-category preset overrides before server defaults", () => {
  const draftBranding = makeBranding({ headerTitle: "draft" });
  const defaultBranding = makeBranding({ headerTitle: "default" });
  const serverBranding = makeBranding({ headerTitle: "server" });
  const overrideBranding = makeBranding({ headerTitle: "override" });

  const resolved = resolveCategoryBranding("default", {
    presetBrandingOverride: {
      category: "default",
      branding: overrideBranding,
    },
    categoryBrandingMap: {
      default: serverBranding,
    },
    defaultBrandingByCategory: {
      default: defaultBranding,
    },
    brandingDraft: draftBranding,
  });

  assert.equal(resolved.headerTitle, "override");
});

test("isSameTemplateBranding detects meaningful branding changes", () => {
  const left = makeBranding();
  const right = makeBranding();
  const changed = makeBranding({ footerColor: "#abcdef" });

  assert.equal(isSameTemplateBranding(left, right), true);
  assert.equal(isSameTemplateBranding(left, changed), false);
});
