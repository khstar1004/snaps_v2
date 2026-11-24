import type { VisualIntent } from "@/lib/studio/images/intent";
import type { ImageRequest, StudioPrepareRequest } from "@/types/studio-json";

export function resolveEffectiveIntent(
  inferredIntent: VisualIntent,
  request?: Pick<ImageRequest, "preferredProviders">,
  crawlMode?: StudioPrepareRequest["crawlMode"]
): VisualIntent {
  const preferredPrimaryProvider = request?.preferredProviders?.[0];
  if (preferredPrimaryProvider === "naver") {
    return {
      ...inferredIntent,
      searchIntent: "news",
    };
  }
  if (preferredPrimaryProvider === "giphy") {
    return {
      ...inferredIntent,
      searchIntent: "meme",
    };
  }
  return inferredIntent;
}
