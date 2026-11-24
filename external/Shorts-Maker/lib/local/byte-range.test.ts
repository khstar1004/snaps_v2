import assert from "node:assert/strict";
import { test } from "node:test";
import { parseByteRange } from "./byte-range";

test("parseByteRange returns null when no range header is present", () => {
  assert.equal(parseByteRange(null, 1000), null);
  assert.equal(parseByteRange(undefined, 1000), null);
  assert.equal(parseByteRange("", 1000), null);
});

test("parseByteRange resolves explicit, open-ended and suffix ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseByteRange("bytes=-100", 1000), { start: 900, end: 999 });
});

test("parseByteRange clamps ranges that overrun the file size", () => {
  assert.deepEqual(parseByteRange("bytes=-2000", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseByteRange("bytes=999-5000", 1000), { start: 999, end: 999 });
});

test("parseByteRange reports unsatisfiable ranges", () => {
  assert.equal(parseByteRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseByteRange("bytes=1500-1600", 1000), "unsatisfiable");
  assert.equal(parseByteRange("bytes=0-99", 0), "unsatisfiable");
});

test("parseByteRange ignores multi-range and malformed headers", () => {
  assert.equal(parseByteRange("bytes=0-9,20-29", 1000), null);
  assert.equal(parseByteRange("items=0-9", 1000), null);
  assert.equal(parseByteRange("bytes=abc", 1000), null);
  assert.equal(parseByteRange("bytes=-", 1000), null);
});
