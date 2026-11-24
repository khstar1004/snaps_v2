"use client";

import { type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TEMPLATE_IMAGE_LAYOUT,
  sanitizeRect,
  serializeTemplateLayoutForEditor,
  type CategoryTemplatePreset,
  type LayoutRect,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "@/app/layout-studio/layout-studio-helpers";
import type { InspectorTabKey } from "@/app/layout-studio/layout-studio-inspector";
import {
  getAlignedLayoutRect,
  getEditableRectSlotLabel,
  getNextEditableRectSlot,
  resolveLayoutStudioOverlayShortcut,
  toRectFromPointer,
  type DragContext,
  type DragMode,
  type EditableRectSlotKey,
} from "@/app/layout-studio/layout-studio-interactions";

export type TemplateFontSizeKey = "titleSize" | "bodySize" | "headerSize" | "infoSize";
export type TemplateFontWeightKey = "headerTitleWeight" | "headerAccentWeight" | "titleWeight" | "bodyWeight" | "infoWeight";
export type TemplateColorKey = "headerTitleColor" | "headerAccentColor" | "titleColor" | "bodyColor" | "infoColor";
export type TemplateAlignKey = "titleAlign" | "bodyAlign";

type TemplateFontSizeMeta = {
  min: number;
  max: number;
  label: string;
};

type TemplateFontWeightMeta = {
  label: string;
};

export type TemplateStyleBinding = {
  sizeKey?: TemplateFontSizeKey;
  weightKey?: TemplateFontWeightKey;
  colorKey?: TemplateColorKey;
  alignKey?: TemplateAlignKey;
};

type UpdateActiveTemplatePreset = (
  updater: (current: CategoryTemplatePreset) => CategoryTemplatePreset,
  options?: { trackHistory?: boolean }
) => void;

export const TEMPLATE_FONT_SIZE_META: Record<TemplateFontSizeKey, TemplateFontSizeMeta> = {
  titleSize: { min: 10, max: 52, label: "제목 텍스트" },
  bodySize: { min: 9, max: 36, label: "본문 텍스트" },
  headerSize: { min: 10, max: 32, label: "헤더 텍스트" },
  infoSize: { min: 8, max: 24, label: "정보줄 텍스트" },
};

export const TEMPLATE_FONT_WEIGHT_META: Record<TemplateFontWeightKey, TemplateFontWeightMeta> = {
  headerTitleWeight: { label: "헤더 제목" },
  headerAccentWeight: { label: "헤더 강조" },
  titleWeight: { label: "제목 텍스트" },
  bodyWeight: { label: "본문 텍스트" },
  infoWeight: { label: "정보줄 텍스트" },
};

export const SLOT_STYLE_BINDINGS: Record<EditableRectSlotKey, TemplateStyleBinding> = {
  headerTitleSlot: { sizeKey: "headerSize", weightKey: "headerTitleWeight", colorKey: "headerTitleColor" },
  headerAccentSlot: { sizeKey: "headerSize", weightKey: "headerAccentWeight", colorKey: "headerAccentColor" },
  titleSlot: { sizeKey: "titleSize", weightKey: "titleWeight", colorKey: "titleColor", alignKey: "titleAlign" },
  infoSlot: { sizeKey: "infoSize", weightKey: "infoWeight", colorKey: "infoColor" },
  bodySlot: { sizeKey: "bodySize", weightKey: "bodyWeight", colorKey: "bodyColor", alignKey: "bodyAlign" },
  imageSlot: {},
};

export type LayoutStudioTemplateEditorInput = {
  activeTemplatePreset: CategoryTemplatePreset;
  activeTemplateSupportsOverlayEditor: boolean;
  canEditSelectedCategory: boolean;
  dragContextRef: RefObject<DragContext | null>;
  isHandToolPressed: boolean;
  previewStageRef: RefObject<HTMLDivElement | null>;
  previewTemplateImageLayout: TemplateImageLayout;
  rectNudgeStep: number;
  selectedCategoryPermissionMessage: string;
  selectedRectSlot: EditableRectSlotKey;
  setActiveInspectorTab: Dispatch<SetStateAction<InspectorTabKey>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setSelectedRectSlot: Dispatch<SetStateAction<EditableRectSlotKey>>;
  showCommandPalette: boolean;
  updateActiveTemplatePreset: UpdateActiveTemplatePreset;
};

export type LayoutStudioTemplateEditorResult = {
  alignSelectedSlotRect: (axis: "x" | "y", mode: "start" | "center" | "end") => void;
  copySelectedSlotRect: () => void;
  displayTemplateImageLayout: TemplateImageLayout;
  handleSlotPointerDown: (slotKey: EditableRectSlotKey, mode: DragMode) => (event: ReactPointerEvent<HTMLElement>) => void;
  nudgeTemplateRectField: (slotKey: EditableRectSlotKey, field: keyof LayoutRect, delta: number) => void;
  pasteSelectedSlotRect: () => void;
  resetSelectedSlotRect: () => void;
  resolveTemplateColorValue: (key: TemplateColorKey) => string;
  resolveTemplateFontWeightValue: (key: TemplateFontWeightKey) => number;
  selectedRect: LayoutRect;
  selectedSlotColorValue: string;
  selectedSlotFontMeta: TemplateFontSizeMeta | null;
  selectedSlotFontSizeValue?: number;
  selectedSlotFontWeightMeta: TemplateFontWeightMeta | null;
  selectedSlotFontWeightValue: number;
  selectedSlotHasTypographyControls: boolean;
  selectedSlotLabel: string;
  selectedSlotStyleBinding: TemplateStyleBinding;
  selectedSlotTextAlignValue?: "left" | "center" | "right";
  setActiveTemplateData: (value: unknown) => void;
  setTemplateFontSize: (key: TemplateFontSizeKey, raw: string) => void;
  setTemplateFontWeight: (key: TemplateFontWeightKey, raw: string) => void;
  setTemplateImageEnabled: (checked: boolean) => void;
  setTemplateLayoutAlign: (key: TemplateAlignKey, raw: string) => void;
  setTemplateLayoutApplyField: (field: keyof TemplateLayoutApply, checked: boolean) => void;
  setTemplateLayoutColor: (key: TemplateColorKey, value: string) => void;
  setTemplateRectField: (slotKey: EditableRectSlotKey, field: keyof LayoutRect, raw: string) => void;
  slotRectClipboard: boolean;
};

function isSameRect(left: LayoutRect, right: LayoutRect): boolean {
  return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h;
}

function clampFontSize(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

function getTemplateFontWeightFallback(key: TemplateFontWeightKey, templateImageEnabled: boolean): number {
  switch (key) {
    case "headerTitleWeight":
      return 600;
    case "headerAccentWeight":
      return 400;
    case "titleWeight":
      return templateImageEnabled ? 800 : 700;
    case "bodyWeight":
      return templateImageEnabled ? 400 : 600;
    case "infoWeight":
      return 400;
    default:
      return 400;
  }
}

function getTemplateColorValue(layout: TemplateImageLayout, key: TemplateColorKey, templateImageEnabled: boolean): string {
  if (key === "headerTitleColor") return layout.headerTitleColor || "#ffffff";
  if (key === "headerAccentColor") return layout.headerAccentColor || "rgba(255,255,255,0.9)";
  if (!templateImageEnabled && key === "titleColor" && layout.titleColor === "#ffffff") return "#18181b";
  if (!templateImageEnabled && key === "bodyColor" && layout.bodyColor === "#ffffff") return "#27272a";
  if (!templateImageEnabled && key === "infoColor" && layout.infoColor === "rgba(255,255,255,0.92)") return "#71717a";
  return key === "titleColor" || key === "bodyColor" || key === "infoColor" ? layout[key] : "#ffffff";
}

export function useLayoutStudioTemplateEditor(input: LayoutStudioTemplateEditorInput): LayoutStudioTemplateEditorResult {
  const {
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
  } = input;
  const [slotRectClipboard, setSlotRectClipboard] = useState<LayoutRect | null>(null);
  const [dragPreview, setDragPreview] = useState<{ slotKey: EditableRectSlotKey; rect: LayoutRect } | null>(null);

  const displayTemplateImageLayout = useMemo(() => {
    if (!dragPreview) return previewTemplateImageLayout;
    return {
      ...previewTemplateImageLayout,
      [dragPreview.slotKey]: dragPreview.rect,
    };
  }, [dragPreview, previewTemplateImageLayout]);

  const selectedRect = displayTemplateImageLayout[selectedRectSlot];
  const selectedSlotLabel = useMemo(() => getEditableRectSlotLabel(selectedRectSlot), [selectedRectSlot]);
  const selectedSlotStyleBinding = useMemo(() => SLOT_STYLE_BINDINGS[selectedRectSlot], [selectedRectSlot]);
  const selectedSlotFontMeta = useMemo(
    () => (selectedSlotStyleBinding.sizeKey ? TEMPLATE_FONT_SIZE_META[selectedSlotStyleBinding.sizeKey] : null),
    [selectedSlotStyleBinding.sizeKey]
  );
  const selectedSlotFontWeightMeta = useMemo(
    () => (selectedSlotStyleBinding.weightKey ? TEMPLATE_FONT_WEIGHT_META[selectedSlotStyleBinding.weightKey] : null),
    [selectedSlotStyleBinding.weightKey]
  );
  const selectedSlotColorValue = useMemo(
    () =>
      selectedSlotStyleBinding.colorKey
        ? getTemplateColorValue(previewTemplateImageLayout, selectedSlotStyleBinding.colorKey, activeTemplatePreset.templateImageEnabled)
        : "",
    [activeTemplatePreset.templateImageEnabled, previewTemplateImageLayout, selectedSlotStyleBinding.colorKey]
  );
  const selectedSlotFontWeightValue = useMemo(
    () =>
      selectedSlotStyleBinding.weightKey
        ? previewTemplateImageLayout[selectedSlotStyleBinding.weightKey] ??
          getTemplateFontWeightFallback(selectedSlotStyleBinding.weightKey, activeTemplatePreset.templateImageEnabled)
        : 400,
    [activeTemplatePreset.templateImageEnabled, previewTemplateImageLayout, selectedSlotStyleBinding.weightKey]
  );
  const selectedSlotFontSizeValue = selectedSlotStyleBinding.sizeKey ? previewTemplateImageLayout[selectedSlotStyleBinding.sizeKey] : undefined;
  const selectedSlotTextAlignValue = selectedSlotStyleBinding.alignKey ? previewTemplateImageLayout[selectedSlotStyleBinding.alignKey] : undefined;
  const selectedSlotHasTypographyControls = Boolean(
    selectedSlotStyleBinding.sizeKey ||
      selectedSlotStyleBinding.weightKey ||
      selectedSlotStyleBinding.colorKey ||
      selectedSlotStyleBinding.alignKey
  );

  const commitTemplateRect = useCallback(
    (slotKey: EditableRectSlotKey, rect: LayoutRect) => {
      if (!canEditSelectedCategory) {
        setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
        return;
      }
      const currentRect = previewTemplateImageLayout[slotKey];
      const normalized = sanitizeRect(rect, currentRect);
      if (isSameRect(currentRect, normalized)) return;
      const nextLayout = {
        ...previewTemplateImageLayout,
        [slotKey]: normalized,
      };
      updateActiveTemplatePreset(
        (current) => ({
          ...current,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [canEditSelectedCategory, previewTemplateImageLayout, selectedCategoryPermissionMessage, setMessage, updateActiveTemplatePreset]
  );

  const setTemplateFontSize = useCallback(
    (key: TemplateFontSizeKey, raw: string) => {
      const current = Number(previewTemplateImageLayout[key]);
      const fallback = Number.isFinite(current) ? current : DEFAULT_TEMPLATE_IMAGE_LAYOUT[key];
      const min = TEMPLATE_FONT_SIZE_META[key].min;
      const max = TEMPLATE_FONT_SIZE_META[key].max;
      const clamped = clampFontSize(raw, min, max, fallback);
      const nextLayout = { ...previewTemplateImageLayout, [key]: Math.round(clamped) };
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [previewTemplateImageLayout, updateActiveTemplatePreset]
  );

  const setTemplateFontWeight = useCallback(
    (key: TemplateFontWeightKey, raw: string) => {
      const parsed = Number(raw);
      const fallback = getTemplateFontWeightFallback(key, activeTemplatePreset.templateImageEnabled);
      const normalized = Number.isFinite(parsed) ? Math.max(100, Math.min(900, Math.round(parsed / 100) * 100)) : fallback;
      const nextLayout = {
        ...previewTemplateImageLayout,
        [key]: normalized,
      };
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [activeTemplatePreset.templateImageEnabled, previewTemplateImageLayout, updateActiveTemplatePreset]
  );

  const setTemplateRectField = useCallback(
    (slotKey: EditableRectSlotKey, field: keyof LayoutRect, raw: string) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const currentRect = previewTemplateImageLayout[slotKey];
      const roundedValue = Math.round(parsed * 10000) / 10000;
      const normalized = sanitizeRect(
        {
          ...currentRect,
          [field]: roundedValue,
        },
        currentRect
      );
      const nextLayout = {
        ...previewTemplateImageLayout,
        [slotKey]: normalized,
      };
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [previewTemplateImageLayout, updateActiveTemplatePreset]
  );

  const nudgeTemplateRectField = useCallback(
    (slotKey: EditableRectSlotKey, field: keyof LayoutRect, delta: number) => {
      const currentRect = previewTemplateImageLayout[slotKey];
      const baseValue = Number(currentRect[field]);
      if (!Number.isFinite(baseValue)) return;
      const nextValue = baseValue + delta;
      setTemplateRectField(slotKey, field, String(nextValue));
    },
    [previewTemplateImageLayout, setTemplateRectField]
  );

  const setTemplateLayoutColor = useCallback(
    (key: TemplateColorKey, value: string) => {
      const nextLayout = {
        ...previewTemplateImageLayout,
        [key]: value,
      };
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [previewTemplateImageLayout, updateActiveTemplatePreset]
  );

  const setTemplateLayoutAlign = useCallback(
    (key: TemplateAlignKey, raw: string) => {
      const normalized: "left" | "center" | "right" = raw === "left" || raw === "right" ? raw : "center";
      const nextLayout = {
        ...previewTemplateImageLayout,
        [key]: normalized,
      };
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
          templateLayoutJson: serializeTemplateLayoutForEditor(nextLayout),
        }),
        { trackHistory: true }
      );
    },
    [previewTemplateImageLayout, updateActiveTemplatePreset]
  );

  const setTemplateLayoutApplyField = useCallback(
    (field: keyof TemplateLayoutApply, checked: boolean) => {
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateLayoutApply: {
            ...currentPreset.templateLayoutApply,
            [field]: checked,
          },
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const setTemplateImageEnabled = useCallback(
    (checked: boolean) => {
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateImageEnabled: checked,
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const setActiveTemplateData = useCallback(
    (value: unknown) => {
      updateActiveTemplatePreset(
        (currentPreset) => ({
          ...currentPreset,
          templateData: value as CategoryTemplatePreset["templateData"],
        }),
        { trackHistory: true }
      );
    },
    [updateActiveTemplatePreset]
  );

  const resolveTemplateFontWeightValue = useCallback(
    (key: TemplateFontWeightKey) => previewTemplateImageLayout[key] ?? getTemplateFontWeightFallback(key, activeTemplatePreset.templateImageEnabled),
    [activeTemplatePreset.templateImageEnabled, previewTemplateImageLayout]
  );

  const resolveTemplateColorValue = useCallback(
    (key: TemplateColorKey) => getTemplateColorValue(previewTemplateImageLayout, key, activeTemplatePreset.templateImageEnabled),
    [activeTemplatePreset.templateImageEnabled, previewTemplateImageLayout]
  );

  const copySelectedSlotRect = useCallback(() => {
    setSlotRectClipboard({ ...selectedRect });
    setMessage(`${selectedSlotLabel} 좌표를 복사했습니다.`);
  }, [selectedRect, selectedSlotLabel, setMessage]);

  const pasteSelectedSlotRect = useCallback(() => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    if (!slotRectClipboard) {
      setMessage("먼저 슬롯 좌표를 복사하세요.");
      return;
    }
    commitTemplateRect(selectedRectSlot, slotRectClipboard);
    setMessage(`${selectedSlotLabel}에 복사한 좌표를 적용했습니다.`);
  }, [canEditSelectedCategory, commitTemplateRect, selectedCategoryPermissionMessage, selectedRectSlot, selectedSlotLabel, setMessage, slotRectClipboard]);

  const resetSelectedSlotRect = useCallback(() => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    commitTemplateRect(selectedRectSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT[selectedRectSlot]);
    setMessage(`${selectedSlotLabel}을 기본 좌표로 복원했습니다.`);
  }, [canEditSelectedCategory, commitTemplateRect, selectedCategoryPermissionMessage, selectedRectSlot, selectedSlotLabel, setMessage]);

  const cycleSelectedSlot = useCallback(
    (direction: 1 | -1) => {
      setSelectedRectSlot(getNextEditableRectSlot(selectedRectSlot, direction));
    },
    [selectedRectSlot, setSelectedRectSlot]
  );

  const alignSelectedSlotRect = useCallback(
    (axis: "x" | "y", mode: "start" | "center" | "end") => {
      if (!canEditSelectedCategory) {
        setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
        return;
      }
      const currentRect = previewTemplateImageLayout[selectedRectSlot];
      if (!currentRect) return;
      const nextRect = getAlignedLayoutRect(currentRect, axis, mode);
      commitTemplateRect(selectedRectSlot, nextRect);
      const axisLabel = axis === "x" ? "가로" : "세로";
      const modeLabel = mode === "start" ? "시작" : mode === "center" ? "중앙" : "끝";
      setMessage(`${selectedSlotLabel} ${axisLabel} 정렬을 ${modeLabel}으로 맞췄습니다.`);
    },
    [canEditSelectedCategory, commitTemplateRect, previewTemplateImageLayout, selectedCategoryPermissionMessage, selectedRectSlot, selectedSlotLabel, setMessage]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const context = dragContextRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      const rect = toRectFromPointer(context, event.clientX, event.clientY, sanitizeRect);
      context.currentRect = rect;
      setDragPreview({ slotKey: context.slotKey, rect });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const context = dragContextRef.current;
      if (!context || context.pointerId !== event.pointerId) return;
      dragContextRef.current = null;
      setDragPreview(null);
      if (!isSameRect(context.startRect, context.currentRect)) {
        commitTemplateRect(context.slotKey, context.currentRect);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [commitTemplateRect, dragContextRef]);

  useEffect(() => {
    const handleOverlayShortcut = (event: KeyboardEvent) => {
      const isEditableTarget =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || ["input", "textarea", "select"].includes(event.target.tagName.toLowerCase()));
      const intent = resolveLayoutStudioOverlayShortcut({
        activeTemplateSupportsOverlayEditor,
        isEditableTextTarget: isEditableTarget,
        rectNudgeStep,
        showCommandPalette,
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
      if (!intent) return;
      event.preventDefault();
      if (intent.type === "select-slot") {
        setSelectedRectSlot(intent.slotKey);
        setActiveInspectorTab("element");
        return;
      }
      if (intent.type === "cycle-slot") {
        cycleSelectedSlot(intent.direction);
        setActiveInspectorTab("element");
        return;
      }
      if (intent.type === "nudge-slot") {
        nudgeTemplateRectField(selectedRectSlot, intent.field, intent.delta);
        return;
      }
      if (intent.type === "reset-slot") {
        resetSelectedSlotRect();
        return;
      }
      if (intent.type === "copy-slot") {
        copySelectedSlotRect();
        return;
      }
      if (intent.type === "paste-slot") {
        pasteSelectedSlotRect();
      }
    };

    window.addEventListener("keydown", handleOverlayShortcut);
    return () => {
      window.removeEventListener("keydown", handleOverlayShortcut);
    };
  }, [
    activeTemplateSupportsOverlayEditor,
    copySelectedSlotRect,
    cycleSelectedSlot,
    nudgeTemplateRectField,
    pasteSelectedSlotRect,
    rectNudgeStep,
    resetSelectedSlotRect,
    selectedRectSlot,
    setActiveInspectorTab,
    setSelectedRectSlot,
    showCommandPalette,
  ]);

  const handleSlotPointerDown = useCallback(
    (slotKey: EditableRectSlotKey, mode: DragMode) =>
      (event: React.PointerEvent<HTMLElement>) => {
        if (isHandToolPressed) return;
        if (!activeTemplateSupportsOverlayEditor) return;
        if (!canEditSelectedCategory) {
          setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
          return;
        }
        if (!previewStageRef.current) return;
        const bounds = previewStageRef.current.getBoundingClientRect();
        const startRect = previewTemplateImageLayout[slotKey];
        setSelectedRectSlot(slotKey);
        setActiveInspectorTab("element");
        dragContextRef.current = {
          slotKey,
          mode,
          pointerId: event.pointerId,
          originX: event.clientX,
          originY: event.clientY,
          bounds,
          startRect: { ...startRect },
          currentRect: { ...startRect },
        };
        setDragPreview({ slotKey, rect: startRect });
        event.preventDefault();
        event.stopPropagation();
      },
    [
      activeTemplateSupportsOverlayEditor,
      canEditSelectedCategory,
      dragContextRef,
      isHandToolPressed,
      previewStageRef,
      previewTemplateImageLayout,
      selectedCategoryPermissionMessage,
      setActiveInspectorTab,
      setMessage,
      setSelectedRectSlot,
    ]
  );

  return {
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
    slotRectClipboard: Boolean(slotRectClipboard),
  };
}
