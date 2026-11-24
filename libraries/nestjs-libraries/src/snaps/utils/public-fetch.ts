import net from 'node:net';
import { isBlockedIp } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

export class SnapsBlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapsBlockedUrlError';
  }
}

const MAX_REDIRECTS = 5;

/** Rejects URLs that point at the server itself or a private network before connecting. */
export const assertSnapsPublicUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SnapsBlockedUrlError('URL is not valid.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SnapsBlockedUrlError('Only http and https URLs can be fetched.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SnapsBlockedUrlError('Local addresses cannot be fetched.');
  }
  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new SnapsBlockedUrlError('Private or reserved addresses cannot be fetched.');
  }
  return parsed;
};

/**
 * Fetches a user-supplied URL (source resolver, RSS feeds) without letting it reach
 * the backend's own network: every hop is re-validated, redirects are followed
 * manually, and the SSRF-safe dispatcher pins DNS so a hostname that resolves to a
 * private address is refused at connect time (covers DNS rebinding).
 */
export const fetchSnapsPublicUrl = async (url: string, init: RequestInit = {}) => {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertSnapsPublicUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        ...init,
        redirect: 'manual',
        // @ts-ignore undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
    } catch (error) {
      if (/Blocked IP/.test(String((error as { cause?: unknown })?.cause || error))) {
        throw new SnapsBlockedUrlError('Private or reserved addresses cannot be fetched.');
      }
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new SnapsBlockedUrlError('Too many redirects.');
};
