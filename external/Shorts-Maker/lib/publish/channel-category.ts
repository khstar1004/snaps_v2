import type { PublishCategory } from "@/lib/publish/types";

const ENV_BY_CATEGORY: Partial<Record<PublishCategory, string>> = {
  conservative: "PUBLISH_CHANNEL_ID_CONSERVATIVE",
  progressive: "PUBLISH_CHANNEL_ID_PROGRESSIVE",
};

export function resolveCategoryChannelId(category?: PublishCategory): { channelId: string | null; envKey: string | null } {
  if (!category) {
    return { channelId: null, envKey: null };
  }
  const envKey = ENV_BY_CATEGORY[category];
  if (!envKey) {
    return { channelId: null, envKey: null };
  }
  const channelId = process.env[envKey]?.trim() || "";
  return {
    channelId: channelId || null,
    envKey,
  };
}
