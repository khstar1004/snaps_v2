import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSafeRedirectPath } from "./safe-redirect";

test("normalizeSafeRedirectPath preserves safe absolute app paths", () => {
  assert.equal(normalizeSafeRedirectPath("/settings?tab=contentProfile"), "/settings?tab=contentProfile");
  assert.equal(normalizeSafeRedirectPath("/assets"), "/assets");
  assert.equal(normalizeSafeRedirectPath("/shorts-json-studio?mode=onboarding#publish"), "/shorts-json-studio?mode=onboarding#publish");
});

test("normalizeSafeRedirectPath falls back for empty and malformed values", () => {
  assert.equal(normalizeSafeRedirectPath(null), "/publish");
  assert.equal(normalizeSafeRedirectPath(""), "/publish");
  assert.equal(normalizeSafeRedirectPath("   "), "/publish");
  assert.equal(normalizeSafeRedirectPath("publish"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/%"), "/publish");
});

test("normalizeSafeRedirectPath rejects external origins and protocol-like inputs", () => {
  assert.equal(normalizeSafeRedirectPath("https://evil.example/path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("http://evil.example/path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("javascript:alert(1)"), "/publish");
  assert.equal(normalizeSafeRedirectPath("//evil.example/path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("///evil.example/path"), "/publish");
});

test("normalizeSafeRedirectPath rejects backslash and encoded protocol-relative variants", () => {
  assert.equal(normalizeSafeRedirectPath("\\\\evil.example\\path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/\\evil.example\\path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/assets\\evil"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/assets%5Cevil"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/%5C%5Cevil.example/path"), "/publish");
  assert.equal(normalizeSafeRedirectPath("/%2F%2Fevil.example/path"), "/publish");
});
