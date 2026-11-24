import { NextRequest, NextResponse } from "next/server";
import {
  canManageWorkspace,
  filterCategoriesByAccess,
  filterCategoryMapByAccess,
  getCategoryAccessScope,
  toWorkspacePermissionsSummary,
} from "@/lib/auth/category-permissions";
import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode } from "@/lib/auth/codex-bridge";
import { getLocalCodexAuthState } from "@/lib/auth/codex-local";
import { getLocalCodexTokens } from "@/lib/auth/codex-local";
import { getLocalCodexModelCatalog } from "@/lib/auth/codex-models";
import { requireAuthenticatedSessionUser, requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { listDefaultTemplateBrandings, getDefaultTemplateBranding, type TemplateBrandingSettings } from "@/lib/publish/template-branding";
import { type PublishMetadata } from "@/lib/publish/category-metadata";
import {
  listGlobalPublishCategoryBrandings,
  listGlobalPublishCategoryMetadata,
  listGlobalPublishCustomers,
  listPublishCategories,
  listPublishCategoryBrandings,
  listPublishCategoryChannels,
  listPublishCategoryMetadata,
  listPublishJobs,
  listYoutubeAccounts,
  repairPublishCategoriesFromChannels,
} from "@/lib/publish/publish-store";
import { toCategoryLabel } from "@/lib/publish/categories";
import { filterStudioBootstrapVoiceOptions } from "@/lib/studio/bootstrap-voice-options";
import { fetchStudioTtsRuntimeSnapshot, getStudioTtsSettings, listStudioVoiceOptions } from "@/lib/studio/tts-config";
import { type PublishWorkspaceSnapshot } from "@/lib/api/publish-workspace-client";
import type { WorkspaceSessionUser } from "@/lib/auth/types";
import type { PublishCategory } from "@/lib/publish/types";
import type { SessionUser } from "@/lib/auth/types";
import type { StudioCodexModelsResponse } from "@/lib/studio/codex-contract";
import { type StudioTemplateId } from "@/types/studio-template";
import { buildStudioBootstrapMetadataMap } from "@/lib/studio/bootstrap-metadata";

export const runtime = "nodejs";

const CODEX_OAUTH_ACCESS_TOKEN_COOKIE = "codex_oauth_access_token";
const DEFAULT_TEMPLATE_ID: StudioTemplateId = "default";

function mergeBrandingWithDefault(category: PublishCategory, input?: TemplateBrandingSettings | null): TemplateBrandingSettings {
  const base = getDefaultTemplateBranding(category);
  if (!input) return base;
  return {
    headerTitle: input.headerTitle,
    headerAccentText: input.headerAccentText ?? base.headerAccentText,
    headerColor: input.headerColor || base.headerColor,
    footerColor: input.footerColor || base.footerColor,
    infoLineText: input.infoLineText || base.infoLineText,
    fontFamily: input.fontFamily || base.fontFamily,
    imageRounded: typeof input.imageRounded === "boolean" ? input.imageRounded : base.imageRounded,
  };
}

async function buildWorkspaceSnapshot(
  authUser: SessionUser,
  user: WorkspaceSessionUser
): Promise<{
  workspace: PublishWorkspaceSnapshot;
  brandingData: {
    ok: true;
    categoryBranding: Record<PublishCategory, TemplateBrandingSettings>;
    customCategoryBranding: Partial<Record<PublishCategory, TemplateBrandingSettings>>;
  };
}> {
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });

  if (authUser.role !== "admin" && canManageWorkspace(scope)) {
    await repairPublishCategoriesFromChannels(user.id);
  }

  const categoryChannels = filterCategoryMapByAccess(await listPublishCategoryChannels(user.id), scope);
  const jobs = filterCategoriesByAccess(await listPublishJobs(user.id, 100), scope, (item) => item.publishCategory);
  const accessibleChannelIds = new Set<string>();
  for (const value of Object.values(categoryChannels)) {
    const channelId = typeof value === "string" ? value.trim() : "";
    if (channelId) accessibleChannelIds.add(channelId);
  }
  for (const job of jobs) {
    const channelId = typeof job.channelId === "string" ? job.channelId.trim() : "";
    if (channelId) accessibleChannelIds.add(channelId);
  }

  const accounts = scope.hasRestrictions
    ? (await listYoutubeAccounts(user.id)).filter((account) => accessibleChannelIds.has(account.channelId))
    : await listYoutubeAccounts(user.id);

  const categories = filterCategoriesByAccess(
    authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id),
    scope,
    (category) => category
  );

  const storedMetadataMap =
    authUser.role === "admin"
      ? await listGlobalPublishCategoryMetadata(DEFAULT_TEMPLATE_ID)
      : await listPublishCategoryMetadata(user.id, DEFAULT_TEMPLATE_ID);
  const mergedMetadata = buildStudioBootstrapMetadataMap({
    categories,
    storedMetadataMap,
  });

  const defaultBrandings = listDefaultTemplateBrandings();
  const customBrandings =
    authUser.role === "admin" ? await listGlobalPublishCategoryBrandings() : await listPublishCategoryBrandings(user.id);
  const mergedBrandings: Record<PublishCategory, TemplateBrandingSettings> = {} as Record<PublishCategory, TemplateBrandingSettings>;
  for (const [category, branding] of Object.entries(defaultBrandings) as Array<[PublishCategory, TemplateBrandingSettings]>) {
    mergedBrandings[category] = mergeBrandingWithDefault(category, branding);
  }
  for (const [category, branding] of Object.entries(customBrandings) as Array<[PublishCategory, TemplateBrandingSettings]>) {
    mergedBrandings[category] = mergeBrandingWithDefault(category, branding);
  }

  return {
    workspace: {
      accounts,
      jobs,
      categoryChannels,
      categoryMetadataMap: filterCategoryMapByAccess(mergedMetadata, scope),
      categoryOptions: categories.map((category) => ({
        key: category,
        label: toCategoryLabel(category),
      })),
      workspacePermissions: toWorkspacePermissionsSummary(scope),
    },
    brandingData: {
      ok: true,
      categoryBranding: filterCategoryMapByAccess(mergedBrandings, scope),
      customCategoryBranding: filterCategoryMapByAccess(customBrandings, scope),
    },
  };
}

async function buildCodexStatus(request: NextRequest) {
  const localReady = isCodexLocalBridgeEnabled() ? Boolean(await getLocalCodexTokens()) : false;
  const connected = Boolean(request.cookies.get(CODEX_OAUTH_ACCESS_TOKEN_COOKIE)?.value?.trim()) || localReady;
  const mode = resolveCodexConnectionMode();
  return { ok: true, connected, mode, localReady };
}

async function buildCodexModels(): Promise<StudioCodexModelsResponse> {
  const mode = resolveCodexConnectionMode();
  const auth = await getLocalCodexAuthState();
  const localBridgeActive = mode === "local_codex_bridge" && isCodexLocalBridgeEnabled();
  const catalog = localBridgeActive ? await getLocalCodexModelCatalog() : { defaultModel: "", models: [] };
  return {
    ok: true,
    mode,
    localReady: auth.ready,
    transport: auth.transport,
    upstreamTransport: auth.upstreamTransport,
    usesSse: auth.usesSse,
    authSource: auth.source,
    defaultModel: catalog.defaultModel,
    models: catalog.models,
    auth,
  };
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;

  const [workspaceResult, codexStatus, codexModels, ttsSettings] = await Promise.all([
    buildWorkspaceSnapshot(authUser, user),
    buildCodexStatus(request),
    buildCodexModels(),
    getStudioTtsSettings(),
  ]);
  const ttsRuntime = await fetchStudioTtsRuntimeSnapshot(ttsSettings);
  const voiceOptions = filterStudioBootstrapVoiceOptions(
    await listStudioVoiceOptions(ttsSettings, ttsRuntime),
    ttsSettings.defaultVoiceId,
    ttsSettings.typecast.defaultVoiceId
  );

  return NextResponse.json({
    ok: true,
    codexStatus,
    workspace: workspaceResult.workspace,
    brandingData: workspaceResult.brandingData,
    voices: {
      ok: true,
      defaultProvider: ttsSettings.defaultProvider,
      voices: voiceOptions,
    },
    codexModels,
  });
}
