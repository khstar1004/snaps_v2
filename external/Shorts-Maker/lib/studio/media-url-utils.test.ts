import test from "node:test";
import assert from "node:assert/strict";
import { inferStudioRenderableMedia, normalizeStudioMediaUrls, unwrapStudioImageProxyUrl } from "./media-url-utils";

test("normalizeStudioMediaUrls preserves direct video motion for giphy assets when mp4 is available", () => {
  const normalized = normalizeStudioMediaUrls({
    imageUrl: "https://media.giphy.com/media/first/200_s.gif",
    mediaUrl: "https://media.giphy.com/media/first/200.mp4",
    mediaKind: "video",
  });

  assert.equal(normalized.imageUrl, "https://media.giphy.com/media/first/200_s.gif");
  assert.equal(normalized.mediaUrl, "https://media.giphy.com/media/first/200.mp4");
  assert.equal(normalized.mediaKind, "video");
});

test("unwrapStudioImageProxyUrl normalizes nested cboard wrapper urls", () => {
  const unwrapped = unwrapStudioImageProxyUrl(
    "/api/studio/image-proxy?url=https%3A%2F%2Fimg-api.cboard.net%2Fimg_n.php%3Fimage_url%3Dhttps%253A%252F%252Fkin-phinf.pstatic.net%252F20260418_1%252Fsample.jpg%253Ftype%253Dw860"
  );

  assert.equal(unwrapped, "https://kin-phinf.pstatic.net/20260418_1/sample.jpg?type=w860");
});

test("inferStudioRenderableMedia keeps proxied still images proxied for browser preview stability", () => {
  const proxiedUrl =
    "/api/studio/image-proxy?url=https%3A%2F%2Fkin-phinf.pstatic.net%2F20260418_1%2Fsample.jpg%3Ftype%3Dw860";

  const resolved = inferStudioRenderableMedia({
    imageUrl: proxiedUrl,
    mediaKind: "image",
  });

  assert.deepEqual(resolved, {
    kind: "image",
    url: proxiedUrl,
  });
});
