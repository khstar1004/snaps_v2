import { normalizeStudioImageProxyUpstreamUrl, parseStudioImageProxyTarget } from "./image-proxy-shared";
import type { SlideMediaKind } from "../../types/studio-json";

function trimUrl(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isStudioImageProxyUrl(rawUrl: string | null | undefined): boolean {
  return Boolean(parseStudioImageProxyTarget(trimUrl(rawUrl)));
}

export function unwrapStudioImageProxyUrl(rawUrl: string | null | undefined): string {
  const url = trimUrl(rawUrl);
  if (!url) return "";
  const proxiedTarget = parseStudioImageProxyTarget(url);
  if (proxiedTarget) return proxiedTarget.toString();
  return normalizeStudioImageProxyUpstreamUrl(url) || url;
}

export function isVideoLikeMediaUrl(rawUrl: string | null | undefined): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(unwrapStudioImageProxyUrl(rawUrl));
}

export function isGifLikeMediaUrl(rawUrl: string | null | undefined): boolean {
  return /\.(gif)(\?|#|$)/i.test(unwrapStudioImageProxyUrl(rawUrl));
}

function isStillImageLikeMediaUrl(rawUrl: string | null | undefined): boolean {
  return /\.(png|jpe?g|webp|avif|bmp|svg)(\?|#|$)/i.test(unwrapStudioImageProxyUrl(rawUrl));
}

export function inferMediaKindFromUrl(rawUrl: string | null | undefined): SlideMediaKind | undefined {
  if (isVideoLikeMediaUrl(rawUrl)) return "video";
  if (isGifLikeMediaUrl(rawUrl)) return "animated_image";
  if (isStillImageLikeMediaUrl(rawUrl)) return "image";
  return undefined;
}

function buildDirectGiphyGifUrl(parsed: URL): string {
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function deriveGiphyGifUrl(rawUrl: string | null | undefined): string {
  const source = unwrapStudioImageProxyUrl(rawUrl);
  if (!source || !/giphy\.com/i.test(source)) return "";
  try {
    const parsed = new URL(source);
    if (/\/giphy\.gif$/i.test(parsed.pathname)) {
      return buildDirectGiphyGifUrl(parsed);
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const mediaIndex = segments.findIndex((segment) => segment === "media");
    if (mediaIndex >= 0 && segments.length >= mediaIndex + 3) {
      const nextPath = `/${[...segments.slice(0, -1), "giphy.gif"].join("/")}`;
      return `${parsed.protocol}//${parsed.host}${nextPath}${parsed.search}${parsed.hash}`;
    }

    const pageMatch = parsed.pathname.match(/\/gifs\/(?:.+-)?([A-Za-z0-9]+)$/i);
    if (pageMatch?.[1]) {
      return `https://media.giphy.com/media/${pageMatch[1]}/giphy.gif`;
    }
  } catch {
    return "";
  }
  return "";
}

export function normalizeStudioMediaUrls(input: {
  imageUrl?: string | null;
  mediaUrl?: string | null;
  mediaKind?: SlideMediaKind;
}): {
  imageUrl?: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
} {
  const imageUrl = unwrapStudioImageProxyUrl(input.imageUrl);
  const mediaUrl = unwrapStudioImageProxyUrl(input.mediaUrl);
  const inferredKind = input.mediaKind || inferMediaKindFromUrl(mediaUrl) || inferMediaKindFromUrl(imageUrl);
  if (inferredKind === "video" || isVideoLikeMediaUrl(mediaUrl) || isVideoLikeMediaUrl(imageUrl)) {
    const nextMediaUrl = isVideoLikeMediaUrl(mediaUrl) ? mediaUrl : isVideoLikeMediaUrl(imageUrl) ? imageUrl : mediaUrl || imageUrl;
    const nextImageUrl = imageUrl || nextMediaUrl;
    return {
      imageUrl: nextImageUrl || undefined,
      mediaUrl: nextMediaUrl || undefined,
      mediaKind: "video",
    };
  }

  const gifUrl =
    (isGifLikeMediaUrl(mediaUrl) ? mediaUrl : "") ||
    (isGifLikeMediaUrl(imageUrl) ? imageUrl : "") ||
    deriveGiphyGifUrl(mediaUrl) ||
    deriveGiphyGifUrl(imageUrl);

  if (gifUrl) {
    return {
      imageUrl: gifUrl,
      mediaUrl: gifUrl,
      mediaKind: "animated_image",
    };
  }

  const nextImageUrl = imageUrl || mediaUrl;
  if (!nextImageUrl) {
    return {
      imageUrl: undefined,
      mediaUrl: undefined,
      mediaKind: undefined,
    };
  }

  return {
    imageUrl: nextImageUrl,
    mediaUrl:
      inferredKind === "animated_image"
        ? mediaUrl || nextImageUrl
        : mediaUrl && mediaUrl !== nextImageUrl
          ? mediaUrl
          : undefined,
    mediaKind: inferredKind,
  };
}

function preserveProxyStillImageUrl(rawUrl: string, normalizedUrl: string): string {
  if (isStudioImageProxyUrl(rawUrl)) return rawUrl;
  return normalizedUrl || rawUrl;
}

function isUnsafeRenderedImageUrl(rawUrl: string): boolean {
  const url = unwrapStudioImageProxyUrl(rawUrl);
  if (!url) return true;
  if (/\.webp(\?|#|$)/i.test(url)) return true;
  return false;
}

function resolveGiphyAnimatedFallback(rawUrl: string): { gifUrl: string; mp4Url: string } | null {
  const source = unwrapStudioImageProxyUrl(rawUrl);
  if (!source || !/giphy\.com/i.test(source) || !/\.webp(\?|#|$)/i.test(source)) return null;
  return {
    gifUrl: source.replace(/\.webp(\?|#|$)/i, ".gif$1"),
    mp4Url: source.replace(/\.webp(\?|#|$)/i, ".mp4$1"),
  };
}

export function inferStudioRenderableMedia(input: {
  imageUrl?: string | null;
  mediaUrl?: string | null;
  mediaKind?: SlideMediaKind;
}): { kind: "image" | "video"; url: string } | null {
  const rawImageUrl = trimUrl(input.imageUrl);
  const rawMediaUrl = trimUrl(input.mediaUrl);
  const resolvedImageUrl = unwrapStudioImageProxyUrl(rawImageUrl);
  const resolvedMediaUrl = unwrapStudioImageProxyUrl(rawMediaUrl);
  const mediaKind = input.mediaKind;

  if (mediaKind === "video" && (resolvedMediaUrl || resolvedImageUrl)) {
    return { kind: "video", url: rawMediaUrl || rawImageUrl || resolvedMediaUrl || resolvedImageUrl };
  }

  if (mediaKind === "animated_image") {
    if (resolvedMediaUrl && isVideoLikeMediaUrl(resolvedMediaUrl)) {
      return { kind: "video", url: rawMediaUrl || resolvedMediaUrl };
    }
    if (resolvedImageUrl && isGifLikeMediaUrl(resolvedImageUrl)) {
      return { kind: "image", url: preserveProxyStillImageUrl(rawImageUrl, resolvedImageUrl) };
    }
    if (resolvedMediaUrl && isGifLikeMediaUrl(resolvedMediaUrl)) {
      return { kind: "image", url: preserveProxyStillImageUrl(rawMediaUrl, resolvedMediaUrl) };
    }
    const giphyFallback = resolveGiphyAnimatedFallback(resolvedMediaUrl) || resolveGiphyAnimatedFallback(resolvedImageUrl);
    if (giphyFallback) {
      return { kind: "image", url: giphyFallback.gifUrl };
    }
    if (resolvedImageUrl && !isUnsafeRenderedImageUrl(resolvedImageUrl)) {
      return { kind: "image", url: preserveProxyStillImageUrl(rawImageUrl, resolvedImageUrl) };
    }
    if (resolvedMediaUrl && !isUnsafeRenderedImageUrl(resolvedMediaUrl)) {
      return { kind: "image", url: preserveProxyStillImageUrl(rawMediaUrl, resolvedMediaUrl) };
    }
    return null;
  }

  if (resolvedImageUrl && isVideoLikeMediaUrl(resolvedImageUrl)) {
    return { kind: "video", url: rawImageUrl || resolvedImageUrl };
  }

  const giphyFallback = resolveGiphyAnimatedFallback(resolvedImageUrl) || resolveGiphyAnimatedFallback(resolvedMediaUrl);
  if (giphyFallback) {
    return { kind: "image", url: giphyFallback.gifUrl };
  }
  if (resolvedImageUrl && !isUnsafeRenderedImageUrl(resolvedImageUrl)) {
    return { kind: "image", url: preserveProxyStillImageUrl(rawImageUrl, resolvedImageUrl) };
  }
  if (resolvedMediaUrl && (mediaKind === "video" || !isUnsafeRenderedImageUrl(resolvedMediaUrl))) {
    return {
      kind: isVideoLikeMediaUrl(resolvedMediaUrl) ? "video" : "image",
      url: isVideoLikeMediaUrl(resolvedMediaUrl)
        ? rawMediaUrl || resolvedMediaUrl
        : preserveProxyStillImageUrl(rawMediaUrl, resolvedMediaUrl),
    };
  }
  return null;
}
