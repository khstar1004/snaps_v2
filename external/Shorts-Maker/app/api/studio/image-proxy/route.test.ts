import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createValidatedHeaders } from "../../test-helpers";
import { GET, handleStudioImageProxyRequest } from "./route";

function createImageProxyRequest(url: string, headers?: Headers) {
  return new NextRequest(url, {
    method: "GET",
    headers: headers || new Headers(),
  });
}

test("studio image proxy requires an authenticated session", async () => {
  const response = await GET(createImageProxyRequest("http://localhost/api/studio/image-proxy?url=https://93.184.216.34/photo.jpg"));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "로그인이 필요합니다.",
    errorCode: "AUTH_REQUIRED",
    retryable: false,
  });
});

test("studio image proxy unwraps nested cboard image urls before fetching upstream", async () => {
  const seenUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    seenUrls.push(String(input));
    return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
      },
    });
  }) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest(
      "http://localhost/api/studio/image-proxy?url=" +
        encodeURIComponent("https://img-api.cboard.net/img_n.php?image_url=https%3A%2F%2F93.184.216.34%2Fphoto.jpg"),
      createValidatedHeaders()
    ),
    { fetchImpl }
  );

  assert.equal(response.status, 200);
  assert.equal(seenUrls[0], "https://93.184.216.34/photo.jpg");
  assert.equal(response.headers.get("content-type"), "image/jpeg");
});

test("studio image proxy rejects html-like upstream bodies that claim to be images", async () => {
  const fetchImpl = (async () =>
    new Response("<html><body>blocked</body></html>", {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
      },
    })) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest("http://localhost/api/studio/image-proxy?url=https://93.184.216.34/broken.jpg", createValidatedHeaders()),
    { fetchImpl }
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "원본 이미지 응답이 손상되었거나 차단되었습니다.",
    errorCode: "IMAGE_PROXY_INVALID_IMAGE_BYTES",
    retryable: true,
  });
});

test("studio image proxy rejects svg upstream images and cancels the discarded body", async () => {
  let cancelReason: unknown;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from("<svg><script>alert(1)</script></svg>"));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const fetchImpl = (async () =>
    new Response(stream, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
      },
    })) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest("http://localhost/api/studio/image-proxy?url=https://93.184.216.34/vector.svg", createValidatedHeaders()),
    { fetchImpl }
  );

  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "SVG 이미지는 보안상 프록시할 수 없습니다.",
    errorCode: "IMAGE_PROXY_UNSAFE_IMAGE_TYPE",
    retryable: false,
  });
  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "svg image response discarded");
});

test("studio image proxy cancels non-ok upstream response bodies before returning", async () => {
  let cancelReason: unknown;
  const stream = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const fetchImpl = (async () =>
    new Response(stream, {
      status: 404,
      headers: {
        "content-type": "text/plain",
      },
    })) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest("http://localhost/api/studio/image-proxy?url=https://93.184.216.34/missing.jpg", createValidatedHeaders()),
    { fetchImpl }
  );

  assert.equal(response.status, 502);
  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "upstream response discarded");
});

test("studio image proxy cancels non-image upstream response bodies before returning", async () => {
  let cancelReason: unknown;
  const stream = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const fetchImpl = (async () =>
    new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/html",
      },
    })) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest("http://localhost/api/studio/image-proxy?url=https://93.184.216.34/not-image", createValidatedHeaders()),
    { fetchImpl }
  );

  assert.equal(response.status, 415);
  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "non-image response discarded");
});

test("studio image proxy cancels streamed bodies that exceed the byte limit", async () => {
  let cancelReason: unknown;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(12 * 1024 * 1024));
      controller.enqueue(new Uint8Array([1]));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const fetchImpl = (async () =>
    new Response(stream, {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })) as typeof fetch;

  const response = await handleStudioImageProxyRequest(
    createImageProxyRequest(
      "http://localhost/api/studio/image-proxy?url=https://93.184.216.34/large.jpg",
      createValidatedHeaders()
    ),
    { fetchImpl }
  );

  assert.equal(response.status, 413);
  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "content too large");
});
