export type InspectorTabKey = "element" | "geometry" | "style" | "advanced";

export type InspectorSectionKey =
  | "elementSlots"
  | "elementGeometry"
  | "elementTypography"
  | "geometrySlots"
  | "geometryFields"
  | "styleImage"
  | "styleApply"
  | "styleFontSize"
  | "styleWeight"
  | "styleColor"
  | "styleAlign"
  | "styleTemplateOptions"
  | "advancedTemplateManager"
  | "advancedJson";

export const DEFAULT_COLLAPSED_INSPECTOR_SECTIONS: Record<InspectorSectionKey, boolean> = {
  elementSlots: false,
  elementGeometry: false,
  elementTypography: false,
  geometrySlots: false,
  geometryFields: false,
  styleImage: false,
  styleApply: false,
  styleFontSize: false,
  styleWeight: true,
  styleColor: true,
  styleAlign: true,
  styleTemplateOptions: true,
  advancedTemplateManager: false,
  advancedJson: false,
};

const INSPECTOR_SECTIONS_BY_TAB: Record<InspectorTabKey, InspectorSectionKey[]> = {
  element: ["elementSlots", "elementGeometry", "elementTypography"],
  geometry: ["geometrySlots", "geometryFields"],
  style: ["styleImage", "styleApply", "styleFontSize", "styleWeight", "styleColor", "styleAlign", "styleTemplateOptions"],
  advanced: ["advancedTemplateManager", "advancedJson"],
};

export type LayoutStudioInspectorVisibility = {
  normalizedInspectorQuery: string;
  isInspectorSearchActive: boolean;
  currentInspectorSectionKeys: InspectorSectionKey[];
  showElementSlotsSection: boolean;
  showElementGeometrySection: boolean;
  showElementTypographySection: boolean;
  hasElementInspectorResult: boolean;
  showGeometrySlotsSection: boolean;
  showGeometryFieldsSection: boolean;
  hasGeometryInspectorResult: boolean;
  showStyleImageSection: boolean;
  showStyleApplySection: boolean;
  showStyleFontSection: boolean;
  showStyleWeightSection: boolean;
  showStyleColorSection: boolean;
  showStyleAlignSection: boolean;
  showStyleTemplateSection: boolean;
  hasStyleInspectorResult: boolean;
  showAdvancedTemplateSection: boolean;
  showAdvancedJsonSection: boolean;
  hasAdvancedInspectorResult: boolean;
};

function matchesLayoutStudioInspectorQuery(normalizedInspectorQuery: string, keywords: string[]): boolean {
  if (!normalizedInspectorQuery) return true;
  return keywords.some((keyword) => keyword.toLowerCase().includes(normalizedInspectorQuery));
}

export function getCurrentLayoutStudioInspectorSectionKeys(
  activeInspectorTab: InspectorTabKey,
  activeTemplateSupportsOverlayEditor: boolean
): InspectorSectionKey[] {
  if (!activeTemplateSupportsOverlayEditor && (activeInspectorTab === "geometry" || activeInspectorTab === "element")) {
    return [];
  }
  return INSPECTOR_SECTIONS_BY_TAB[activeInspectorTab];
}

export function isLayoutStudioInspectorSectionVisible(
  collapsedInspectorSections: Record<InspectorSectionKey, boolean>,
  sectionKey: InspectorSectionKey,
  isInspectorSearchActive: boolean
): boolean {
  return !collapsedInspectorSections[sectionKey] || isInspectorSearchActive;
}

export function toggleLayoutStudioInspectorSection(
  collapsedInspectorSections: Record<InspectorSectionKey, boolean>,
  sectionKey: InspectorSectionKey
): Record<InspectorSectionKey, boolean> {
  return {
    ...collapsedInspectorSections,
    [sectionKey]: !collapsedInspectorSections[sectionKey],
  };
}

export function setLayoutStudioInspectorSectionsCollapsed(
  collapsedInspectorSections: Record<InspectorSectionKey, boolean>,
  sectionKeys: InspectorSectionKey[],
  collapsed: boolean
): Record<InspectorSectionKey, boolean> {
  if (sectionKeys.length === 0) return collapsedInspectorSections;
  const next = { ...collapsedInspectorSections };
  for (const sectionKey of sectionKeys) {
    next[sectionKey] = collapsed;
  }
  return next;
}

export function buildLayoutStudioInspectorVisibility(input: {
  inspectorSearchQuery: string;
  activeInspectorTab: InspectorTabKey;
  activeTemplateSupportsOverlayEditor: boolean;
  selectedSlotHasTypographyControls: boolean;
}): LayoutStudioInspectorVisibility {
  const normalizedInspectorQuery = input.inspectorSearchQuery.trim().toLowerCase();
  const isInspectorSearchActive = normalizedInspectorQuery.length > 0;
  const currentInspectorSectionKeys = getCurrentLayoutStudioInspectorSectionKeys(
    input.activeInspectorTab,
    input.activeTemplateSupportsOverlayEditor
  );

  const showElementSlotsSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["요소", "선택 요소", "슬롯", "레이어", "선택"]);
  const showElementGeometrySection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "위치",
    "크기",
    "좌표",
    "position",
    "size",
    "x",
    "y",
    "w",
    "h",
  ]);
  const showElementTypographySection =
    input.selectedSlotHasTypographyControls &&
    matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
      "텍스트",
      "글자",
      "폰트",
      "색상",
      "정렬",
      "굵기",
      "typography",
      "color",
      "align",
      "weight",
      "bold",
    ]);
  const hasElementInspectorResult = showElementSlotsSection || showElementGeometrySection || showElementTypographySection;

  const showGeometrySlotsSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "슬롯",
    "헤더",
    "제목",
    "정보줄",
    "본문",
    "이미지",
    "선택",
    "복사",
    "붙여넣기",
  ]);
  const showGeometryFieldsSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "좌표",
    "x",
    "y",
    "w",
    "h",
    "크기",
    "위치",
    "단위",
    "미세 이동",
  ]);
  const hasGeometryInspectorResult = showGeometrySlotsSection || showGeometryFieldsSection;

  const showStyleImageSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["이미지", "업로드", "템플릿 이미지", "사용"]);
  const showStyleApplySection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "적용 범위",
    "제목 반영",
    "본문 반영",
    "이미지 반영",
    "정보줄 반영",
  ]);
  const showStyleFontSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["폰트", "크기", "제목", "본문", "헤더", "정보줄"]);
  const showStyleWeightSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["굵기", "볼드", "weight", "fontweight"]);
  const showStyleColorSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "색상",
    "titlecolor",
    "bodycolor",
    "infocolor",
    "headertitlecolor",
    "headeraccentcolor",
  ]);
  const showStyleAlignSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["정렬", "왼쪽", "가운데", "오른쪽"]);
  const showStyleTemplateSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["템플릿 세부 설정", "세부", "설정", "template", "힌트"]);
  const hasStyleInspectorResult =
    showStyleImageSection ||
    showStyleApplySection ||
    showStyleFontSection ||
    showStyleWeightSection ||
    showStyleColorSection ||
    showStyleAlignSection ||
    showStyleTemplateSection;

  const showAdvancedTemplateSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, [
    "템플릿",
    "기능",
    "자막",
    "장식",
    "강조",
    "조합",
    "설정",
  ]);
  const showAdvancedJsonSection = matchesLayoutStudioInspectorQuery(normalizedInspectorQuery, ["json", "고급", "레이아웃", "슬롯", "template"]);
  const hasAdvancedInspectorResult = showAdvancedTemplateSection || showAdvancedJsonSection;

  return {
    normalizedInspectorQuery,
    isInspectorSearchActive,
    currentInspectorSectionKeys,
    showElementSlotsSection,
    showElementGeometrySection,
    showElementTypographySection,
    hasElementInspectorResult,
    showGeometrySlotsSection,
    showGeometryFieldsSection,
    hasGeometryInspectorResult,
    showStyleImageSection,
    showStyleApplySection,
    showStyleFontSection,
    showStyleWeightSection,
    showStyleColorSection,
    showStyleAlignSection,
    showStyleTemplateSection,
    hasStyleInspectorResult,
    showAdvancedTemplateSection,
    showAdvancedJsonSection,
    hasAdvancedInspectorResult,
  };
}
