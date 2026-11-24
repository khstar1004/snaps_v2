import type { ImageProviderId, ImageRequest, StudioPrepareRequest } from "@/types/studio-json";

const ALLOWED_IMAGE_PROVIDERS: ImageProviderId[] = [
  "library",
  "naver",
  "giphy",
];

const DEFAULT_IMAGE_PROVIDER_ORDER: ImageProviderId[] = ["giphy", "naver"];

export function normalizeConfiguredImageProviders(providers?: ImageProviderId[]): ImageProviderId[] {
  if (!Array.isArray(providers) || providers.length <= 0) return DEFAULT_IMAGE_PROVIDER_ORDER;
  const normalized: ImageProviderId[] = [];
  for (const provider of providers) {
    if (!ALLOWED_IMAGE_PROVIDERS.includes(provider)) continue;
    if (!normalized.includes(provider)) normalized.push(provider);
  }
  return normalized.length > 0 ? normalized : DEFAULT_IMAGE_PROVIDER_ORDER;
}

export function resolveProviderOrder(
  searchIntent: "news" | "meme",
  request: ImageRequest,
  configured: ImageProviderId[],
  crawlMode?: StudioPrepareRequest["crawlMode"],
  options?: {
    preferGiphy?: boolean;
    allowGiphy?: boolean;
  }
): ImageProviderId[] {
  const effectiveConfigured = normalizeConfiguredImageProviders(configured).filter(
    (provider) => options?.allowGiphy !== false || provider !== "giphy"
  );
  const preferredProviders = Array.isArray(request.preferredProviders)
    ? request.preferredProviders.filter((provider): provider is ImageProviderId => effectiveConfigured.includes(provider))
    : [];
  if (preferredProviders[0]) {
    return [preferredProviders[0]];
  }
  const shouldPreferGiphy =
    options?.preferGiphy ??
    searchIntent === "meme";
  const priority: ImageProviderId[] = shouldPreferGiphy ? ["giphy", "naver"] : ["naver", "giphy"];
  const ordered: ImageProviderId[] = [];
  for (const provider of preferredProviders) {
    if (!ordered.includes(provider)) ordered.push(provider);
  }
  for (const provider of priority) {
    if (effectiveConfigured.includes(provider) && !ordered.includes(provider)) ordered.push(provider);
  }
  for (const provider of effectiveConfigured) {
    if (!ordered.includes(provider)) ordered.push(provider);
  }
  return ordered;
}
