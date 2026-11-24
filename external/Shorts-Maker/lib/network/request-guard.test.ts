import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRedirectValidation } from "./request-guard";

function errorChainIncludes(error: unknown, expected: string): boolean {
  if (!(error instanceof Error)) {
    return String(error).includes(expected);
  }
  if (error.message.includes(expected)) {
    return true;
  }
  return errorChainIncludes(error.cause, expected);
}

test("fetchWithRedirectValidation blocks hex IPv4-mapped IPv6 loopback and private DNS answers", async () => {
  const blockedAddresses = [
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:ac10:1",
    "::ffff:c0a8:1",
  ];

  for (const address of blockedAddresses) {
    let fetchCalls = 0;

    await assert.rejects(
      () =>
        fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
          signal: AbortSignal.timeout(1000),
          lookupImpl: async () => [{ address, family: 6 }],
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response("should not fetch");
          },
        }),
      /blocked resolved address/
    );

    assert.equal(fetchCalls, 0, address);
  }
});

test("fetchWithRedirectValidation allows public hex IPv4-mapped IPv6 DNS answers", async () => {
  let fetchCalls = 0;

  const response = await fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
    signal: AbortSignal.timeout(1000),
    lookupImpl: async () => [{ address: "::ffff:808:808", family: 6 }],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("ok");
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(response.status, 200);
});

test("fetchWithRedirectValidation cancels discarded redirect response bodies", async () => {
  let fetchCalls = 0;
  let redirectBodyWasCancelled = false;
  const redirectBody = new ReadableStream<Uint8Array>({
    cancel() {
      redirectBodyWasCancelled = true;
    },
  });

  const response = await fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
    signal: AbortSignal.timeout(1000),
    lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    fetchImpl: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(redirectBody, {
          status: 302,
          headers: {
            location: "https://cdn.example.test/image.png",
          },
        });
      }
      return new Response("ok");
    },
  });

  assert.equal(response.status, 200);
  assert.equal(fetchCalls, 2);
  assert.equal(redirectBodyWasCancelled, true);
});

test("fetchWithRedirectValidation cancels redirect bodies before parsing malformed locations", async () => {
  let redirectBodyWasCancelled = false;
  const redirectBody = new ReadableStream<Uint8Array>({
    cancel() {
      redirectBodyWasCancelled = true;
    },
  });

  await assert.rejects(
    () =>
      fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
        signal: AbortSignal.timeout(1000),
        lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
        fetchImpl: async () =>
          new Response(redirectBody, {
            status: 302,
            headers: {
              location: "http://[invalid",
            },
          }),
      }),
    /Invalid URL/
  );

  assert.equal(redirectBodyWasCancelled, true);
});

test("fetchWithRedirectValidation rejects private addresses from native fetch connection lookup", async () => {
  const lookupResults = [
    [{ address: "8.8.8.8", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }],
  ];
  let lookupCalls = 0;

  await assert.rejects(
    () =>
      fetchWithRedirectValidation(new URL("http://media.example.test/image.png"), {
        signal: AbortSignal.timeout(1000),
        lookupImpl: async () => lookupResults[Math.min(lookupCalls++, lookupResults.length - 1)],
      }),
    (error: unknown) => {
      assert.ok(errorChainIncludes(error, "blocked resolved address"));
      return true;
    }
  );

  assert.equal(lookupCalls, 2);
});

test("fetchWithRedirectValidation treats explicit global fetch as native fetch with guarded lookup", async () => {
  const lookupResults = [
    [{ address: "8.8.8.8", family: 4 }],
    [{ address: "10.0.0.1", family: 4 }],
  ];
  let lookupCalls = 0;

  await assert.rejects(
    () =>
      fetchWithRedirectValidation(new URL("http://media.example.test/image.png"), {
        signal: AbortSignal.timeout(1000),
        fetchImpl: globalThis.fetch,
        lookupImpl: async () => lookupResults[Math.min(lookupCalls++, lookupResults.length - 1)],
      }),
    (error: unknown) => {
      assert.ok(errorChainIncludes(error, "blocked resolved address"));
      return true;
    }
  );

  assert.equal(lookupCalls, 2);
});

test("fetchWithRedirectValidation fails closed for mixed public and private DNS answers", async () => {
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
        signal: AbortSignal.timeout(1000),
        lookupImpl: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("should not fetch");
        },
      }),
    /blocked resolved address/
  );

  assert.equal(fetchCalls, 0);
});

test("fetchWithRedirectValidation does not pass an undici dispatcher to custom fetch implementations", async () => {
  let receivedInit: RequestInit | undefined;

  await fetchWithRedirectValidation(new URL("https://media.example.test/image.png"), {
    signal: AbortSignal.timeout(1000),
    lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    fetchImpl: async (_input, init) => {
      receivedInit = init;
      return new Response("ok");
    },
  });

  assert.ok(receivedInit);
  assert.equal("dispatcher" in (receivedInit as Record<string, unknown>), false);
});
