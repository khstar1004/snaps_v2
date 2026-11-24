"use client";

import { type RefObject } from "react";
import type { InspectorTabKey, InspectorSectionKey } from "@/app/layout-studio/layout-studio-inspector";
import {
  LayoutStudioElementInspectorPanel,
  LayoutStudioStyleInspectorPanel,
} from "@/app/layout-studio/layout-studio-inspector-primary-panels";
import {
  LayoutStudioAdvancedInspectorPanel as LayoutStudioAdvancedInspectorPanelSecondary,
  LayoutStudioGeometryInspectorPanel,
} from "@/app/layout-studio/layout-studio-inspector-secondary-panels";

type ElementPanelProps = Parameters<typeof LayoutStudioElementInspectorPanel>[0];
type GeometryPanelProps = Parameters<typeof LayoutStudioGeometryInspectorPanel>[0];
type StylePanelProps = Parameters<typeof LayoutStudioStyleInspectorPanel>[0];
type AdvancedPanelProps = Parameters<typeof LayoutStudioAdvancedInspectorPanelSecondary>[0];

type LayoutStudioWorkbenchInspectorProps = {
  activeInspectorTab: InspectorTabKey;
  canEditSelectedCategory: boolean;
  currentInspectorSectionKeys: InspectorSectionKey[];
  inspectorSearchInputRef: RefObject<HTMLInputElement | null>;
  inspectorSearchQuery: string;
  isInspectorSearchActive: boolean;
  loading: boolean;
  onClearInspectorSearch: () => void;
  onSetActiveInspectorTab: (tab: InspectorTabKey) => void;
  onSetCurrentInspectorSectionsCollapsed: (collapsed: boolean) => void;
  onSetInspectorSearchQuery: (value: string) => void;
  elementPanelProps: ElementPanelProps;
  geometryPanelProps: GeometryPanelProps;
  stylePanelProps: StylePanelProps;
  advancedPanelProps: AdvancedPanelProps;
};

export function LayoutStudioWorkbenchInspector(props: LayoutStudioWorkbenchInspectorProps) {
  const {
    activeInspectorTab,
    canEditSelectedCategory,
    currentInspectorSectionKeys,
    inspectorSearchInputRef,
    inspectorSearchQuery,
    isInspectorSearchActive,
    loading,
    onClearInspectorSearch,
    onSetActiveInspectorTab,
    onSetCurrentInspectorSectionsCollapsed,
    onSetInspectorSearchQuery,
    elementPanelProps,
    geometryPanelProps,
    stylePanelProps,
    advancedPanelProps,
  } = props;

  return (
    <aside className="studio-layout-workbench-inspector">
      <div className="studio-layout-workbench-inspector-head">
        <h2>인스펙터</h2>
        <p>선택한 요소를 바로 편집하고, 전체 레이아웃 옵션과 JSON을 탭으로 분리해 빠르게 작업합니다.</p>
        <div className="studio-layout-workbench-inspector-search">
          <input
            ref={inspectorSearchInputRef}
            className="input-field"
            value={inspectorSearchQuery}
            onChange={(event) => onSetInspectorSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              onClearInspectorSearch();
              inspectorSearchInputRef.current?.blur();
            }}
            placeholder="인스펙터 검색 (예: 좌표, 색상, 정렬, JSON)"
          />
          {isInspectorSearchActive ? (
            <button type="button" className="btn-secondary" onClick={onClearInspectorSearch}>
              지우기
            </button>
          ) : null}
        </div>
        <div className="studio-layout-workbench-inspector-tools">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onSetCurrentInspectorSectionsCollapsed(false)}
            disabled={currentInspectorSectionKeys.length === 0}
          >
            섹션 펼치기
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onSetCurrentInspectorSectionsCollapsed(true)}
            disabled={currentInspectorSectionKeys.length === 0 || isInspectorSearchActive}
          >
            섹션 접기
          </button>
          <small>검색 단축키: Ctrl/Cmd + F 또는 /</small>
        </div>
      </div>
      <div className="studio-template-tab-row studio-layout-workbench-tab-row" role="tablist" aria-label="우측 인스펙터 탭">
        {[
          { key: "element", label: "요소" },
          { key: "style", label: "레이아웃 옵션" },
          { key: "advanced", label: "고급 JSON" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeInspectorTab === tab.key}
            className={`studio-template-tab${activeInspectorTab === tab.key ? " is-active" : ""}`}
            onClick={() => onSetActiveInspectorTab(tab.key as InspectorTabKey)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <fieldset disabled={!canEditSelectedCategory || loading} className="studio-branding-fieldset-reset studio-layout-workbench-inspector-scroll">
        {activeInspectorTab === "element" ? <LayoutStudioElementInspectorPanel {...elementPanelProps} /> : null}
        {activeInspectorTab === "geometry" ? <LayoutStudioGeometryInspectorPanel {...geometryPanelProps} /> : null}
        {activeInspectorTab === "style" ? <LayoutStudioStyleInspectorPanel {...stylePanelProps} /> : null}
        {activeInspectorTab === "advanced" ? <LayoutStudioAdvancedInspectorPanelSecondary {...advancedPanelProps} /> : null}
      </fieldset>
    </aside>
  );
}
