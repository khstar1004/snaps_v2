"use client";

import { useMemo } from "react";
import { getChannelColor, hexToRgba } from "@/lib/ui/channel-colors";
import type { PublishAccountSummary } from "@/lib/publish/client-types";

type PublishChannelSelectorProps = {
  accounts: PublishAccountSummary[];
  channelSearch: string;
  selectedChannelId: string;
  effectiveChannelId: string;
  effectiveChannelTitle: string;
  channelColors: Record<string, string>;
  disabled?: boolean;
  onChannelSearchChangeAction: (value: string) => void;
  onUseCategoryDefaultAction: () => void;
  onSelectChannelAction: (channelId: string) => void;
};

export function PublishChannelSelector({
  accounts,
  channelSearch,
  selectedChannelId,
  effectiveChannelId,
  effectiveChannelTitle,
  channelColors,
  disabled = false,
  onChannelSearchChangeAction,
  onUseCategoryDefaultAction,
  onSelectChannelAction,
}: PublishChannelSelectorProps) {
  const searchInputId = "publish-channel-search";
  const filteredAccounts = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((item) => item.channelTitle.toLowerCase().includes(query) || item.channelId.toLowerCase().includes(query));
  }, [accounts, channelSearch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label htmlFor={searchInputId} style={{ fontWeight: 600 }}>대상 채널</label>
      <input
        id={searchInputId}
        className="input-field"
        value={channelSearch}
        onChange={(event) => onChannelSearchChangeAction(event.target.value)}
        placeholder="채널명 또는 채널 ID 검색"
        disabled={disabled}
      />
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onUseCategoryDefaultAction}
          disabled={disabled || !selectedChannelId}
          style={{ fontSize: "0.75rem", padding: "4px 8px" }}
        >
          프로필 기본 채널
        </button>
        {filteredAccounts.map((account) => {
          const color = getChannelColor(account.channelId, channelColors);
          return (
            <button
              key={account.channelId}
              type="button"
              className={selectedChannelId === account.channelId ? "btn-primary" : "btn-secondary"}
              onClick={() => onSelectChannelAction(account.channelId)}
              disabled={disabled}
              style={{
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderColor: selectedChannelId === account.channelId ? color : hexToRgba(color, 0.4),
                background: selectedChannelId === account.channelId ? color : hexToRgba(color, 0.1),
                color: selectedChannelId === account.channelId ? "#fff" : "var(--text-primary)",
              }}
            >
              {account.channelTitle}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        현재 대상:{" "}
        {effectiveChannelId ? (
          <span style={{ color: getChannelColor(effectiveChannelId, channelColors), fontWeight: 600 }}>
            {effectiveChannelTitle ? `${effectiveChannelTitle} (${effectiveChannelId})` : effectiveChannelId}
          </span>
        ) : (
          "선택 안 됨"
        )}
      </div>
    </div>
  );
}
