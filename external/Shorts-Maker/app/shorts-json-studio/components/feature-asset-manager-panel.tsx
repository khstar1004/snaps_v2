"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyStudioCaptionFeatureDocument,
  applyStudioOverlayFeatureDocument,
  getStudioCaptionFeatureDocument,
  getStudioOverlayFeatureDocument,
} from "@/types/studio-feature-document";
import type {
  StudioCaptionFeatureDocument,
  StudioOverlayFeatureDocument,
} from "@/types/studio-feature-document";
import type { StudioTemplateId, StudioTemplatePayload } from "../types";

const CAPTION_FEATURE_PRESET_STORAGE_KEY = "studio-caption-feature-presets-v1";
const OVERLAY_FEATURE_PRESET_STORAGE_KEY = "studio-overlay-feature-presets-v1";

type StoredCaptionFeaturePreset = {
  id: string;
  name: string;
  createdAt: string;
  data: {
    topCaptionScale: number;
    mainCaptionScale: number;
    topCaptionBgOpacity: number;
    captionStyle: "neon-pink" | "flame-gold" | "bubble-pink" | "bold-yellow";
    animationPreset: "pop" | "slide-up" | "bounce" | "pulse";
    mainCaptionColor: string;
    mainCaptionStrokeColor: string;
    mainCaptionStrokeWidth: number;
    mainCaptionGlow: number;
    autoCaptionProfile: "off" | "hook" | "reaction" | "news";
    autoCaptionIntensity: number;
    autoHighlightEnabled: boolean;
    autoHighlightColor: string;
    autoHighlightScale: number;
    topCaptionTextColor: string;
    topCaptionBgColor: string;
    captionLineHeight: number;
    cueDurationSec: number;
  };
};

type StoredOverlayFeaturePreset = {
  id: string;
  name: string;
  createdAt: string;
  data: {
    overlayPreset: "none" | "hearts" | "fire" | "spark";
    overlayPlacement: "center" | "bottom" | "full";
    overlayOpacity: number;
    overlayScale: number;
    overlayDensity: number;
  };
};

type FeatureAssetManagerPanelProps = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  onChangeAction: (value: StudioTemplatePayload) => void;
};

export function FeatureAssetManagerPanel({
  templateId,
  templateData,
  onChangeAction,
}: FeatureAssetManagerPanelProps) {
  const [captionPresets, setCaptionPresets] = useState<StoredCaptionFeaturePreset[]>([]);
  const [overlayPresets, setOverlayPresets] = useState<StoredOverlayFeaturePreset[]>([]);
  const [selectedCaptionPresetId, setSelectedCaptionPresetId] = useState("");
  const [selectedOverlayPresetId, setSelectedOverlayPresetId] = useState("");

  useEffect(() => {
    try {
      const rawCaption = window.localStorage.getItem(CAPTION_FEATURE_PRESET_STORAGE_KEY);
      const parsedCaption = rawCaption ? (JSON.parse(rawCaption) as StoredCaptionFeaturePreset[]) : [];
      setCaptionPresets(Array.isArray(parsedCaption) ? parsedCaption.filter(isCaptionPreset) : []);
    } catch {
      setCaptionPresets([]);
    }

    try {
      const rawOverlay = window.localStorage.getItem(OVERLAY_FEATURE_PRESET_STORAGE_KEY);
      const parsedOverlay = rawOverlay ? (JSON.parse(rawOverlay) as StoredOverlayFeaturePreset[]) : [];
      setOverlayPresets(Array.isArray(parsedOverlay) ? parsedOverlay.filter(isOverlayPreset) : []);
    } catch {
      setOverlayPresets([]);
    }
  }, []);

  const captionFeatureDoc = getStudioCaptionFeatureDocument(templateId, templateData);
  const overlayFeatureDoc = getStudioOverlayFeatureDocument(templateId, templateData);
  const selectedCaptionPreset = useMemo(
    () => captionPresets.find((preset) => preset.id === selectedCaptionPresetId) || null,
    [captionPresets, selectedCaptionPresetId],
  );
  const selectedOverlayPreset = useMemo(
    () => overlayPresets.find((preset) => preset.id === selectedOverlayPresetId) || null,
    [overlayPresets, selectedOverlayPresetId],
  );

  if (!captionFeatureDoc && !overlayFeatureDoc) {
    return null;
  }

  return (
    <section className="studio-feature-asset-shell">
      <div className="studio-feature-asset-copy">
        <div className="studio-feature-asset-title">저장해둔 기능 불러오기</div>
        <div className="studio-feature-asset-description">
          전에 저장한 자막 스타일이나 장식 효과를 지금 템플릿에 바로 가져옵니다.
        </div>
      </div>

      {captionFeatureDoc ? (
        <div className="studio-feature-asset-card">
          <div className="studio-feature-asset-card-copy">
            <div className="studio-feature-asset-card-title">저장한 자막 설정</div>
            <div className="studio-feature-asset-card-description">
              저장해둔 자막 스타일을 지금 템플릿에 바로 적용합니다.
            </div>
          </div>
          <div className="studio-feature-asset-row">
            <select
              className="input-field"
              value={selectedCaptionPresetId}
              onChange={(event) => setSelectedCaptionPresetId(event.target.value)}
            >
              <option value="">저장한 자막 설정 선택</option>
              {captionPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!selectedCaptionPreset}
              onClick={() => {
                if (!selectedCaptionPreset) return;
                onChangeAction(
                  applyStudioCaptionFeatureDocument(
                    templateId,
                    templateData,
                    toCaptionFeatureDocument(selectedCaptionPreset.data),
                  ),
                );
              }}
            >
              지금 템플릿에 적용
            </button>
          </div>
          <FeatureDocSummary
            items={[
              `스타일 ${captionFeatureDoc.stylePreset}`,
              `등장 방식 ${captionFeatureDoc.animationPreset}`,
              `자동 강조 ${captionFeatureDoc.autoCaptionProfile}`,
              `문장 유지 ${captionFeatureDoc.cueDurationSec.toFixed(2)}초`,
            ]}
          />
        </div>
      ) : null}

      {overlayFeatureDoc ? (
        <div className="studio-feature-asset-card">
          <div className="studio-feature-asset-card-copy">
            <div className="studio-feature-asset-card-title">저장한 장식 효과</div>
            <div className="studio-feature-asset-card-description">
              저장해둔 하트, 불꽃 같은 장식 효과를 지금 템플릿에 바로 적용합니다.
            </div>
          </div>
          <div className="studio-feature-asset-row">
            <select
              className="input-field"
              value={selectedOverlayPresetId}
              onChange={(event) => setSelectedOverlayPresetId(event.target.value)}
            >
              <option value="">저장한 장식 효과 선택</option>
              {overlayPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!selectedOverlayPreset}
              onClick={() => {
                if (!selectedOverlayPreset) return;
                onChangeAction(
                  applyStudioOverlayFeatureDocument(
                    templateId,
                    templateData,
                    toOverlayFeatureDocument(selectedOverlayPreset.data),
                  ),
                );
              }}
            >
              지금 템플릿에 적용
            </button>
          </div>
          <FeatureDocSummary
            items={[
              `효과 종류 ${overlayFeatureDoc.preset}`,
              `위치 ${overlayFeatureDoc.placement}`,
              `진하기 ${overlayFeatureDoc.opacity.toFixed(2)}`,
              `개수 ${overlayFeatureDoc.density.toFixed(2)}`,
            ]}
          />
        </div>
      ) : null}
    </section>
  );
}

function FeatureDocSummary({ items }: { items: string[] }) {
  return (
    <div className="studio-feature-asset-pill-row">
      {items.map((item) => (
        <span key={item} className="studio-feature-asset-pill">
          {item}
        </span>
      ))}
    </div>
  );
}

function toCaptionFeatureDocument(data: StoredCaptionFeaturePreset["data"]): StudioCaptionFeatureDocument {
  return {
    stylePreset: data.captionStyle,
    animationPreset: data.animationPreset,
    topCaptionScale: data.topCaptionScale,
    mainCaptionScale: data.mainCaptionScale,
    topCaptionBgOpacity: data.topCaptionBgOpacity,
    mainCaptionColor: data.mainCaptionColor,
    mainCaptionStrokeColor: data.mainCaptionStrokeColor,
    mainCaptionStrokeWidth: data.mainCaptionStrokeWidth,
    mainCaptionGlow: data.mainCaptionGlow,
    topCaptionTextColor: data.topCaptionTextColor,
    topCaptionBgColor: data.topCaptionBgColor,
    captionLineHeight: data.captionLineHeight,
    cueDurationSec: data.cueDurationSec,
    autoCaptionProfile: data.autoCaptionProfile,
    autoCaptionIntensity: data.autoCaptionIntensity,
    autoHighlightEnabled: data.autoHighlightEnabled,
    autoHighlightColor: data.autoHighlightColor,
    autoHighlightScale: data.autoHighlightScale,
  };
}

function toOverlayFeatureDocument(data: StoredOverlayFeaturePreset["data"]): StudioOverlayFeatureDocument {
  return {
    preset: data.overlayPreset,
    placement: data.overlayPlacement,
    opacity: data.overlayOpacity,
    scale: data.overlayScale,
    density: data.overlayDensity,
  };
}

function isCaptionPreset(value: unknown): value is StoredCaptionFeaturePreset {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { name?: unknown }).name === "string" &&
      (value as { data?: unknown }).data &&
      typeof (value as { data?: unknown }).data === "object",
  );
}

function isOverlayPreset(value: unknown): value is StoredOverlayFeaturePreset {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { name?: unknown }).name === "string" &&
      (value as { data?: unknown }).data &&
      typeof (value as { data?: unknown }).data === "object",
  );
}
