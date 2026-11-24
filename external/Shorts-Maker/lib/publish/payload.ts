import type { PublishCategory } from "@/lib/publish/types";

export type PublishInput = {
  channelId?: string;
  publishCategory?: PublishCategory;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  visibility: "private" | "public" | "unlisted";
  scheduledAt: number | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

export function parsePublishInput(body: unknown): PublishInput {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const videoUrl = asString(row.videoUrl);
  const title = asString(row.title);
  const description = asString(row.description);
  const tags = asStringArray(row.tags);
  const visibilityRaw = asString(row.visibility);
  const scheduledAtRaw = asString(row.scheduledAt);
  const publishCategoryRaw = asString(row.publishCategory);

  if (!videoUrl.startsWith("http://") && !videoUrl.startsWith("https://")) {
    throw new Error("videoUrl must be a valid http/https URL");
  }
  if (!title) {
    throw new Error("title is required");
  }

  const visibility = visibilityRaw === "public" || visibilityRaw === "unlisted" ? visibilityRaw : "private";
  const scheduledAtTs = scheduledAtRaw ? Date.parse(scheduledAtRaw) : Number.NaN;
  const scheduledAt = Number.isFinite(scheduledAtTs) ? scheduledAtTs : null;
  const publishCategory = publishCategoryRaw || undefined;

  return {
    channelId: asString(row.channelId) || undefined,
    publishCategory,
    videoUrl,
    title,
    description,
    tags,
    visibility,
    scheduledAt,
  };
}
