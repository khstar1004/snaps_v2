"use client";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppLayout } from "@/components/AppLayout";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory, toCategoryLabel } from "@/lib/publish/categories";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { requestApi } from "@/lib/ui/api-client";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import {
  canEditWorkspaceCategory,
  getWorkspaceCategoryPermissionLevel,
  toWorkspacePermissionLevelLabel,
} from "@/lib/ui/workspace-permissions";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import {
  normalizeStudioTemplateId,
} from "@/app/shorts-json-studio/types";
import type { StudioTemplateId } from "@/types/studio-template";
import {
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  readStoredStudioDraft,
} from "@/app/shorts-json-studio/storage";
import {
  buildStudioTemplateSampleSlide,
  createStudioTemplateData,
  getStudioTemplateDefinition,
  getTemplateRequirementAlert,
  normalizeStudioTemplateData,
  STUDIO_TEMPLATE_DEFINITIONS,
} from "@/app/shorts-json-studio/components/templates/template-registry";
import {
  cloneEditorHistorySnapshot,
  createCategoryOptionsFromKeys,
  createDefaultCategoryTemplatePreset,
  DEFAULT_BRANDING,
  DEFAULT_CATEGORY,
  type CategoryTemplatePreset,
  type EditorHistorySnapshot,
  formatCustomerOptionLabel,
  isLegacyGenericTemplateImageLayout,
  LAYOUT_STUDIO_RECENT_CUSTOMERS_KEY,
  mergeCategoryOptions,
  normalizeCategoryTemplatePreset,
  normalizeTemplateImageLayout,
  STUDIO_EDITOR_PRESET_KEY,
  serializeTemplateLayoutForEditor,
  type TemplateBranding,
  type TemplateImageLayout,
  toCustomerTemplatePresetKey,
} from "@/app/layout-studio/layout-studio-helpers";
import { useLayoutStudioEditorHistory } from "@/app/layout-studio/layout-studio-history";
import {
  getNextLayoutStudioRecentCustomerKeys,
  hydrateLayoutStudioStoredPreset,
  parseLayoutStudioRecentCustomerKeys,
  serializeLayoutStudioStoredPreset,
} from "@/app/layout-studio/layout-studio-storage";
import {
  buildLayoutStudioCommandActions,
  filterLayoutStudioCommandActions,
} from "@/app/layout-studio/layout-studio-commands";
import { LayoutStudioWorkbenchHeader } from "@/app/layout-studio/layout-studio-workbench-header";
import { LayoutStudioWorkbenchContextBar } from "@/app/layout-studio/layout-studio-workbench-context-bar";
import {
  LayoutStudioWorkbenchSidebar,
  type LayoutStudioWorkbenchSidebarTab,
} from "@/app/layout-studio/layout-studio-workbench-sidebar";
import { LayoutStudioWorkbenchCanvasPane } from "@/app/layout-studio/layout-studio-workbench-canvas-pane";
import { type DragContext, type EditableRectSlotKey } from "@/app/layout-studio/layout-studio-interactions";
import {
  buildLayoutStudioInspectorVisibility,
  DEFAULT_COLLAPSED_INSPECTOR_SECTIONS,
  isLayoutStudioInspectorSectionVisible,
  setLayoutStudioInspectorSectionsCollapsed,
  toggleLayoutStudioInspectorSection,
  type InspectorSectionKey,
  type InspectorTabKey,
} from "@/app/layout-studio/layout-studio-inspector";
import {
  buildLayoutStudioWorkbenchStyle,
  createPanelResizeContext,
  createStagePanContext,
  DEFAULT_CANVAS_ZOOM,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  getCenteredStageViewportScroll,
  getNextCanvasZoom,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type PanelResizeContext,
  type PanelResizeSide,
  resolvePanelResizeWidth,
  resolveStagePanScroll,
  type StagePanContext,
} from "@/app/layout-studio/layout-studio-workbench";
import { LayoutStudioWorkbenchInspector } from "@/app/layout-studio/layout-studio-workbench-inspector";
import { useLayoutStudioTemplateEditor } from "@/app/layout-studio/layout-studio-template-editor";

type CategoryBrandingResponse = {
  ok: boolean;
  categoryBranding?: Record<PublishCategory, TemplateBranding>;
  branding?: TemplateBranding;
  error?: string;
};

type CategoryMetadataResponse = {
  ok: boolean;
  categoryMetadata?: Record<PublishCategory, PublishMetadata>;
  metadata?: PublishMetadata;
  error?: string;
};

type CategoriesResponse = {
  ok: boolean;
  categories?: Array<{ key: PublishCategory; label: string }>;
  workspacePermissions?: WorkspacePermissionsSummary;
};

type CategoryChannelsResponse = {
  ok: boolean;
  categoryChannels?: Partial<Record<PublishCategory, string>>;
  error?: string;
};

const LAYOUT_STUDIO_TEMPLATE_OPTIONS = [
  STUDIO_TEMPLATE_DEFINITIONS.default,
  STUDIO_TEMPLATE_DEFINITIONS.black,
  STUDIO_TEMPLATE_DEFINITIONS["fun-caption"],
];

function isEditableTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (target.isContentEditable) return true;
  return tag === "input" || tag === "textarea" || tag === "select";
}

function LayoutStudioPageContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasPendingPresetChanges, setHasPendingPresetChanges] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<LayoutStudioWorkbenchSidebarTab>("branding");
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTabKey>("element");
  const [inspectorSearchQuery, setInspectorSearchQuery] = useState("");
  const [collapsedInspectorSections, setCollapsedInspectorSections] = useState<Record<InspectorSectionKey, boolean>>(DEFAULT_COLLAPSED_INSPECTOR_SECTIONS);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showShortcutGuide, setShowShortcutGuide] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [isHandToolPressed, setIsHandToolPressed] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ key: PublishCategory; label: string }>>(DEFAULT_PUBLISH_CATEGORY_OPTIONS);
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsSummary | null>(null);
  const [publishCategory, setPublishCategory] = useState<PublishCategory>(DEFAULT_CATEGORY);
  const [customerPickerValue, setCustomerPickerValue] = useState(DEFAULT_CATEGORY);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [recentCustomerKeys, setRecentCustomerKeys] = useState<PublishCategory[]>([]);
  const [brandingDraft, setBrandingDraft] = useState<TemplateBranding>(DEFAULT_BRANDING);
  const [selectedRectSlot, setSelectedRectSlot] = useState<EditableRectSlotKey>("titleSlot");
  const [rectNudgeStep, setRectNudgeStep] = useState(0.005);
  const [templateNotesByCategory, setTemplateNotesByCategory] = useState<Record<PublishCategory, string>>({});
  const [templatePresetByCategory, setTemplatePresetByCategory] = useState<Record<PublishCategory, CategoryTemplatePreset>>({
    [DEFAULT_CATEGORY]: createDefaultCategoryTemplatePreset(),
  });
  const [localPresetTemplateKeys, setLocalPresetTemplateKeys] = useState<Record<string, boolean>>({});
  const [contextSlides, setContextSlides] = useState<PreparedSlide[]>([]);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const inspectorSearchInputRef = useRef<HTMLInputElement | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const dragContextRef = useRef<DragContext | null>(null);
  const panelResizeRef = useRef<PanelResizeContext | null>(null);
  const stagePanRef = useRef<StagePanContext | null>(null);
  const isApplyingHistoryRef = useRef(false);
  const requestedCategory = normalizeCategory(searchParams.get("category"));
  const requestedTemplateIdRaw = searchParams.get("templateId");
  const requestedTemplateId = requestedTemplateIdRaw ? normalizeStudioTemplateId(requestedTemplateIdRaw) : null;
  const requestedSlideIndex = Math.max(0, Number(searchParams.get("slideIndex")) || 0);
  const selectedTemplateIdForFetch = (templatePresetByCategory[publishCategory] || createDefaultCategoryTemplatePreset()).templateId;
  const selectedTemplatePresetKey = toCustomerTemplatePresetKey(publishCategory, selectedTemplateIdForFetch);
  const selectedCategoryPermissionLevel = getWorkspaceCategoryPermissionLevel(workspacePermissions, publishCategory);
  const canEditSelectedCategory = canEditWorkspaceCategory(workspacePermissions, publishCategory);
  const selectedCategoryPermissionMessage = canEditSelectedCategory
    ? ""
    : selectedCategoryPermissionLevel === "none"
      ? "선택한 콘텐츠 프로필에 대한 편집 권한이 없습니다."
      : `선택한 콘텐츠 프로필은 ${toWorkspacePermissionLevelLabel(selectedCategoryPermissionLevel)} 권한이라 브랜딩과 템플릿 preset을 수정할 수 없습니다.`;
  const createHistorySnapshot = useCallback(
    (): EditorHistorySnapshot =>
      cloneEditorHistorySnapshot({
        publishCategory,
        brandingDraft,
        templateNotesByCategory,
        templatePresetByCategory,
      }),
    [brandingDraft, publishCategory, templateNotesByCategory, templatePresetByCategory]
  );
  const applyHistorySnapshot = useCallback((snapshot: EditorHistorySnapshot) => {
    setPublishCategory(snapshot.publishCategory);
    setBrandingDraft(snapshot.brandingDraft);
    setTemplateNotesByCategory(snapshot.templateNotesByCategory);
    setTemplatePresetByCategory(snapshot.templatePresetByCategory);
  }, []);
  const {
    pushHistorySnapshot,
    redoEditorChange,
    redoStack,
    resetHistory,
    undoEditorChange,
    undoStack,
  } = useLayoutStudioEditorHistory({
    applyHistorySnapshot,
    canEditSelectedCategory,
    createHistorySnapshot,
    isApplyingHistoryRef,
    selectedCategoryPermissionMessage,
    setHasPendingPresetChanges,
    setMessage,
  });

  useEffect(() => {
    trackWorkflowEvent({
      name: "page_view",
      page: "layout-studio",
      stage: "settings",
      status: "success",
    });
  }, []);

  const refresh = useCallback(async () => {
    const [categoriesData, brandingData, metadataData, categoryChannelsData] = await Promise.all([
      requestApi<CategoriesResponse>("/api/publish/categories", { cache: "no-store" }, "콘텐츠 프로필 목록을 불러오지 못했습니다."),
      requestApi<CategoryBrandingResponse>("/api/publish/category-branding", { cache: "no-store" }, "브랜딩 정보를 불러오지 못했습니다."),
      requestApi<CategoryMetadataResponse>(
        `/api/publish/category-metadata?templateId=${encodeURIComponent(selectedTemplateIdForFetch)}`,
        { cache: "no-store" },
        "프로필 메모를 불러오지 못했습니다."
      ),
      requestApi<CategoryChannelsResponse>("/api/publish/category-channels", { cache: "no-store" }, "콘텐츠 프로필 채널 매핑을 불러오지 못했습니다."),
    ]);
    const fetchedCategoryOptions = categoriesData.categories || [];
    const normalizedFetchedCategoryOptions = fetchedCategoryOptions.map((item) => ({ key: item.key, label: item.label }));
    const inferredCategoryOptions = createCategoryOptionsFromKeys([
      publishCategory,
      requestedCategory,
      ...fetchedCategoryOptions.map((item) => item.key),
      ...Object.keys(brandingData.categoryBranding || {}),
      ...Object.keys(metadataData.categoryMetadata || {}),
      ...Object.keys(categoryChannelsData.categoryChannels || {}),
    ]);
    setCategoryOptions((prev) => mergeCategoryOptions(prev, [...normalizedFetchedCategoryOptions, ...inferredCategoryOptions]));
    setWorkspacePermissions(categoriesData.workspacePermissions || null);
    if (brandingData.categoryBranding) {
      const nextBranding = brandingData.categoryBranding[publishCategory];
      if (nextBranding) setBrandingDraft(nextBranding);
    }
    if (metadataData.categoryMetadata) {
      setTemplateNotesByCategory((prev) => {
        const next = { ...prev };
        for (const [category, metadata] of Object.entries(metadataData.categoryMetadata || {}) as Array<[string, PublishMetadata]>) {
          next[category as PublishCategory] = metadata.templateNotes || next[category as PublishCategory] || "";
        }
        return next;
      });
      const selectedMetadata = metadataData.categoryMetadata[publishCategory];
      if (selectedMetadata?.templatePreset && !localPresetTemplateKeys[selectedTemplatePresetKey] && !hasPendingPresetChanges) {
        setTemplatePresetByCategory((prev) => ({
          ...prev,
          [publishCategory]: normalizeCategoryTemplatePreset(selectedMetadata.templatePreset),
        }));
      }
    }
  }, [hasPendingPresetChanges, localPresetTemplateKeys, publishCategory, requestedCategory, selectedTemplateIdForFetch, selectedTemplatePresetKey]);

  useEffect(() => {
    void refresh().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  useEffect(() => {
    try {
      const lastCategory = normalizeCategory(readScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY)) || publishCategory;
      const parsed = readStoredStudioDraft(lastCategory);
      if (!parsed) {
        setContextSlides([]);
        return;
      }
      setContextSlides(Array.isArray(parsed.slides) ? parsed.slides : []);
      const draftCategory = normalizeCategory(parsed.publishCategory);
      if (draftCategory) {
        setCategoryOptions((prev) => mergeCategoryOptions(prev, createCategoryOptionsFromKeys([draftCategory])));
      }
    } catch {
      setContextSlides([]);
    }
  }, [publishCategory]);

  useEffect(() => {
    setRecentCustomerKeys(parseLayoutStudioRecentCustomerKeys(readScopedStorage(LAYOUT_STUDIO_RECENT_CUSTOMERS_KEY)));
  }, []);

  useEffect(() => {
    const hydratedPreset = hydrateLayoutStudioStoredPreset(readScopedStorage(STUDIO_EDITOR_PRESET_KEY), {
      requestedCategory,
      requestedTemplateId,
    });
    if (!hydratedPreset) return;
    const {
      brandingDraftPatch,
      categoryOptions: hydratedCategoryOptions,
      localPresetTemplateKeys: hydratedLocalPresetTemplateKeys,
      nextPublishCategory,
      replaceTemplatePresetByCategory,
      templatePresetByCategory: hydratedTemplatePresetByCategory,
    } = hydratedPreset;
    setLocalPresetTemplateKeys(hydratedLocalPresetTemplateKeys);
    if (nextPublishCategory) {
      setPublishCategory(nextPublishCategory);
    }
    if (hydratedCategoryOptions.length > 0) {
      setCategoryOptions((prev) => mergeCategoryOptions(prev, hydratedCategoryOptions));
    }
    if (brandingDraftPatch) setBrandingDraft((prev) => ({ ...prev, ...brandingDraftPatch }));
    if (hydratedTemplatePresetByCategory) {
      if (replaceTemplatePresetByCategory) {
        setTemplatePresetByCategory(hydratedTemplatePresetByCategory);
      } else {
        setTemplatePresetByCategory((prev) => ({
          ...prev,
          ...hydratedTemplatePresetByCategory,
        }));
      }
    }
    resetHistory();
    setHasPendingPresetChanges(false);
  }, [requestedCategory, requestedTemplateId, resetHistory]);

  useEffect(() => {
    setTemplatePresetByCategory((prev) => {
      if (prev[publishCategory]) return prev;
      return { ...prev, [publishCategory]: createDefaultCategoryTemplatePreset() };
    });
  }, [publishCategory]);

  useEffect(() => {
    setCustomerPickerValue(publishCategory);
  }, [publishCategory]);

  useEffect(() => {
    if (!publishCategory) return;
    setRecentCustomerKeys((prev) => {
      const next = getNextLayoutStudioRecentCustomerKeys(publishCategory, prev);
      try {
        writeScopedStorage(LAYOUT_STUDIO_RECENT_CUSTOMERS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage write errors
      }
      return next;
    });
  }, [publishCategory]);

  useEffect(() => {
    const inferredCategoryOptions = createCategoryOptionsFromKeys([
      publishCategory,
      ...Object.keys(templateNotesByCategory),
      ...Object.keys(templatePresetByCategory),
      ...Object.keys(localPresetTemplateKeys).map((key) => key.split("::")[0]),
    ]);
    if (inferredCategoryOptions.length === 0) return;
    setCategoryOptions((prev) => mergeCategoryOptions(prev, inferredCategoryOptions));
  }, [localPresetTemplateKeys, publishCategory, templateNotesByCategory, templatePresetByCategory]);

  useEffect(() => {
    setPreviewSlideIndex(requestedSlideIndex);
  }, [requestedSlideIndex]);

  const activeTemplatePreset = useMemo(
    () => templatePresetByCategory[publishCategory] || createDefaultCategoryTemplatePreset(),
    [publishCategory, templatePresetByCategory]
  );
  const previewTemplateImageLayout = useMemo(() => {
    try {
      return normalizeTemplateImageLayout(JSON.parse(activeTemplatePreset.templateLayoutJson) as unknown);
    } catch {
      return activeTemplatePreset.templateImageLayout;
    }
  }, [activeTemplatePreset.templateImageLayout, activeTemplatePreset.templateLayoutJson]);
  const resolvedActiveTemplatePreset = useMemo(
    () => ({
      ...activeTemplatePreset,
      templateImageLayout: previewTemplateImageLayout,
    }),
    [activeTemplatePreset, previewTemplateImageLayout]
  );
  const resolvedTemplatePresetByCategory = useMemo(
    () => ({
      ...templatePresetByCategory,
      [publishCategory]: resolvedActiveTemplatePreset,
    }),
    [publishCategory, resolvedActiveTemplatePreset, templatePresetByCategory]
  );
  const activeTemplateDefinition = getStudioTemplateDefinition(activeTemplatePreset.templateId);
  const activeTemplateSupportsOverlayEditor = activeTemplateDefinition.usesLegacyOverlayEditor;

  useEffect(() => {
    if (!activeTemplateSupportsOverlayEditor && (activeInspectorTab === "element" || activeInspectorTab === "geometry")) {
      setActiveInspectorTab("style");
    }
  }, [activeInspectorTab, activeTemplateSupportsOverlayEditor]);

  useEffect(() => {
    if (activeInspectorTab === "geometry") {
      setActiveInspectorTab("element");
    }
  }, [activeInspectorTab]);

  const workbenchLayoutStyle = useMemo(
    () =>
      buildLayoutStudioWorkbenchStyle({
        leftPanelWidth,
        rightPanelWidth,
        canvasZoom,
      }),
    [canvasZoom, leftPanelWidth, rightPanelWidth]
  );
  const canvasZoomPercent = Math.round(canvasZoom * 100);

  const zoomInCanvas = useCallback(() => {
    setCanvasZoom((prev) => getNextCanvasZoom(prev, 1));
  }, []);

  const zoomOutCanvas = useCallback(() => {
    setCanvasZoom((prev) => getNextCanvasZoom(prev, -1));
  }, []);

  const fitCanvasZoom = useCallback(() => {
    setCanvasZoom(DEFAULT_CANVAS_ZOOM);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  const centerStageViewport = useCallback(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    const { left, top } = getCenteredStageViewportScroll({
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    });
    viewport.scrollTo({
      left,
      top,
      behavior: "auto",
    });
  }, []);

  const resetWorkbenchLayout = useCallback(() => {
    setLeftPanelWidth(DEFAULT_LEFT_PANEL_WIDTH);
    setRightPanelWidth(DEFAULT_RIGHT_PANEL_WIDTH);
    setCanvasZoom(DEFAULT_CANVAS_ZOOM);
    setIsFocusMode(false);
    queueMicrotask(() => {
      centerStageViewport();
    });
  }, [centerStageViewport]);

  const handlePanelResizePointerDown = useCallback(
    (side: PanelResizeSide) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || isFocusMode) return;
      panelResizeRef.current = createPanelResizeContext({
        side,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: side === "left" ? leftPanelWidth : rightPanelWidth,
      });
      document.body.classList.add("studio-layout-is-resizing");
      event.preventDefault();
      event.stopPropagation();
    },
    [isFocusMode, leftPanelWidth, rightPanelWidth]
  );

  useEffect(() => {
    const handlePanelResizeMove = (event: PointerEvent) => {
      const context = panelResizeRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      if (context.side === "left") {
        setLeftPanelWidth(resolvePanelResizeWidth(context, event.clientX));
        return;
      }
      setRightPanelWidth(resolvePanelResizeWidth(context, event.clientX));
    };

    const clearPanelResize = (event: PointerEvent) => {
      const context = panelResizeRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      panelResizeRef.current = null;
      document.body.classList.remove("studio-layout-is-resizing");
    };

    window.addEventListener("pointermove", handlePanelResizeMove);
    window.addEventListener("pointerup", clearPanelResize);
    window.addEventListener("pointercancel", clearPanelResize);
    return () => {
      window.removeEventListener("pointermove", handlePanelResizeMove);
      window.removeEventListener("pointerup", clearPanelResize);
      window.removeEventListener("pointercancel", clearPanelResize);
      document.body.classList.remove("studio-layout-is-resizing");
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      centerStageViewport();
    });
  }, [canvasZoom, previewSlideIndex, centerStageViewport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (isEditableTextTarget(event.target)) return;
      event.preventDefault();
      setIsHandToolPressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setIsHandToolPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleStageViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isHandToolPressed) return;
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    stagePanRef.current = createStagePanContext({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    });
    viewport.classList.add("is-panning");
    event.preventDefault();
    event.stopPropagation();
  }, [isHandToolPressed]);

  useEffect(() => {
    const handleStagePanMove = (event: PointerEvent) => {
      const context = stagePanRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      const viewport = stageViewportRef.current;
      if (!viewport) return;
      const { left, top } = resolveStagePanScroll(context, event.clientX, event.clientY);
      viewport.scrollTo({
        left,
        top,
        behavior: "auto",
      });
    };

    const endStagePan = (event: PointerEvent) => {
      const context = stagePanRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      const viewport = stageViewportRef.current;
      if (viewport) viewport.classList.remove("is-panning");
      stagePanRef.current = null;
    };

    window.addEventListener("pointermove", handleStagePanMove);
    window.addEventListener("pointerup", endStagePan);
    window.addEventListener("pointercancel", endStagePan);
    return () => {
      window.removeEventListener("pointermove", handleStagePanMove);
      window.removeEventListener("pointerup", endStagePan);
      window.removeEventListener("pointercancel", endStagePan);
    };
  }, []);

  const updateActiveTemplatePreset = useCallback(
    (
      updater: (current: CategoryTemplatePreset) => CategoryTemplatePreset,
      options?: {
        trackHistory?: boolean;
      }
    ) => {
      if (options?.trackHistory) {
        pushHistorySnapshot();
        setHasPendingPresetChanges(true);
      }
      setTemplatePresetByCategory((prev) => {
        const current = prev[publishCategory] || createDefaultCategoryTemplatePreset();
        return {
          ...prev,
          [publishCategory]: updater(current),
        };
      });
    },
    [publishCategory, pushHistorySnapshot]
  );

  const updatePublishCategoryWithHistory = useCallback(
    (nextCategory: PublishCategory) => {
      if (nextCategory === publishCategory) return;
      pushHistorySnapshot();
      setPublishCategory(nextCategory);
      setHasPendingPresetChanges(false);
    },
    [publishCategory, pushHistorySnapshot]
  );

  const applyCustomerPickerSelection = useCallback(() => {
    const nextCategory = normalizeCategory(customerPickerValue) || DEFAULT_CATEGORY;
    setCustomerPickerValue(nextCategory);
    setCustomerSearchQuery("");
    setCategoryOptions((prev) => mergeCategoryOptions(prev, createCategoryOptionsFromKeys([nextCategory])));
    updatePublishCategoryWithHistory(nextCategory);
  }, [customerPickerValue, updatePublishCategoryWithHistory]);

  const updateBrandingDraftWithHistory = useCallback(
    (patch: Partial<TemplateBranding>) => {
      pushHistorySnapshot();
      setBrandingDraft((prev) => ({ ...prev, ...patch }));
      setHasPendingPresetChanges(true);
    },
    [pushHistorySnapshot]
  );

  const updateTemplateNotesWithHistory = useCallback(
    (value: string) => {
      pushHistorySnapshot();
      setTemplateNotesByCategory((prev) => ({
        ...prev,
        [publishCategory]: value,
      }));
      setHasPendingPresetChanges(true);
    },
    [publishCategory, pushHistorySnapshot]
  );
  const focusInspectorSearch = useCallback(() => {
    queueMicrotask(() => {
      inspectorSearchInputRef.current?.focus();
      inspectorSearchInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isEditableTarget = isEditableTextTarget(event.target);
      const withMeta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (key === "escape") {
        if (showCommandPalette) {
          event.preventDefault();
          setShowCommandPalette(false);
          setCommandQuery("");
          return;
        }
        if (showShortcutGuide) {
          event.preventDefault();
          setShowShortcutGuide(false);
          return;
        }
      }

      if (!isEditableTarget && withMeta && key === "k") {
        event.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      if (!isEditableTarget && withMeta && key === "f") {
        event.preventDefault();
        focusInspectorSearch();
        return;
      }

      if (showCommandPalette) return;

      if (!isEditableTarget && !withMeta && !event.altKey && !event.shiftKey && event.key === "/") {
        event.preventDefault();
        focusInspectorSearch();
        return;
      }

      if (!isEditableTarget && key === "?") {
        event.preventDefault();
        setShowShortcutGuide((prev) => !prev);
        return;
      }

      if (!isEditableTarget && event.shiftKey && event.code === "Backslash" && !withMeta && !event.altKey) {
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      if (!isEditableTarget && withMeta && (key === "+" || key === "=")) {
        event.preventDefault();
        zoomInCanvas();
        return;
      }

      if (!isEditableTarget && withMeta && key === "-") {
        event.preventDefault();
        zoomOutCanvas();
        return;
      }

      if (!isEditableTarget && withMeta && key === "0") {
        event.preventDefault();
        fitCanvasZoom();
        return;
      }

      if (!withMeta) return;
      if (key === "z" && !event.shiftKey) {
        if (isEditableTarget) return;
        event.preventDefault();
        undoEditorChange();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        if (isEditableTarget) return;
        event.preventDefault();
        redoEditorChange();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fitCanvasZoom, focusInspectorSearch, redoEditorChange, showCommandPalette, showShortcutGuide, toggleFocusMode, undoEditorChange, zoomInCanvas, zoomOutCanvas]);

  useEffect(() => {
    if (!showCommandPalette) return;
    queueMicrotask(() => {
      commandInputRef.current?.focus();
      commandInputRef.current?.select();
    });
  }, [showCommandPalette]);

  useEffect(() => {
    let nextLayout: TemplateImageLayout | null = null;
    let nextJson: string | null = null;
    try {
      const parsed = JSON.parse(activeTemplatePreset.templateLayoutJson) as unknown;
      nextLayout = normalizeTemplateImageLayout(parsed);
      nextJson = serializeTemplateLayoutForEditor(nextLayout);
    } catch {
      if (isLegacyGenericTemplateImageLayout(activeTemplatePreset.templateImageLayout)) {
        nextLayout = normalizeTemplateImageLayout(activeTemplatePreset.templateImageLayout);
        nextJson = serializeTemplateLayoutForEditor(nextLayout);
      }
    }
    if (!nextLayout || !nextJson) return;
    if (
      JSON.stringify(activeTemplatePreset.templateImageLayout) === JSON.stringify(nextLayout) &&
      activeTemplatePreset.templateLayoutJson === nextJson
    ) {
      return;
    }
    updateActiveTemplatePreset((current) => ({
      ...current,
      templateImageLayout: nextLayout as TemplateImageLayout,
      templateLayoutJson: nextJson,
    }));
  }, [activeTemplatePreset.templateImageLayout, activeTemplatePreset.templateLayoutJson, updateActiveTemplatePreset]);

  const saveCustomerTemplatePreset = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const active = resolvedActiveTemplatePreset;
      const data = await requestApi<CategoryMetadataResponse>(
        "/api/publish/category-metadata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: publishCategory,
            templateId: active.templateId,
            templatePreset: {
              templateId: active.templateId,
              templateData: active.templateData,
              templateImageEnabled: active.templateImageEnabled,
              templateImageUrl: active.templateImageUrl,
              templateImageLayout: active.templateImageLayout,
              templateLayoutApply: active.templateLayoutApply,
              templateLayoutJson: active.templateLayoutJson,
            },
          }),
        },
        "콘텐츠 프로필 템플릿 저장에 실패했습니다."
      );
      const nextTemplatePreset = data.metadata?.templatePreset;
      if (nextTemplatePreset) {
        setTemplatePresetByCategory((prev) => ({
          ...prev,
          [publishCategory]: normalizeCategoryTemplatePreset(nextTemplatePreset),
        }));
      }
      writeScopedStorage(
        STUDIO_EDITOR_PRESET_KEY,
        serializeLayoutStudioStoredPreset({
          publishCategory,
          brandingDraft,
          activeTemplatePreset: active,
          templatePresetByCategory: resolvedTemplatePresetByCategory,
        })
      );
      setLocalPresetTemplateKeys((prev) => ({
        ...prev,
        [toCustomerTemplatePresetKey(publishCategory, active.templateId)]: true,
      }));
      setHasPendingPresetChanges(false);
      setMessage("현재 콘텐츠 프로필의 기본 템플릿 preset을 DB에 저장했고, 메인 스튜디오 연동용 로컬 작업 상태도 함께 갱신했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    brandingDraft,
    canEditSelectedCategory,
    publishCategory,
    resolvedActiveTemplatePreset,
    resolvedTemplatePresetByCategory,
    selectedCategoryPermissionMessage,
  ]);

  const applyTemplateLayoutJson = useCallback(() => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    try {
      const parsed = JSON.parse(activeTemplatePreset.templateLayoutJson) as unknown;
      const normalized = normalizeTemplateImageLayout(parsed);
      const normalizedJson = serializeTemplateLayoutForEditor(normalized);
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateImageLayout: normalized,
          templateLayoutJson: normalizedJson,
        }),
        { trackHistory: true }
      );
      setMessage("JSON 속성을 적용했습니다. 저장 버튼을 눌러야 최종 반영됩니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [activeTemplatePreset.templateLayoutJson, canEditSelectedCategory, selectedCategoryPermissionMessage, updateActiveTemplatePreset]);

  const clearInspectorSearch = useCallback(() => {
    setInspectorSearchQuery("");
  }, []);

  const setAdvancedTemplateId = useCallback(
    (nextTemplateId: StudioTemplateId) => {
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateId: nextTemplateId,
          templateData: current.templateId === nextTemplateId ? current.templateData : createStudioTemplateData(nextTemplateId),
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const setAdvancedTemplateData = useCallback(
    (value: unknown) => {
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateData: value as CategoryTemplatePreset["templateData"],
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const setAdvancedTemplateLayoutJson = useCallback(
    (value: string) => {
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateLayoutJson: value,
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const {
    alignSelectedSlotRect,
    copySelectedSlotRect,
    displayTemplateImageLayout,
    handleSlotPointerDown,
    nudgeTemplateRectField,
    pasteSelectedSlotRect,
    resetSelectedSlotRect,
    resolveTemplateColorValue,
    resolveTemplateFontWeightValue,
    selectedRect,
    selectedSlotColorValue,
    selectedSlotFontMeta,
    selectedSlotFontSizeValue,
    selectedSlotFontWeightMeta,
    selectedSlotFontWeightValue,
    selectedSlotHasTypographyControls,
    selectedSlotLabel,
    selectedSlotStyleBinding,
    selectedSlotTextAlignValue,
    setActiveTemplateData,
    setTemplateFontSize,
    setTemplateFontWeight,
    setTemplateImageEnabled,
    setTemplateLayoutAlign,
    setTemplateLayoutApplyField,
    setTemplateLayoutColor,
    setTemplateRectField,
    slotRectClipboard,
  } = useLayoutStudioTemplateEditor({
    activeTemplatePreset,
    activeTemplateSupportsOverlayEditor,
    canEditSelectedCategory,
    dragContextRef,
    isHandToolPressed,
    previewStageRef,
    previewTemplateImageLayout,
    rectNudgeStep,
    selectedCategoryPermissionMessage,
    selectedRectSlot,
    setActiveInspectorTab,
    setMessage,
    setSelectedRectSlot,
    showCommandPalette,
    updateActiveTemplatePreset,
  });

  const saveCategoryBranding = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await requestApi<CategoryBrandingResponse>(
        "/api/publish/category-branding",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: publishCategory, branding: brandingDraft }),
        },
        "콘텐츠 프로필 브랜딩 저장에 실패했습니다."
      );
      if (!data.branding) throw new Error("콘텐츠 프로필 브랜딩 저장 결과가 올바르지 않습니다.");
      setBrandingDraft(data.branding);
      setMessage("현재 콘텐츠 프로필의 브랜딩을 DB에 저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publishCategory, brandingDraft, canEditSelectedCategory, selectedCategoryPermissionMessage]);

  const saveTemplateNotes = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await requestApi<CategoryMetadataResponse>(
        "/api/publish/category-metadata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: publishCategory,
            templateNotes: templateNotesByCategory[publishCategory] || "",
          }),
        },
        "프로필 메모 저장에 실패했습니다."
      );
      const nextTemplateNotes = data.metadata?.templateNotes || "";
      setTemplateNotesByCategory((prev) => ({
        ...prev,
        [publishCategory]: nextTemplateNotes,
      }));
      setMessage("현재 콘텐츠 프로필의 운영 메모를 DB에 저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publishCategory, templateNotesByCategory, canEditSelectedCategory, selectedCategoryPermissionMessage]);

  const handleTemplateImageFile = useCallback((file: File | null) => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    if (!file) return;
    if (!(file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg" || file.type === "image/webp")) {
      setMessage("PNG/JPG/WEBP 이미지 파일만 사용할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateImageUrl: dataUrl,
          templateImageEnabled: true,
        }),
        { trackHistory: true }
      );
    };
    reader.readAsDataURL(file);
  }, [canEditSelectedCategory, selectedCategoryPermissionMessage, updateActiveTemplatePreset]);

  const previewCategoryLabel = useMemo(
    () => categoryOptions.find((item) => item.key === publishCategory)?.label || publishCategory,
    [categoryOptions, publishCategory]
  );
  const visibleCustomerOptions = useMemo(() => {
    const normalizedQuery = customerSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return categoryOptions;
    const filtered = categoryOptions.filter((item) =>
      `${item.label} ${item.key}`.toLowerCase().includes(normalizedQuery)
    );
    if (filtered.some((item) => item.key === publishCategory)) return filtered;
    const current = categoryOptions.find((item) => item.key === publishCategory);
    return current ? mergeCategoryOptions([current], filtered) : filtered;
  }, [categoryOptions, customerSearchQuery, publishCategory]);
  const recentCustomerOptions = useMemo(
    () =>
      recentCustomerKeys
        .filter((key) => key !== publishCategory)
        .map((key) => categoryOptions.find((item) => item.key === key) || { key, label: toCategoryLabel(key) })
        .slice(0, 5),
    [categoryOptions, publishCategory, recentCustomerKeys]
  );
  const templateNotesDraft = templateNotesByCategory[publishCategory] || "";
  const inspectorVisibility = useMemo(
    () =>
      buildLayoutStudioInspectorVisibility({
        inspectorSearchQuery,
        activeInspectorTab,
        activeTemplateSupportsOverlayEditor,
        selectedSlotHasTypographyControls,
      }),
    [activeInspectorTab, activeTemplateSupportsOverlayEditor, inspectorSearchQuery, selectedSlotHasTypographyControls]
  );
  const {
    currentInspectorSectionKeys,
    hasAdvancedInspectorResult,
    hasElementInspectorResult,
    hasGeometryInspectorResult,
    hasStyleInspectorResult,
    isInspectorSearchActive,
    showAdvancedJsonSection,
    showAdvancedTemplateSection,
    showElementGeometrySection,
    showElementSlotsSection,
    showElementTypographySection,
    showGeometryFieldsSection,
    showGeometrySlotsSection,
    showStyleAlignSection,
    showStyleApplySection,
    showStyleColorSection,
    showStyleFontSection,
    showStyleImageSection,
    showStyleTemplateSection,
    showStyleWeightSection,
  } = inspectorVisibility;
  const isInspectorSectionVisible = useCallback(
    (sectionKey: InspectorSectionKey) =>
      isLayoutStudioInspectorSectionVisible(collapsedInspectorSections, sectionKey, isInspectorSearchActive),
    [collapsedInspectorSections, isInspectorSearchActive]
  );
  const toggleInspectorSection = useCallback((sectionKey: InspectorSectionKey) => {
    setCollapsedInspectorSections((prev) => toggleLayoutStudioInspectorSection(prev, sectionKey));
  }, []);
  const setCurrentInspectorSectionsCollapsed = useCallback(
    (collapsed: boolean) => {
      setCollapsedInspectorSections((prev) => setLayoutStudioInspectorSectionsCollapsed(prev, currentInspectorSectionKeys, collapsed));
    },
    [currentInspectorSectionKeys]
  );
  const previewSlides = useMemo(() => {
    if (contextSlides.length > 0) return contextSlides;
    return [
      buildStudioTemplateSampleSlide(
        activeTemplatePreset.templateId,
        activeTemplatePreset.templateImageEnabled ? activeTemplatePreset.templateImageUrl || undefined : undefined
      ),
    ];
  }, [activeTemplatePreset.templateId, activeTemplatePreset.templateImageEnabled, activeTemplatePreset.templateImageUrl, contextSlides]);
  useEffect(() => {
    setPreviewSlideIndex((current) => Math.max(0, Math.min(previewSlides.length - 1, current)));
  }, [previewSlides.length]);
  const previewSlide = previewSlides[previewSlideIndex] || previewSlides[0];
  const templateRequirementAlert = useMemo(
    () => getTemplateRequirementAlert(activeTemplatePreset.templateId, [previewSlide]),
    [activeTemplatePreset.templateId, previewSlide]
  );
  const previewThumbnailKey = useMemo(
    () =>
      JSON.stringify({
        category: publishCategory,
        templateId: activeTemplatePreset.templateId,
        templateData: activeTemplatePreset.templateData,
        branding: brandingDraft,
        templateImageEnabled: activeTemplatePreset.templateImageEnabled,
        templateImageUrl: activeTemplatePreset.templateImageUrl,
        templateLayoutJson: activeTemplatePreset.templateLayoutJson,
        templateLayoutApply: activeTemplatePreset.templateLayoutApply,
        previewSlideIndex,
      }),
    [
      activeTemplatePreset.templateId,
      activeTemplatePreset.templateData,
      activeTemplatePreset.templateImageEnabled,
      activeTemplatePreset.templateImageUrl,
      activeTemplatePreset.templateLayoutApply,
      activeTemplatePreset.templateLayoutJson,
      brandingDraft,
      publishCategory,
      previewSlideIndex,
    ]
  );
  const hasErrorMessage = /오류|실패|error/i.test(message);
  const commandActions = useMemo(
    () =>
      buildLayoutStudioCommandActions({
        activeTemplateSupportsOverlayEditor,
        canEditSelectedCategory,
        canvasZoom,
        currentInspectorSectionCount: currentInspectorSectionKeys.length,
        hasPendingPresetChanges,
        isFocusMode,
        isInspectorSearchActive,
        loading,
        maxCanvasZoom: MAX_CANVAS_ZOOM,
        minCanvasZoom: MIN_CANVAS_ZOOM,
        selectedSlotLabel,
        showShortcutGuide,
        slotRectClipboard: Boolean(slotRectClipboard),
        undoCount: undoStack.length,
        redoCount: redoStack.length,
        onAlignSelectedSlotRectXCenter: () => alignSelectedSlotRect("x", "center"),
        onAlignSelectedSlotRectYCenter: () => alignSelectedSlotRect("y", "center"),
        onCopySelectedSlotRect: copySelectedSlotRect,
        onFocusInspectorSearch: focusInspectorSearch,
        onFitCanvasZoom: fitCanvasZoom,
        onOpenInspectorAdvanced: () => setActiveInspectorTab("advanced"),
        onOpenInspectorElement: () => setActiveInspectorTab("element"),
        onOpenInspectorStyle: () => setActiveInspectorTab("style"),
        onOpenSidebarBranding: () => setActiveSidebarTab("branding"),
        onOpenSidebarNotes: () => setActiveSidebarTab("notes"),
        onPasteSelectedSlotRect: pasteSelectedSlotRect,
        onRedo: redoEditorChange,
        onResetSelectedSlotRect: resetSelectedSlotRect,
        onResetWorkbenchLayout: resetWorkbenchLayout,
        onSaveTemplate: () => void saveCustomerTemplatePreset(),
        onSetCurrentInspectorSectionsCollapsed: setCurrentInspectorSectionsCollapsed,
        onToggleFocusMode: toggleFocusMode,
        onToggleShortcutGuide: () => setShowShortcutGuide((prev) => !prev),
        onUndo: undoEditorChange,
        onZoomInCanvas: zoomInCanvas,
        onZoomOutCanvas: zoomOutCanvas,
      }),
    [
      activeTemplateSupportsOverlayEditor,
      alignSelectedSlotRect,
      canEditSelectedCategory,
      canvasZoom,
      copySelectedSlotRect,
      currentInspectorSectionKeys.length,
      fitCanvasZoom,
      focusInspectorSearch,
      hasPendingPresetChanges,
      isInspectorSearchActive,
      isFocusMode,
      loading,
      pasteSelectedSlotRect,
      redoEditorChange,
      resetSelectedSlotRect,
      resetWorkbenchLayout,
      saveCustomerTemplatePreset,
      selectedSlotLabel,
      setCurrentInspectorSectionsCollapsed,
      showShortcutGuide,
      slotRectClipboard,
      toggleFocusMode,
      undoEditorChange,
      undoStack.length,
      redoStack.length,
      zoomInCanvas,
      zoomOutCanvas,
    ]
  );
  const filteredCommandActions = useMemo(() => {
    return filterLayoutStudioCommandActions(commandActions, commandQuery);
  }, [commandActions, commandQuery]);

  const runCommandAction = useCallback((actionId: string) => {
    const action = commandActions.find((item) => item.id === actionId);
    if (!action || action.disabled) return;
    action.run();
    setShowCommandPalette(false);
    setCommandQuery("");
  }, [commandActions]);

  return (
    <AppLayout>
      <div className="studio-layout-workbench-page">
        <LayoutStudioWorkbenchHeader
          previewCategoryLabel={previewCategoryLabel}
          activeTemplateLabel={activeTemplateDefinition.label}
          selectedSlotLabel={selectedSlotLabel}
          hasPendingPresetChanges={hasPendingPresetChanges}
          message={message}
          hasErrorMessage={hasErrorMessage}
          selectedCategoryPermissionMessage={selectedCategoryPermissionMessage}
          canEditSelectedCategory={canEditSelectedCategory}
          loading={loading}
          undoCount={undoStack.length}
          redoCount={redoStack.length}
          isFocusMode={isFocusMode}
          showShortcutGuide={showShortcutGuide}
          showCommandPalette={showCommandPalette}
          commandInputRef={commandInputRef}
          commandQuery={commandQuery}
          filteredCommandActions={filteredCommandActions}
          onUndo={undoEditorChange}
          onRedo={redoEditorChange}
          onSaveTemplate={() => void saveCustomerTemplatePreset()}
          onToggleFocusMode={toggleFocusMode}
          onToggleShortcutGuide={() => setShowShortcutGuide((prev) => !prev)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onCloseCommandPalette={() => setShowCommandPalette(false)}
          onResetWorkbenchLayout={resetWorkbenchLayout}
          onCommandQueryChange={setCommandQuery}
          onRunCommandAction={runCommandAction}
        />
        <LayoutStudioWorkbenchContextBar
          categoryCount={categoryOptions.length}
          customerPickerValue={customerPickerValue}
          customerSearchQuery={customerSearchQuery}
          selectedTemplateId={activeTemplatePreset.templateId}
          publishCategory={publishCategory}
          recentCustomerOptions={recentCustomerOptions}
          visibleCustomerOptions={visibleCustomerOptions}
          templateOptions={LAYOUT_STUDIO_TEMPLATE_OPTIONS}
          onCustomerPickerValueChange={setCustomerPickerValue}
          onCustomerSearchQueryChange={setCustomerSearchQuery}
          onCustomerPickerSubmit={applyCustomerPickerSelection}
          onPublishCategoryChange={(nextCategory) => {
            const normalized = normalizeCategory(nextCategory) || DEFAULT_CATEGORY;
            setCustomerPickerValue(normalized);
            setCustomerSearchQuery("");
            updatePublishCategoryWithHistory(normalized);
          }}
          onTemplateChange={(templateId) =>
            updateActiveTemplatePreset(
              (current) => ({
                ...current,
                templateId: normalizeStudioTemplateId(templateId),
                templateData:
                  current.templateId === normalizeStudioTemplateId(templateId)
                    ? current.templateData
                    : createStudioTemplateData(normalizeStudioTemplateId(templateId)),
              }),
              { trackHistory: true }
            )
          }
        />

        <div className={`assets-library-shell studio-layout-workbench-shell${isFocusMode ? " is-focus-mode" : ""}`} style={workbenchLayoutStyle}>
          <LayoutStudioWorkbenchSidebar
            activeSidebarTab={activeSidebarTab}
            activeTemplateLabel={activeTemplateDefinition.label}
            brandingDraft={brandingDraft}
            canEditSelectedCategory={canEditSelectedCategory}
            loading={loading}
            previewCategoryLabel={previewCategoryLabel}
            templateNotesDraft={templateNotesDraft}
            onSidebarTabChange={setActiveSidebarTab}
            onBrandingDraftChange={(patch) => updateBrandingDraftWithHistory(patch)}
            onSaveCategoryBranding={() => void saveCategoryBranding()}
            onTemplateNotesChange={(value) => updateTemplateNotesWithHistory(value)}
            onSaveTemplateNotes={() => void saveTemplateNotes()}
          />
          <button
            type="button"
            className="studio-layout-workbench-resizer"
            aria-label="왼쪽 패널 너비 조절"
            title="드래그해서 왼쪽 패널 너비 조절"
            onPointerDown={handlePanelResizePointerDown("left")}
            onDoubleClick={() => setLeftPanelWidth(DEFAULT_LEFT_PANEL_WIDTH)}
          />

          <div className={`assets-library-main studio-layout-workbench-main`}>
            <div className="studio-layout-workbench-main-grid">
              <LayoutStudioWorkbenchCanvasPane
                activeTemplatePreset={activeTemplatePreset}
                activeTemplateSupportsOverlayEditor={activeTemplateSupportsOverlayEditor}
                brandingDraft={brandingDraft}
                canEditSelectedCategory={canEditSelectedCategory}
                canvasZoomPercent={canvasZoomPercent}
                contextSlides={contextSlides}
                displayTemplateImageLayout={displayTemplateImageLayout}
                fitCanvasZoom={fitCanvasZoom}
                handlePanelResizePointerDown={handlePanelResizePointerDown}
                handleSlotPointerDown={handleSlotPointerDown}
                handleStageViewportPointerDown={handleStageViewportPointerDown}
                isHandToolPressed={isHandToolPressed}
                onNextPreviewSlide={() => setPreviewSlideIndex((current) => Math.min(previewSlides.length - 1, current + 1))}
                onPreviousPreviewSlide={() => setPreviewSlideIndex((current) => Math.max(0, current - 1))}
                onSelectRectSlot={(slotKey) => {
                  setSelectedRectSlot(slotKey);
                  setActiveInspectorTab("element");
                }}
                previewSlide={previewSlide}
                previewSlideIndex={previewSlideIndex}
                previewSlides={previewSlides}
                previewThumbnailKey={previewThumbnailKey}
                selectedRectSlot={selectedRectSlot}
                stageViewportRef={stageViewportRef}
                previewStageRef={previewStageRef}
                zoomInCanvas={zoomInCanvas}
                zoomOutCanvas={zoomOutCanvas}
              />

              <LayoutStudioWorkbenchInspector
                activeInspectorTab={activeInspectorTab}
                canEditSelectedCategory={canEditSelectedCategory}
                currentInspectorSectionKeys={currentInspectorSectionKeys}
                inspectorSearchInputRef={inspectorSearchInputRef}
                inspectorSearchQuery={inspectorSearchQuery}
                isInspectorSearchActive={isInspectorSearchActive}
                loading={loading}
                onClearInspectorSearch={clearInspectorSearch}
                onSetActiveInspectorTab={setActiveInspectorTab}
                onSetCurrentInspectorSectionsCollapsed={setCurrentInspectorSectionsCollapsed}
                onSetInspectorSearchQuery={setInspectorSearchQuery}
                elementPanelProps={{
                  activeTemplateSupportsOverlayEditor,
                  canEditSelectedCategory,
                  hasElementInspectorResult,
                  isInspectorSectionVisible,
                  rectNudgeStep,
                  selectedRect,
                  selectedRectSlot,
                  selectedSlotColorValue,
                  selectedSlotFontMeta,
                  selectedSlotFontSizeValue,
                  selectedSlotFontWeightMeta,
                  selectedSlotFontWeightValue,
                  selectedSlotHasTypographyControls,
                  selectedSlotLabel,
                  selectedSlotStyleBinding,
                  selectedSlotTextAlignValue,
                  showElementGeometrySection,
                  showElementSlotsSection,
                  showElementTypographySection,
                  slotRectClipboard: Boolean(slotRectClipboard),
                  toggleInspectorSection,
                  onAlignSelectedSlotRect: alignSelectedSlotRect,
                  onClearInspectorSearch: clearInspectorSearch,
                  onCopySelectedSlotRect: copySelectedSlotRect,
                  onNudgeTemplateRectField: nudgeTemplateRectField,
                  onPasteSelectedSlotRect: pasteSelectedSlotRect,
                  onResetSelectedSlotRect: resetSelectedSlotRect,
                  onSelectRectSlot: setSelectedRectSlot,
                  onSetTemplateFontSize: setTemplateFontSize,
                  onSetTemplateFontWeight: setTemplateFontWeight,
                  onSetTemplateLayoutAlign: setTemplateLayoutAlign,
                  onSetTemplateLayoutColor: setTemplateLayoutColor,
                  onSetTemplateRectField: setTemplateRectField,
                }}
                geometryPanelProps={{
                  activeTemplateSupportsOverlayEditor,
                  canEditSelectedCategory,
                  hasGeometryInspectorResult,
                  isInspectorSectionVisible,
                  rectNudgeStep,
                  selectedRect,
                  selectedRectSlot,
                  showGeometryFieldsSection,
                  showGeometrySlotsSection,
                  slotRectClipboard: Boolean(slotRectClipboard),
                  toggleInspectorSection,
                  onAlignSelectedSlotRect: alignSelectedSlotRect,
                  onClearInspectorSearch: clearInspectorSearch,
                  onCopySelectedSlotRect: copySelectedSlotRect,
                  onNudgeTemplateRectField: nudgeTemplateRectField,
                  onPasteSelectedSlotRect: pasteSelectedSlotRect,
                  onResetSelectedSlotRect: resetSelectedSlotRect,
                  onSelectRectSlot: setSelectedRectSlot,
                  onSetRectNudgeStep: setRectNudgeStep,
                  onSetTemplateRectField: setTemplateRectField,
                }}
                stylePanelProps={{
                  activeTemplatePreset,
                  hasStyleInspectorResult,
                  isInspectorSectionVisible,
                  previewTemplateImageLayout,
                  showStyleAlignSection,
                  showStyleApplySection,
                  showStyleColorSection,
                  showStyleFontSection,
                  showStyleImageSection,
                  showStyleTemplateSection,
                  showStyleWeightSection,
                  templateLayoutHint: activeTemplateDefinition.layoutStudioHint,
                  templateRequirementAlert,
                  toggleInspectorSection,
                  onClearInspectorSearch: clearInspectorSearch,
                  onSetActiveTemplateData: setActiveTemplateData,
                  onSetTemplateFontSize: setTemplateFontSize,
                  onSetTemplateFontWeight: setTemplateFontWeight,
                  onSetTemplateImageEnabled: setTemplateImageEnabled,
                  onSetTemplateLayoutAlign: setTemplateLayoutAlign,
                  onSetTemplateLayoutApplyField: setTemplateLayoutApplyField,
                  onSetTemplateLayoutColor: setTemplateLayoutColor,
                  onTemplateImageFileChange: handleTemplateImageFile,
                  resolveTemplateColorValue,
                  resolveTemplateFontWeightValue,
                }}
                advancedPanelProps={{
                  activeTemplatePreset,
                  brandingDraft,
                  hasAdvancedInspectorResult,
                  isInspectorSectionVisible,
                  loading,
                  previewSlide,
                  publishCategory,
                  showAdvancedJsonSection,
                  showAdvancedTemplateSection,
                  templateRequirementAlert,
                  toggleInspectorSection,
                  onApplyTemplateLayoutJson: applyTemplateLayoutJson,
                  onClearInspectorSearch: clearInspectorSearch,
                  onSetTemplateData: setAdvancedTemplateData,
                  onSetTemplateId: setAdvancedTemplateId,
                  onSetTemplateLayoutJson: setAdvancedTemplateLayoutJson,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function LayoutStudioPage() {
  return (
    <Suspense fallback={null}>
      <LayoutStudioPageContent />
    </Suspense>
  );
}
