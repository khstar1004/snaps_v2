import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchAnchorImageBytes } from "./anchor-image-fetcher";

const PNG_SIGNATURE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("fetchAnchorImageBytes blocks localhost anchors before fetch", async () => {
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      fetchAnchorImageBytes("http://127.0.0.1/anchor.png", {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response(PNG_SIGNATURE_BYTES);
        },
        readFile: async () => PNG_SIGNATURE_BYTES,
      }),
    /blocked host/
  );

  assert.equal(fetchCalls, 0);
});

test("fetchAnchorImageBytes blocks redirects to private addresses", async () => {
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      fetchAnchorImageBytes("http://93.184.216.34/anchor.png", {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response(null, {
            status: 302,
            headers: {
              location: "http://127.0.0.1/private.png",
            },
          });
        },
        readFile: async () => PNG_SIGNATURE_BYTES,
      }),
    /blocked host/
  );

  assert.equal(fetchCalls, 1);
});

test("fetchAnchorImageBytes does not treat local-storage URLs as file paths without local storage config", async () => {
  const previousRoot = process.env.LOCAL_STORAGE_ROOT;
  const previousEnable = process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
  try {
    delete process.env.LOCAL_STORAGE_ROOT;
    delete process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
    let fetchCalls = 0;

    await assert.rejects(
      () =>
        fetchAnchorImageBytes("http://localhost:3000/api/local-storage/video-assets/anchors/hero.png", {
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response(PNG_SIGNATURE_BYTES);
          },
          readFile: async () => {
            throw new Error("readFile should not be called without local storage config");
          },
        }),
      /unsupported port|blocked host/
    );

    assert.equal(fetchCalls, 0);
  } finally {
    if (typeof previousRoot === "string") {
      process.env.LOCAL_STORAGE_ROOT = previousRoot;
    } else {
      delete process.env.LOCAL_STORAGE_ROOT;
    }
    if (typeof previousEnable === "string") {
      process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = previousEnable;
    } else {
      delete process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
    }
  }
});

test("fetchAnchorImageBytes rejects oversized content-length before reading body", async () => {
  let bodyWasRead = false;
  let bodyWasCancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      bodyWasCancelled = true;
    },
  });
  const oversizedResponse = {
    ok: true,
    status: 200,
    headers: new Headers({
      "content-length": "13",
    }),
    body,
    arrayBuffer: async () => {
      bodyWasRead = true;
      return PNG_SIGNATURE_BYTES.buffer;
    },
  } as Response;

  await assert.rejects(
    () =>
      fetchAnchorImageBytes(
        "http://93.184.216.34/large.png",
        {
          fetchImpl: async () => oversizedResponse,
          readFile: async () => PNG_SIGNATURE_BYTES,
        },
        {
          maxBytes: 12,
        }
      ),
    /content too large/
  );

  assert.equal(bodyWasRead, false);
  assert.equal(bodyWasCancelled, true);
});

test("fetchAnchorImageBytes cancels non-ok response bodies before throwing", async () => {
  let cancelReason: unknown;
  const body = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cancelReason = reason;
    },
  });

  await assert.rejects(
    () =>
      fetchAnchorImageBytes("http://93.184.216.34/missing.png", {
        fetchImpl: async () =>
          new Response(body, {
            status: 404,
            headers: {
              "content-type": "text/plain",
            },
          }),
        readFile: async () => PNG_SIGNATURE_BYTES,
      }),
    /anchor image fetch failed \(404\)/
  );

  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "anchor image response discarded");
});

test("fetchAnchorImageBytes rejects bodies that exceed the read limit", async () => {
  await assert.rejects(
    () =>
      fetchAnchorImageBytes(
        "http://93.184.216.34/body-large.png",
        {
          fetchImpl: async () => new Response(Buffer.concat([PNG_SIGNATURE_BYTES, Buffer.alloc(8)])),
          readFile: async () => PNG_SIGNATURE_BYTES,
        },
        {
          maxBytes: 12,
        }
      ),
    /content too large/
  );
});

test("fetchAnchorImageBytes cancels streamed bodies that exceed the read limit", async () => {
  let cancelReason: unknown;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(PNG_SIGNATURE_BYTES);
      controller.enqueue(new Uint8Array(8));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });

  await assert.rejects(
    () =>
      fetchAnchorImageBytes(
        "http://93.184.216.34/stream-large.png",
        {
          fetchImpl: async () => new Response(stream),
          readFile: async () => PNG_SIGNATURE_BYTES,
        },
        {
          maxBytes: 12,
        }
      ),
    /content too large/
  );

  assert.ok(cancelReason instanceof Error);
  assert.equal(cancelReason.message, "anchor image content too large");
});

test("fetchAnchorImageBytes accepts a public image response", async () => {
  const result = await fetchAnchorImageBytes("http://93.184.216.34/anchor.png", {
    fetchImpl: async () =>
      new Response(PNG_SIGNATURE_BYTES, {
        headers: {
          "content-type": "image/png",
          "content-length": String(PNG_SIGNATURE_BYTES.length),
        },
      }),
    readFile: async () => {
      throw new Error("readFile should not be called for remote anchors");
    },
  });

  assert.deepEqual(result.buffer, PNG_SIGNATURE_BYTES);
  assert.equal(result.contentType, "image/png");
});

test("fetchAnchorImageBytes reads loopback local-storage anchors across port changes without fetch", async () => {
  const previousRoot = process.env.LOCAL_STORAGE_ROOT;
  const previousEnable = process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
  const previousBaseUrl = process.env.LOCAL_STORAGE_PUBLIC_BASE_URL;
  try {
    const storageRoot = await mkdtemp(join(tmpdir(), "anchor-local-storage-"));
    const filePath = join(storageRoot, "video-assets", "anchors", "hero.png");
    await mkdir(join(storageRoot, "video-assets", "anchors"), { recursive: true });
    await writeFile(filePath, PNG_SIGNATURE_BYTES);

    process.env.LOCAL_STORAGE_ROOT = storageRoot;
    process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = "1";
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = "http://localhost:3000";

    let fetchCalls = 0;
    const result = await fetchAnchorImageBytes("http://localhost:4100/api/local-storage/video-assets/anchors/hero.png", {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called for local-storage anchors");
      },
      readFile,
      stat,
    });

    assert.equal(fetchCalls, 0);
    assert.deepEqual(result.buffer, PNG_SIGNATURE_BYTES);
  } finally {
    if (typeof previousRoot === "string") {
      process.env.LOCAL_STORAGE_ROOT = previousRoot;
    } else {
      delete process.env.LOCAL_STORAGE_ROOT;
    }
    if (typeof previousEnable === "string") {
      process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = previousEnable;
    } else {
      delete process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
    }
    if (typeof previousBaseUrl === "string") {
      process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = previousBaseUrl;
    } else {
      delete process.env.LOCAL_STORAGE_PUBLIC_BASE_URL;
    }
  }
});

test("fetchAnchorImageBytes resolves trusted relative local-storage anchors without network access", async () => {
  const previousRoot = process.env.LOCAL_STORAGE_ROOT;
  const previousEnable = process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
  const previousBaseUrl = process.env.LOCAL_STORAGE_PUBLIC_BASE_URL;
  try {
    const storageRoot = await mkdtemp(join(tmpdir(), "anchor-relative-local-storage-"));
    const filePath = join(storageRoot, "video-assets", "anchors", "relative.png");
    await mkdir(join(storageRoot, "video-assets", "anchors"), { recursive: true });
    await writeFile(filePath, PNG_SIGNATURE_BYTES);

    process.env.LOCAL_STORAGE_ROOT = storageRoot;
    process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = "1";
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = "http://localhost:3000";

    let fetchCalls = 0;
    const result = await fetchAnchorImageBytes("/api/local-storage/video-assets/anchors/relative.png", {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called for relative local-storage anchors");
      },
      readFile,
      stat,
    });

    assert.equal(fetchCalls, 0);
    assert.deepEqual(result.buffer, PNG_SIGNATURE_BYTES);
  } finally {
    if (typeof previousRoot === "string") process.env.LOCAL_STORAGE_ROOT = previousRoot;
    else delete process.env.LOCAL_STORAGE_ROOT;
    if (typeof previousEnable === "string") process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = previousEnable;
    else delete process.env.LOCAL_STORAGE_ENABLE_IN_TESTS;
    if (typeof previousBaseUrl === "string") process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = previousBaseUrl;
    else delete process.env.LOCAL_STORAGE_PUBLIC_BASE_URL;
  }
});

test("fetchAnchorImageBytes rejects arbitrary relative application paths", async () => {
  await assert.rejects(
    () =>
      fetchAnchorImageBytes("/studio-assets/private.png", {
        fetchImpl: async () => new Response(PNG_SIGNATURE_BYTES),
        readFile: async () => PNG_SIGNATURE_BYTES,
      }),
    /invalid anchor image url/
  );
});
