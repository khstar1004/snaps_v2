"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStudioBootstrap,
  refreshStudioCategoryMetadata,
} from "@/lib/api/studio-client";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import { normalizeCategory, toCategoryLabel } from "@/lib/publish/categories";
import type { PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";
import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import { dedupeStudioVoiceOptionsById } from "./studio-manual-voice-options";

export type StudioVoiceOption = {
  id: string;
  label: string;
  provider?: "typecast";
  source?: "asset" | "runtime" | "builtin" | "manual";
  description?: string;
  previewText?: string;
};

export type StudioCodexModelOption = {
  id: string;
  label: string;
  description?: string;
};

type CategoryOption = {
  value: PublishCategory;
  label: string;
};

type UseStudioBootstrapDataArgs<TBranding> = {
  defaultCategoryOptions: CategoryOption[];
  defaultBrandingByCategory: Record<PublishCategory, TBranding>;
  toTemplateBranding: (input: TemplateBrandingSettings) => TBranding;
};

type UseStudioBootstrapDataResult<TBranding> = {
  codexOauthConnected: boolean;
  codexStatusLoaded: boolean;
  codexOauthMode: "oauth" | "local_codex_bridge";
  codexLocalReady: boolean;
  publishAccounts: NonNullable<PublishJobsResponse["accounts"]>;
  categoryChannels: Partial<Record<PublishCategory, string>>;
  categoryOptions: CategoryOption[];
  categoryMetadataMap: Record<PublishCategory, PublishMetadata>;
  workspacePermissions: WorkspacePermissionsSummary | null;
  categoryBrandingMap: Record<PublishCategory, TBranding>;
  defaultTtsProvider: "typecast";
  voiceOptions: StudioVoiceOption[];
  codexModelOptions: StudioCodexModelOption[];
  defaultCodexModel: string;
  markCodexOauthDisconnected: () => void;
  updateCategoryMetadata: (category: PublishCategory, metadata: PublishMetadata) => void;
  refreshCategoryMetadata: (category: PublishCategory) => Promise<PublishMetadata>;
};

export function useStudioBootstrapData<TBranding>({
  defaultCategoryOptions,
  defaultBrandingByCategory,
  toTemplateBranding,
}: UseStudioBootstrapDataArgs<TBranding>): UseStudioBootstrapDataResult<TBranding> {
  const [codexOauthConnected, setCodexOauthConnected] = useState(false);
  const [codexStatusLoaded, setCodexStatusLoaded] = useState(false);
  const [codexOauthMode, setCodexOauthMode] = useState<"oauth" | "local_codex_bridge">("oauth");
  const [codexLocalReady, setCodexLocalReady] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: PublishCategory; label: string }>>(defaultCategoryOptions);
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsSummary | null>(null);
  const [publishAccounts, setPublishAccounts] = useState<NonNullable<PublishJobsResponse["accounts"]>>([]);
  const [categoryChannels, setCategoryChannels] = useState<Partial<Record<PublishCategory, string>>>({});
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<Record<PublishCategory, PublishMetadata>>({} as Record<PublishCategory, PublishMetadata>);
  const [categoryBrandingMap, setCategoryBrandingMap] = useState<Record<PublishCategory, TBranding>>(defaultBrandingByCategory);
  const [defaultTtsProvider, setDefaultTtsProvider] = useState<"typecast">("typecast");
  const [voiceOptions, setVoiceOptions] = useState<StudioVoiceOption[]>([]);
  const [codexModelOptions, setCodexModelOptions] = useState<StudioCodexModelOption[]>([]);
  const [defaultCodexModel, setDefaultCodexModel] = useState("");
  const bootstrapLoadedRef = useRef(false);
  const metadataRefreshRequestsRef = useRef(
    new Map<PublishCategory, Promise<PublishMetadata>>()
  );

  const updateCategoryMetadata = useCallback((category: PublishCategory, metadata: PublishMetadata) => {
    setCategoryMetadataMap((current) => ({
      ...current,
      [category]: metadata,
    }));
  }, []);

  const refreshCategoryMetadata = useCallback(
    async (category: PublishCategory): Promise<PublishMetadata> => {
      const activeRequest = metadataRefreshRequestsRef.current.get(category);
      if (activeRequest) return activeRequest;
      const request = (async () => {
        const data = await refreshStudioCategoryMetadata(category, "default");
        if (!data.metadata) {
          throw new Error("콘텐츠 프로필 최신 기본값 응답이 올바르지 않습니다.");
        }
        updateCategoryMetadata(category, data.metadata);
        return data.metadata;
      })();
      metadataRefreshRequestsRef.current.set(category, request);
      try {
        return await request;
      } finally {
        if (metadataRefreshRequestsRef.current.get(category) === request) {
          metadataRefreshRequestsRef.current.delete(category);
        }
      }
    },
    [updateCategoryMetadata]
  );

  useEffect(() => {
    if (bootstrapLoadedRef.current) return;
    bootstrapLoadedRef.current = true;
    const loadBootstrap = async () => {
      try {
        const data = await fetchStudioBootstrap();
        setCodexOauthConnected(Boolean(data.codexStatus.connected));
        setCodexOauthMode(data.codexStatus.mode === "local_codex_bridge" ? "local_codex_bridge" : "oauth");
        setCodexLocalReady(Boolean(data.codexStatus.localReady));
        setPublishAccounts(data.workspace.accounts);
        setCategoryChannels(data.workspace.categoryChannels);
        setCategoryMetadataMap((current) => ({
          ...data.workspace.categoryMetadataMap,
          ...current,
        }));
        setWorkspacePermissions(data.workspace.workspacePermissions || null);
        if (data.workspace.categoryOptions.length > 0) {
          setCategoryOptions(data.workspace.categoryOptions.map((item) => ({ value: item.key, label: item.label })));
        }
        if (data.brandingData.categoryBranding) {
          const nextMap: Record<PublishCategory, TBranding> = { ...defaultBrandingByCategory };
          for (const [category, branding] of Object.entries(data.brandingData.categoryBranding)) {
            nextMap[category] = toTemplateBranding(branding);
          }
          setCategoryBrandingMap(nextMap);
          setCategoryOptions((prev) => {
            const merged = new Map<PublishCategory, string>(prev.map((item) => [item.value, item.label]));
            for (const key of Object.keys(nextMap)) {
              const safe = normalizeCategory(key);
              if (safe && !merged.has(safe)) merged.set(safe, toCategoryLabel(safe));
            }
            for (const key of Object.keys(data.workspace.categoryChannels || {})) {
              const safe = normalizeCategory(key);
              if (safe && !merged.has(safe)) merged.set(safe, toCategoryLabel(safe));
            }
            return Array.from(merged.entries()).map(([value, label]) => ({ value, label }));
          });
        }
        setDefaultTtsProvider("typecast");
        const voices = Array.isArray(data.voices.voices)
          ? dedupeStudioVoiceOptionsById(data.voices.voices.filter((item) => item.id.trim()))
          : [];
        setVoiceOptions(voices);
        const models = Array.isArray(data.codexModels.models) ? data.codexModels.models.filter((item) => item.id.trim()) : [];
        setCodexModelOptions(models);
        setDefaultCodexModel(typeof data.codexModels.defaultModel === "string" ? data.codexModels.defaultModel.trim() : "");
      } catch {
        setCodexOauthConnected(false);
        setPublishAccounts([]);
        setDefaultTtsProvider("typecast");
        setVoiceOptions([]);
        setCodexModelOptions([]);
        setDefaultCodexModel("");
      } finally {
        setCodexStatusLoaded(true);
      }
    };
    void loadBootstrap();
  }, [defaultBrandingByCategory, toTemplateBranding]);

  return {
    codexOauthConnected,
    codexStatusLoaded,
    codexOauthMode,
    codexLocalReady,
    publishAccounts,
    categoryChannels,
    categoryOptions,
    categoryMetadataMap,
    workspacePermissions,
    categoryBrandingMap,
    defaultTtsProvider,
    voiceOptions,
    codexModelOptions,
    defaultCodexModel,
    markCodexOauthDisconnected: () => {
      setCodexOauthConnected(false);
    },
    updateCategoryMetadata,
    refreshCategoryMetadata,
  };
}
