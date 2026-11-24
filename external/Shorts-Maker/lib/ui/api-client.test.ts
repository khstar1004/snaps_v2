import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, requestApi } from "./api-client";

test("requestApi reports HTML error pages as invalid JSON responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<!DOCTYPE html><html><body>not found</body></html>", {
      status: 404,
      headers: {
        "content-type": "text/html",
      },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => requestApi("/api/example", undefined, "fallback"),
      (error) =>
        error instanceof ApiClientError &&
        error.errorCode === "API_RESPONSE_INVALID_JSON" &&
        error.message.includes("status 404")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
