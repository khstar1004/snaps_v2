import { searchMemeLibrary } from "@/lib/studio/meme-library";
import { searchGiphy } from "@/lib/studio/image-provider-giphy";
import { buildProviderQueries, type ProviderAdapterResult, type ProviderCandidate, type ProviderSearchOptions } from "@/lib/studio/image-provider-resolver-search";
import { parsePositiveNumber } from "@/lib/studio/image-provider-resolver-helpers";
import type { ImageProviderId, ImageRequest } from "@/types/studio-json";

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    task,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await withTimeout(fetch(url, init), timeoutMs, url);
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`);
  }
  return await response.json();
}

async function searchPexels(
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  const apiKey = (process.env.PEXELS_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, candidates: [], reason: "PEXELS_API_KEY missing", searchedQueries: [] };
  }
  const queries = buildProviderQueries("pexels", request, options.intent);
  const allCandidates: ProviderCandidate[] = [];
  for (const query of queries) {
    const endpoint = new URL("https://api.pexels.com/v1/search");
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("per_page", String(Math.min(options.maxCandidatesPerProvider, 30)));
    if (request.orientation === "portrait") endpoint.searchParams.set("orientation", "portrait");
    if (request.orientation === "landscape") endpoint.searchParams.set("orientation", "landscape");
    try {
      const payload = (await fetchJson(
        endpoint.toString(),
        {
          method: "GET",
          headers: { Authorization: apiKey },
          cache: "no-store",
        },
        options.providerTimeBudgetMs
      )) as { photos?: Array<Record<string, unknown>> };

      const photos = Array.isArray(payload.photos) ? payload.photos : [];
      const candidates = photos
        .map((photo, index) => {
          const src = photo.src && typeof photo.src === "object" ? (photo.src as Record<string, unknown>) : {};
          const imageUrl =
            (typeof src.large2x === "string" && src.large2x.trim()) ||
            (typeof src.large === "string" && src.large.trim()) ||
            (typeof src.original === "string" && src.original.trim()) ||
            "";
          return {
            provider: "pexels" as const,
            id: `pexels:${String(photo.id || index)}:${query}`,
            url: imageUrl,
            pageUrl: typeof photo.url === "string" ? photo.url : undefined,
            title: typeof photo.alt === "string" ? photo.alt : typeof photo.photographer === "string" ? photo.photographer : undefined,
            width: parsePositiveNumber(photo.width as string | number | undefined),
            height: parsePositiveNumber(photo.height as string | number | undefined),
          };
        })
        .filter((candidate) => candidate.url);
      allCandidates.push(...candidates);
      if (allCandidates.length >= options.maxCandidatesPerProvider) break;
    } catch {
      continue;
    }
  }
  return {
    ok: allCandidates.length > 0,
    candidates: allCandidates.slice(0, options.maxCandidatesPerProvider),
    reason: allCandidates.length > 0 ? undefined : "pexels empty",
    searchedQueries: queries,
  };
}

async function searchPixabay(
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  const apiKey = (process.env.PIXABAY_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, candidates: [], reason: "PIXABAY_API_KEY missing", searchedQueries: [] };
  }
  const queries = buildProviderQueries("pixabay", request, options.intent);
  const allCandidates: ProviderCandidate[] = [];
  for (const query of queries) {
    const endpoint = new URL("https://pixabay.com/api/");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("image_type", "photo");
    endpoint.searchParams.set("per_page", String(Math.min(options.maxCandidatesPerProvider, 50)));
    endpoint.searchParams.set("safesearch", "true");
    endpoint.searchParams.set("lang", "ko");
    if (request.orientation === "portrait") endpoint.searchParams.set("orientation", "vertical");
    if (request.orientation === "landscape") endpoint.searchParams.set("orientation", "horizontal");
    try {
      const payload = (await fetchJson(
        endpoint.toString(),
        {
          method: "GET",
          cache: "no-store",
        },
        options.providerTimeBudgetMs
      )) as { hits?: Array<Record<string, unknown>> };
      const hits = Array.isArray(payload.hits) ? payload.hits : [];
      const candidates = hits
        .map((hit, index) => ({
          provider: "pixabay" as const,
          id: `pixabay:${String(hit.id || index)}:${query}`,
          url:
            (typeof hit.largeImageURL === "string" && hit.largeImageURL.trim()) ||
            (typeof hit.webformatURL === "string" && hit.webformatURL.trim()) ||
            "",
          pageUrl: typeof hit.pageURL === "string" ? hit.pageURL : undefined,
          title: typeof hit.tags === "string" ? hit.tags : undefined,
          width: parsePositiveNumber(hit.imageWidth as string | number | undefined),
          height: parsePositiveNumber(hit.imageHeight as string | number | undefined),
        }))
        .filter((candidate) => candidate.url);
      allCandidates.push(...candidates);
      if (allCandidates.length >= options.maxCandidatesPerProvider) break;
    } catch {
      continue;
    }
  }
  return {
    ok: allCandidates.length > 0,
    candidates: allCandidates.slice(0, options.maxCandidatesPerProvider),
    reason: allCandidates.length > 0 ? undefined : "pixabay empty",
    searchedQueries: queries,
  };
}

async function searchOpenverse(
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  const queries = buildProviderQueries("openverse", request, options.intent);
  const allCandidates: ProviderCandidate[] = [];
  for (const query of queries) {
    const endpoint = new URL("https://api.openverse.org/v1/images/");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("page_size", String(Math.min(options.maxCandidatesPerProvider, 20)));
    endpoint.searchParams.set("mature", "false");
    try {
      const payload = (await fetchJson(
        endpoint.toString(),
        {
          method: "GET",
          headers: {
            "User-Agent": "json-shorts-studio/1.0",
          },
          cache: "no-store",
        },
        options.providerTimeBudgetMs
      )) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(payload.results) ? payload.results : [];
      const candidates = results
        .map((item, index) => ({
          provider: "openverse" as const,
          id: `openverse:${String(item.id || index)}:${query}`,
          url:
            (typeof item.url === "string" && item.url.trim()) ||
            (typeof item.thumbnail === "string" && item.thumbnail.trim()) ||
            "",
          pageUrl: typeof item.foreign_landing_url === "string" ? item.foreign_landing_url : undefined,
          title: typeof item.title === "string" ? item.title : undefined,
          width: parsePositiveNumber(item.width as string | number | undefined),
          height: parsePositiveNumber(item.height as string | number | undefined),
        }))
        .filter((candidate) => candidate.url);
      allCandidates.push(...candidates);
      if (allCandidates.length >= options.maxCandidatesPerProvider) break;
    } catch {
      continue;
    }
  }
  return {
    ok: allCandidates.length > 0,
    candidates: allCandidates.slice(0, options.maxCandidatesPerProvider),
    reason: allCandidates.length > 0 ? undefined : "openverse empty",
    searchedQueries: queries,
  };
}

async function searchWikimedia(
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  const queries = buildProviderQueries("wikimedia", request, options.intent);
  const allCandidates: ProviderCandidate[] = [];
  for (const query of queries) {
    const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
    endpoint.searchParams.set("action", "query");
    endpoint.searchParams.set("generator", "search");
    endpoint.searchParams.set("gsrsearch", query);
    endpoint.searchParams.set("gsrnamespace", "6");
    endpoint.searchParams.set("gsrlimit", String(Math.min(options.maxCandidatesPerProvider, 20)));
    endpoint.searchParams.set("prop", "imageinfo|info");
    endpoint.searchParams.set("iiprop", "url|size");
    endpoint.searchParams.set("iiurlwidth", "1600");
    endpoint.searchParams.set("inprop", "url");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("origin", "*");
    try {
      const payload = (await fetchJson(
        endpoint.toString(),
        {
          method: "GET",
          cache: "no-store",
        },
        options.providerTimeBudgetMs
      )) as { query?: { pages?: Record<string, Record<string, unknown>> } };
      const pages = payload.query?.pages || {};
      const candidates = Object.values(pages)
        .map((page, index) => {
          const imageInfo = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as Record<string, unknown> | undefined) : undefined;
          const title = typeof page.title === "string" ? page.title.replace(/^File:/, "") : undefined;
          const imageUrl =
            (imageInfo && typeof imageInfo.thumburl === "string" && imageInfo.thumburl.trim()) ||
            (imageInfo && typeof imageInfo.url === "string" && imageInfo.url.trim()) ||
            "";
          return {
            provider: "wikimedia" as const,
            id: `wikimedia:${String(page.pageid || index)}:${query}`,
            url: imageUrl,
            pageUrl: typeof page.fullurl === "string" ? page.fullurl : undefined,
            title,
            width:
              parsePositiveNumber(imageInfo?.thumbwidth as string | number | undefined) ||
              parsePositiveNumber(imageInfo?.width as string | number | undefined),
            height:
              parsePositiveNumber(imageInfo?.thumbheight as string | number | undefined) ||
              parsePositiveNumber(imageInfo?.height as string | number | undefined),
          };
        })
        .filter((candidate) => candidate.url);
      allCandidates.push(...candidates);
      if (allCandidates.length >= options.maxCandidatesPerProvider) break;
    } catch {
      continue;
    }
  }
  return {
    ok: allCandidates.length > 0,
    candidates: allCandidates.slice(0, options.maxCandidatesPerProvider),
    reason: allCandidates.length > 0 ? undefined : "wikimedia empty",
    searchedQueries: queries,
  };
}

async function searchLibrary(
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  const items = await searchMemeLibrary(request, {
    limit: Math.min(options.maxCandidatesPerProvider, 12),
    userScope: options.libraryUserScope,
  });
  const candidates = items.map((item) => ({
    provider: "library" as const,
    id: item.id,
    url: item.url,
    mediaUrl: item.mediaUrl,
    mediaKind: item.mediaKind,
    pageUrl: item.pageUrl,
    title: item.title,
    width: item.width,
    height: item.height,
  }));
  return {
    ok: candidates.length > 0,
    candidates,
    reason: candidates.length > 0 ? undefined : "personal library empty",
    searchedQueries: [request.query, ...(request.queryCandidates || [])].filter(Boolean).slice(0, 4),
  };
}

export async function runProviderSearch(
  provider: ImageProviderId,
  request: ImageRequest,
  options: ProviderSearchOptions
): Promise<ProviderAdapterResult> {
  if (provider === "library") return searchLibrary(request, options);
  if (provider === "pexels") return searchPexels(request, options);
  if (provider === "pixabay") return searchPixabay(request, options);
  if (provider === "openverse") return searchOpenverse(request, options);
  if (provider === "wikimedia") return searchWikimedia(request, options);
  if (provider === "giphy") return searchGiphy(request, { ...options, libraryOnly: options.giphyLibraryOnly === true });
  return { ok: false, candidates: [], reason: "unsupported adapter" };
}
