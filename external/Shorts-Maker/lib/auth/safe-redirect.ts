const DEFAULT_SAFE_REDIRECT_PATH = "/publish";
const LOCAL_REDIRECT_BASE = "https://local.redirect";
const INVALID_PERCENT_ENCODING_PATTERN = /%(?![0-9a-fA-F]{2})/u;
const UNSAFE_BACKSLASH_PATTERN = /\\|%5c/iu;
const UNSAFE_ENCODED_PROTOCOL_RELATIVE_PATTERN = /^\/(?:%2f|%5c)/iu;

export function normalizeSafeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SAFE_REDIRECT_PATH;

  const candidate = value.trim();
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.startsWith("/\\") ||
    INVALID_PERCENT_ENCODING_PATTERN.test(candidate) ||
    UNSAFE_BACKSLASH_PATTERN.test(candidate) ||
    UNSAFE_ENCODED_PROTOCOL_RELATIVE_PATTERN.test(candidate)
  ) {
    return DEFAULT_SAFE_REDIRECT_PATH;
  }

  try {
    const parsed = new URL(candidate, LOCAL_REDIRECT_BASE);
    if (parsed.origin !== LOCAL_REDIRECT_BASE) return DEFAULT_SAFE_REDIRECT_PATH;

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      INVALID_PERCENT_ENCODING_PATTERN.test(path) ||
      UNSAFE_BACKSLASH_PATTERN.test(path) ||
      UNSAFE_ENCODED_PROTOCOL_RELATIVE_PATTERN.test(path)
    ) {
      return DEFAULT_SAFE_REDIRECT_PATH;
    }

    return path;
  } catch {
    return DEFAULT_SAFE_REDIRECT_PATH;
  }
}
