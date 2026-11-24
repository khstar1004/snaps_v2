export type OAuthAccount = {
  userId?: string;
  platform: "youtube";
  channelId: string;
  channelTitle: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
};

export type PublishCategory = string;

export type PublishJobStatus = "pending" | "processing" | "published" | "failed" | "canceled";

export type PublishJobRecord = {
  userId?: string;
  id: string;
  platform: "youtube";
  channelId: string;
  publishCategory?: PublishCategory;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  visibility: "private" | "public" | "unlisted";
  scheduledAt: number | null;
  status: PublishJobStatus;
  attempts: number;
  lastError: string | null;
  platformPostId: string | null;
  publishedUrl: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
};

export type VideoAssetRecord = {
  userId?: string;
  id: string;
  title: string;
  url: string;
  publishCategory?: PublishCategory;
  sizeBytes: number;
  mimeType: string;
  storageBucket?: string;
  storagePath?: string;
  createdAt: number;
  deletedAt?: number | null;
};
