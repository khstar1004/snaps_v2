// The three snaps workspaces each carried a byte-identical copy of these.
// The same duplication on the server side drifted three separate times - a
// leak in every copy of the atomic writer, a sanitiser that existed in only
// one of the paths that needed it - so they live in one place here before
// that happens to the error reader every workspace shows the operator.

import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

export const withSnapsJsonHeaders = (init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const normalizedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalizedHeaders[key.toLowerCase() === 'content-type' ? 'Content-Type' : key] =
      value;
  });

  return {
    ...init,
    headers: normalizedHeaders,
  };
};

export const extractSnapsErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  const candidates = [record.message, record.error, record.detail];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (Array.isArray(candidate)) {
      const messages = candidate
        .filter((item): item is string => typeof item === 'string' && !!item.trim())
        .map((item) => item.trim());
      if (messages.length) {
        return messages.join('\n');
      }
    }
  }

  return '';
};

export const readSnapsError = async (
  response: Response,
  fallback = `snaps 요청 실패 (${response.status})`
) => {
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const message = extractSnapsErrorMessage(parsed);
    if (message) {
      return message;
    }
  } catch {
    // Non-JSON error bodies are handled below.
  }

  if (trimmed.startsWith('<')) {
    return `${fallback}: ${response.statusText || '서버가 HTML 오류 응답을 반환했습니다.'}`;
  }

  // Grapheme-safe: this string is shown to the operator as the reason a
  // request failed, and a cut inside an emoji renders as a replacement
  // character in the middle of the message. Missed by the class guard
  // because its receiver list is a list of names and `trimmed` was not
  // on it.
  return snapsClampText(trimmed, 500);
};
