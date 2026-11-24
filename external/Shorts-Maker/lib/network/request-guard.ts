import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);
type ResolvedAddress = { address: string; family: number };
type LookupAll = (hostname: string, options: { all: true; verbatim: true }) => Promise<ResolvedAddress[]>;

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  if (value.startsWith("::ffff:")) {
    const maybeV4 = value.slice("::ffff:".length);
    if (isIP(maybeV4) === 4) return isBlockedIPv4(maybeV4);
    const hexParts = maybeV4.split(":");
    if (hexParts.length === 2 && hexParts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const high = Number.parseInt(hexParts[0], 16);
      const low = Number.parseInt(hexParts[1], 16);
      return isBlockedIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_HOSTS.has(normalized)) return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  const ipVersion = isIP(normalized);
  if (ipVersion > 0) {
    return isBlockedIp(normalized);
  }
  return false;
}

async function assertHostIsPublic(hostname: string, lookupImpl: LookupAll = lookup): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("blocked host");
  }
  const records = await lookupImpl(hostname, { all: true, verbatim: true });
  assertResolvedAddressesArePublic(records);
}

function assertResolvedAddressesArePublic(records: ResolvedAddress[]): void {
  if (!records || records.length <= 0) {
    throw new Error("dns lookup failed");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error("blocked resolved address");
    }
  }
}

function normalizeLookupFamily(family: number | "IPv4" | "IPv6" | undefined): number | undefined {
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return undefined;
}

function createPublicOnlyLookup(lookupImpl: LookupAll = lookup): LookupFunction {
  return (hostname, options, callback): void => {
    lookupImpl(hostname, { all: true, verbatim: true })
      .then((records) => {
        assertResolvedAddressesArePublic(records);
        if (options.all) {
          callback(null, records);
          return;
        }
        const family = normalizeLookupFamily(options.family);
        const record = records.find((candidate) => !family || candidate.family === family);
        if (!record) {
          throw new Error("dns lookup failed");
        }
        callback(null, record.address, record.family);
      })
      .catch((error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), undefined as never);
      });
  };
}

function createPublicOnlyDispatcher(lookupImpl?: LookupAll): Agent {
  return new Agent({
    connect: {
      lookup: createPublicOnlyLookup(lookupImpl),
    },
  });
}

const defaultPublicOnlyDispatcher = createPublicOnlyDispatcher();
const customLookupDispatchers = new WeakMap<LookupAll, Agent>();

function getPublicOnlyDispatcher(lookupImpl?: LookupAll): Agent {
  if (!lookupImpl) return defaultPublicOnlyDispatcher;
  const existing = customLookupDispatchers.get(lookupImpl);
  if (existing) return existing;
  const dispatcher = createPublicOnlyDispatcher(lookupImpl);
  customLookupDispatchers.set(lookupImpl, dispatcher);
  return dispatcher;
}

export function assertSafeRemoteUrl(target: URL): void {
  if (!(target.protocol === "http:" || target.protocol === "https:")) {
    throw new Error("unsupported protocol");
  }
  if (target.username || target.password) {
    throw new Error("credentials not allowed");
  }
  if (!ALLOWED_PORTS.has(target.port)) {
    throw new Error("unsupported port");
  }
}

export async function fetchWithRedirectValidation(
  target: URL,
  options: {
    signal: AbortSignal;
    redirectLimit?: number;
    fetchImpl?: typeof fetch;
    lookupImpl?: LookupAll;
    headers?: Record<string, string>;
    getHeadersForUrl?: (url: URL) => Record<string, string>;
  }
): Promise<Response> {
  let current = new URL(target.toString());
  const redirectLimit = Number.isFinite(options.redirectLimit) ? Math.max(0, Math.floor(options.redirectLimit as number)) : 3;
  const providedFetch = options.fetchImpl;
  const usesNativeFetch = !providedFetch || providedFetch === globalThis.fetch;
  const fetchImpl = usesNativeFetch ? undefined : providedFetch;
  const dispatcher = usesNativeFetch ? getPublicOnlyDispatcher(options.lookupImpl) : undefined;

  for (let redirectCount = 0; redirectCount <= redirectLimit; redirectCount += 1) {
    assertSafeRemoteUrl(current);
    await assertHostIsPublic(current.hostname, options.lookupImpl);
    const fetchOptions = {
      method: "GET",
      headers: options.getHeadersForUrl ? options.getHeadersForUrl(current) : options.headers,
      signal: options.signal,
      cache: "no-store",
      redirect: "manual",
    } satisfies RequestInit;
    const upstream = fetchImpl
      ? await fetchImpl(current.toString(), fetchOptions)
      : ((await undiciFetch(current.toString(), {
          ...fetchOptions,
          dispatcher,
        } satisfies UndiciRequestInit)) as unknown as Response);
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        await cancelResponseBodyQuietly(upstream, new Error("invalid redirect location"));
        throw new Error("invalid redirect location");
      }
      await cancelResponseBodyQuietly(upstream, new Error("redirect response discarded"));
      current = new URL(location, current);
      continue;
    }
    return upstream;
  }

  throw new Error("too many redirects");
}

export function assertContentLengthWithinLimit(contentLengthRaw: string | null, maxBytes: number): void {
  const parsed = Number(contentLengthRaw || "");
  if (!Number.isFinite(parsed)) return;
  if (parsed > maxBytes) {
    throw new Error("content too large");
  }
}

export async function cancelResponseBodyQuietly(response: Response, reason?: unknown): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // Keep the original caller path/error even if body cancellation fails.
  }
}

export async function readResponseBodyWithinLimit(
  response: Response,
  maxBytes: number,
  errorMessage = "content too large"
): Promise<Uint8Array> {
  try {
    assertContentLengthWithinLimit(response.headers.get("content-length"), maxBytes);
  } catch (error) {
    await cancelResponseBodyQuietly(response, error);
    throw error;
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(errorMessage);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        const error = new Error(errorMessage);
        try {
          await reader.cancel(error);
        } catch {
          // Preserve the size-limit error even if stream cancellation fails.
        }
        throw error;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
