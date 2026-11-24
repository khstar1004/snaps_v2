import test from "node:test";
import assert from "node:assert/strict";
import { buildMediaReservationKeys } from "./media-reservation";

test("media reservation keys collapse proxy and giphy asset variants to the same identity", () => {
  const keys = buildMediaReservationKeys([
    "http://localhost:3000/api/studio/image-proxy?url=https%3A%2F%2Fmedia2.giphy.com%2Fmedia%2Fabc123%2F200w_s.gif%3Fcid%3Dtest",
    "https://media2.giphy.com/media/abc123/giphy.gif?cid=test",
    "https://giphy.com/gifs/some-slug-abc123",
  ]);

  assert.ok(keys.includes("giphy:abc123"));
  assert.equal(keys.filter((value) => value === "giphy:abc123").length, 1);
});

test("media reservation keys strip volatile querystrings from repeated still urls", () => {
  const keys = buildMediaReservationKeys([
    "https://imgnews.pstatic.net/image/origin/001/2026/03/23/example.jpg?type=w860",
    "https://imgnews.pstatic.net/image/origin/001/2026/03/23/example.jpg?type=w430",
  ]);

  assert.ok(keys.includes("https://imgnews.pstatic.net/image/origin/001/2026/03/23/example.jpg"));
});
