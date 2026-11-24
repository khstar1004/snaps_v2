import test from "node:test";
import assert from "node:assert/strict";
import { rebaseLocalStorageUrlToRequestOrigin, rebaseLocalStorageUrlsInJson } from "./asset-url-origin";

const REQUEST_ORIGIN = "http://localhost:3011";

test("rebaseLocalStorageUrlToRequestOrigin rewrites loopback local-storage URLs to the request origin", () => {
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("http://localhost:3000/api/local-storage/video-assets/final.mp4", REQUEST_ORIGIN),
    "http://localhost:3011/api/local-storage/video-assets/final.mp4"
  );
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("http://127.0.0.1:3000/api/local-storage/video-assets/final.mp4?download=1#clip", REQUEST_ORIGIN),
    "http://localhost:3011/api/local-storage/video-assets/final.mp4?download=1#clip"
  );
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("http://[::1]:3000/api/local-storage/video-assets/ipv6.mp4", REQUEST_ORIGIN),
    "http://localhost:3011/api/local-storage/video-assets/ipv6.mp4"
  );
});

test("rebaseLocalStorageUrlToRequestOrigin resolves root-relative local-storage URLs against the request origin", () => {
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("/api/local-storage/video-assets/final.mp4", REQUEST_ORIGIN),
    "http://localhost:3011/api/local-storage/video-assets/final.mp4"
  );
});

test("rebaseLocalStorageUrlToRequestOrigin leaves external and non-local-storage URLs unchanged", () => {
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("https://cdn.example.com/api/local-storage/video-assets/final.mp4", REQUEST_ORIGIN),
    "https://cdn.example.com/api/local-storage/video-assets/final.mp4"
  );
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("http://localhost:3000/other-service/final.mp4", REQUEST_ORIGIN),
    "http://localhost:3000/other-service/final.mp4"
  );
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("https://example.supabase.co/storage/v1/object/public/video-assets/final.mp4", REQUEST_ORIGIN),
    "https://example.supabase.co/storage/v1/object/public/video-assets/final.mp4"
  );
  assert.equal(rebaseLocalStorageUrlToRequestOrigin("data:image/png;base64,AAAA", REQUEST_ORIGIN), "data:image/png;base64,AAAA");
  assert.equal(
    rebaseLocalStorageUrlToRequestOrigin("blob:http://localhost:3000/example", REQUEST_ORIGIN),
    "blob:http://localhost:3000/example"
  );
});

test("rebaseLocalStorageUrlsInJson rewrites nested local-storage URL values only", () => {
  assert.deepEqual(
    rebaseLocalStorageUrlsInJson(
      {
        videoUrl: "http://localhost:3000/api/local-storage/video-assets/final.mp4",
        slides: [
          {
            imageUrl: "/api/local-storage/images/slide-1.png",
            sourceUrl: "https://cdn.example.com/image.png",
          },
        ],
      },
      REQUEST_ORIGIN
    ),
    {
      videoUrl: "http://localhost:3011/api/local-storage/video-assets/final.mp4",
      slides: [
        {
          imageUrl: "http://localhost:3011/api/local-storage/images/slide-1.png",
          sourceUrl: "https://cdn.example.com/image.png",
        },
      ],
    }
  );
});
