import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStudioImageProxyUpstreamHeaders,
  normalizeStudioImageProxyUpstreamUrl,
  parseStudioImageProxyTarget,
} from "./image-proxy-shared";

test("parseStudioImageProxyTarget unwraps encoded upstream image urls", () => {
  const target = parseStudioImageProxyTarget(
    "http://localhost:3000/api/studio/image-proxy?url=https%3A%2F%2Fimages.example.com%2Fphoto.jpg%3Fv%3D1"
  );

  assert.ok(target instanceof URL);
  assert.equal(target?.toString(), "https://images.example.com/photo.jpg?v=1");
});

test("parseStudioImageProxyTarget accepts relative proxy urls", () => {
  const target = parseStudioImageProxyTarget("/api/studio/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fasset.png");

  assert.ok(target instanceof URL);
  assert.equal(target?.toString(), "https://cdn.example.com/asset.png");
});

test("parseStudioImageProxyTarget unwraps nested cboard image wrappers", () => {
  const target = parseStudioImageProxyTarget(
    "/api/studio/image-proxy?url=https%3A%2F%2Fimg-api.cboard.net%2Fimg_n.php%3Fimage_url%3Dhttps%253A%252F%252Fkin-phinf.pstatic.net%252F20260418_1%252Fsample.jpg%253Ftype%253Dw860"
  );

  assert.ok(target instanceof URL);
  assert.equal(target?.toString(), "https://kin-phinf.pstatic.net/20260418_1/sample.jpg?type=w860");
});

test("parseStudioImageProxyTarget ignores non proxy urls", () => {
  assert.equal(parseStudioImageProxyTarget("https://images.example.com/photo.jpg"), null);
});

test("buildStudioImageProxyUpstreamHeaders adds Yonhap referer headers", () => {
  const headers = buildStudioImageProxyUpstreamHeaders(new URL("https://img9.yna.co.kr/photo.jpg"));

  assert.equal(headers.Referer, "https://www.yna.co.kr/");
  assert.equal(headers.Origin, "https://www.yna.co.kr");
  assert.match(headers.Accept || "", /^image\//);
});

test("buildStudioImageProxyUpstreamHeaders adds Naver image referer headers", () => {
  const headers = buildStudioImageProxyUpstreamHeaders(new URL("https://kin-phinf.pstatic.net/sample.jpg"));

  assert.equal(headers.Referer, "https://search.naver.com/");
  assert.equal(headers.Origin, "https://search.naver.com");
});

test("normalizeStudioImageProxyUpstreamUrl preserves direct image urls", () => {
  assert.equal(
    normalizeStudioImageProxyUpstreamUrl("https://images.example.com/photo.jpg?v=1"),
    "https://images.example.com/photo.jpg?v=1"
  );
});
