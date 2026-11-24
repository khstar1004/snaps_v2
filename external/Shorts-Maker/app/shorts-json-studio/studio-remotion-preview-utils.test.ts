import assert from "node:assert/strict";
import test from "node:test";
import { slideHasMotionPreviewMedia } from "./studio-remotion-preview-utils";

test("slideHasMotionPreviewMedia detects direct video slides", () => {
  assert.equal(
    slideHasMotionPreviewMedia({
      imageUrl: "https://cdn.example.com/preview.jpg",
      mediaUrl: "https://cdn.example.com/clip.mp4",
      mediaKind: "video",
    }),
    true,
  );
});

test("slideHasMotionPreviewMedia detects gif slides", () => {
  assert.equal(
    slideHasMotionPreviewMedia({
      imageUrl: "https://media.giphy.com/media/abc123/giphy.gif",
      mediaUrl: "",
      mediaKind: "animated_image",
    }),
    true,
  );
});

test("slideHasMotionPreviewMedia treats giphy webp as animated media", () => {
  assert.equal(
    slideHasMotionPreviewMedia({
      imageUrl: "https://media2.giphy.com/media/abc123/giphy.webp",
      mediaUrl: "",
      mediaKind: "animated_image",
    }),
    true,
  );
});

test("slideHasMotionPreviewMedia ignores still images", () => {
  assert.equal(
    slideHasMotionPreviewMedia({
      imageUrl: "https://images.example.com/still.jpg",
      mediaUrl: "",
      mediaKind: "image",
    }),
    false,
  );
});
