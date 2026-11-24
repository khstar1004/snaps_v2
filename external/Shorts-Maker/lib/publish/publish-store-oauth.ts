import type { OAuthAccount } from "@/lib/publish/types";
import {
  selectSupabaseRows,
  updateSupabaseRows,
  upsertSupabaseRows,
} from "@/lib/supabase/server";

export type YoutubeAccountRow = {
  user_id: string;
  platform: "youtube";
  channel_id: string;
  channel_title: string;
  access_token: string;
  refresh_token: string;
  expiry_date_ms: number;
  scope: string;
  created_at_ms: number;
  updated_at_ms: number;
};

type PublishStoreOAuthServiceDeps = {
  selectSupabaseRows: typeof selectSupabaseRows;
  updateSupabaseRows: typeof updateSupabaseRows;
  upsertSupabaseRows: typeof upsertSupabaseRows;
};

export type PublishStoreOAuthService = {
  listYoutubeAccounts(userId: string): Promise<OAuthAccount[]>;
  getYoutubeAccount(userId: string, channelId?: string): Promise<OAuthAccount | null>;
  upsertYoutubeAccount(userId: string, account: OAuthAccount): Promise<OAuthAccount>;
  refreshYoutubeAccountToken(input: {
    userId: string;
    channelId: string;
    accessToken: string;
    expiryDate: number;
  }): Promise<OAuthAccount | null>;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toOAuthAccount(row: YoutubeAccountRow): OAuthAccount {
  return {
    userId: row.user_id,
    platform: "youtube",
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiryDate: row.expiry_date_ms,
    scope: row.scope,
  };
}

function createPublishStoreOAuthService(deps: Partial<PublishStoreOAuthServiceDeps> = {}): PublishStoreOAuthService {
  const oauthDeps: PublishStoreOAuthServiceDeps = {
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    updateSupabaseRows: deps.updateSupabaseRows || updateSupabaseRows,
    upsertSupabaseRows: deps.upsertSupabaseRows || upsertSupabaseRows,
  };

  async function getYoutubeAccountRow(userId: string, channelId: string): Promise<YoutubeAccountRow | null> {
    const safeChannelId = channelId.trim();
    if (!safeChannelId) return null;
    const rows = await oauthDeps.selectSupabaseRows<YoutubeAccountRow>("youtube_accounts", {
      filters: {
        user_id: normalizeUserScope(userId),
        channel_id: safeChannelId,
      },
      limit: 1,
    });
    return rows[0] || null;
  }

  async function listYoutubeAccountRows(userId: string, limit = 100): Promise<YoutubeAccountRow[]> {
    return oauthDeps.selectSupabaseRows<YoutubeAccountRow>("youtube_accounts", {
      filters: {
        user_id: normalizeUserScope(userId),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(5000, Math.floor(limit))),
    });
  }

  async function listYoutubeAccounts(userId: string): Promise<OAuthAccount[]> {
    const rows = await listYoutubeAccountRows(userId, 100);
    return rows.map(toOAuthAccount);
  }

  async function getYoutubeAccount(userId: string, channelId?: string): Promise<OAuthAccount | null> {
    const safeChannelId = channelId?.trim() || "";
    if (safeChannelId) {
      const row = await getYoutubeAccountRow(userId, safeChannelId);
      return row ? toOAuthAccount(row) : null;
    }
    const rows = await listYoutubeAccountRows(userId, 1);
    return rows[0] ? toOAuthAccount(rows[0]) : null;
  }

  async function upsertYoutubeAccount(userId: string, account: OAuthAccount): Promise<OAuthAccount> {
    const existing = await getYoutubeAccountRow(userId, account.channelId);
    const now = Date.now();
    const row: YoutubeAccountRow = {
      user_id: normalizeUserScope(userId),
      platform: "youtube",
      channel_id: account.channelId.trim(),
      channel_title: account.channelTitle.trim(),
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date_ms: account.expiryDate,
      scope: safeTrim(account.scope),
      created_at_ms: existing?.created_at_ms || now,
      updated_at_ms: now,
    };
    const upserted = await oauthDeps.upsertSupabaseRows<YoutubeAccountRow>("youtube_accounts", [row], {
      onConflict: ["user_id", "channel_id"],
    });
    return toOAuthAccount(upserted[0] || row);
  }

  async function refreshYoutubeAccountToken(input: {
    userId: string;
    channelId: string;
    accessToken: string;
    expiryDate: number;
  }): Promise<OAuthAccount | null> {
    const existing = await getYoutubeAccountRow(input.userId, input.channelId);
    if (!existing) return null;
    const updated = await oauthDeps.updateSupabaseRows<YoutubeAccountRow>(
      "youtube_accounts",
      {
        user_id: normalizeUserScope(input.userId),
        channel_id: input.channelId.trim(),
      },
      {
        access_token: input.accessToken,
        expiry_date_ms: input.expiryDate,
        updated_at_ms: Date.now(),
      }
    );
    return toOAuthAccount(updated[0] || { ...existing, access_token: input.accessToken, expiry_date_ms: input.expiryDate });
  }

  return {
    listYoutubeAccounts,
    getYoutubeAccount,
    upsertYoutubeAccount,
    refreshYoutubeAccountToken,
  };
}

const publishStoreOAuthService = createPublishStoreOAuthService();

export {
  createPublishStoreOAuthService,
  publishStoreOAuthService,
  publishStoreOAuthService as defaultPublishStoreOAuthService,
};

export const listYoutubeAccounts = publishStoreOAuthService.listYoutubeAccounts;
export const getYoutubeAccount = publishStoreOAuthService.getYoutubeAccount;
export const upsertYoutubeAccount = publishStoreOAuthService.upsertYoutubeAccount;
export const refreshYoutubeAccountToken = publishStoreOAuthService.refreshYoutubeAccountToken;
