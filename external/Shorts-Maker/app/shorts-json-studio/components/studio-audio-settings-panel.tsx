"use client";

import { useRef, useState } from "react";
import type { StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import {
  STUDIO_AUDIO_MIX_PRESETS,
  getStudioAudioMixPreset,
  normalizeStudioBgmVolume,
} from "@/lib/studio/audio-mix-presets";

type StudioAudioSettingsPanelProps = {
  openByDefault?: boolean;
  busy: boolean;
  hasPreparedSlides: boolean;
  canEditSelectedCategory: boolean;
  bgmEnabled: boolean;
  selectedBgmTrack: string;
  bgmVolume: number;
  mixPresetId: string;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  sfxAutoLevel: StudioSfxAutoLevel;
  onAutoPlanSfxAction: () => void;
  onBgmEnabledChangeAction: (checked: boolean) => void;
  onBgmTrackChangeAction: (value: string) => void;
  onBgmVolumeChangeAction: (value: number) => void;
  onMixPresetChangeAction: (value: string) => void;
  onSfxEnabledChangeAction: (checked: boolean) => void;
  onSfxMasterGainChangeAction: (value: number) => void;
  onSfxAutoLevelChangeAction: (value: StudioSfxAutoLevel) => void;
};

const SFX_AUTO_LEVEL_OPTIONS: Array<{ value: StudioSfxAutoLevel; label: string }> = [
  { value: "sparse", label: "적게" },
  { value: "balanced", label: "보통" },
  { value: "dense", label: "많이" },
];

export function StudioAudioSettingsPanel({
  openByDefault = false,
  busy,
  hasPreparedSlides,
  canEditSelectedCategory,
  bgmEnabled,
  selectedBgmTrack,
  bgmVolume,
  mixPresetId,
  sfxEnabled,
  sfxMasterGainDb,
  sfxAutoLevel,
  onAutoPlanSfxAction,
  onBgmEnabledChangeAction,
  onBgmTrackChangeAction,
  onBgmVolumeChangeAction,
  onMixPresetChangeAction,
  onSfxEnabledChangeAction,
  onSfxMasterGainChangeAction,
  onSfxAutoLevelChangeAction,
}: StudioAudioSettingsPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(openByDefault);
  const [bgmPreviewPlaying, setBgmPreviewPlaying] = useState(false);
  const [bgmPreviewError, setBgmPreviewError] = useState("");
  const bgmPreviewRef = useRef<HTMLAudioElement | null>(null);
  const sfxActionLabel = busy ? "작업 중" : "SFX 다시 배정";
  const controlsDisabled = busy || !canEditSelectedCategory;
  const selectedBgmOption =
    STUDIO_BGM_OPTIONS.find((option) => option.id === selectedBgmTrack) || STUDIO_BGM_OPTIONS[0];
  const normalizedBgmVolume = normalizeStudioBgmVolume(bgmVolume, mixPresetId);
  const bgmVolumePercent = Math.round(normalizedBgmVolume * 100);

  const stopBgmPreview = () => {
    const audio = bgmPreviewRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setBgmPreviewPlaying(false);
  };

  const toggleBgmPreview = () => {
    const audio = bgmPreviewRef.current;
    if (!audio) return;
    setBgmPreviewError("");
    if (!audio.paused) {
      stopBgmPreview();
      return;
    }
    audio.volume = normalizedBgmVolume;
    void audio.play().catch(() => {
      setBgmPreviewPlaying(false);
      setBgmPreviewError("BGM 파일을 재생하지 못했습니다.");
    });
  };

  return (
    <>
      <details
        className="studio-result-audio-details"
        open={settingsOpen}
        onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
      >
        <summary className="studio-result-audio-summary">오디오 설정 (BGM/SFX)</summary>
        <div className="studio-result-video-audio-grid">
          <div className="studio-result-audio-card">
            <label htmlFor="studio-result-bgm-track" className="studio-result-audio-title">배경음악(BGM)</label>
            <label className="studio-result-check-label">
              <input
                type="checkbox"
                checked={bgmEnabled}
                onChange={(event) => {
                  if (!event.target.checked) stopBgmPreview();
                  onBgmEnabledChangeAction(event.target.checked);
                }}
                disabled={controlsDisabled}
              />
              BGM 켜기
            </label>
            <select
              id="studio-result-bgm-track"
              className="input-field"
              value={selectedBgmTrack}
              onChange={(event) => {
                stopBgmPreview();
                setBgmPreviewError("");
                onBgmTrackChangeAction(event.target.value);
              }}
              disabled={controlsDisabled || !bgmEnabled}
            >
              {STUDIO_BGM_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <label htmlFor="studio-result-bgm-volume" className="studio-result-audio-help">
              BGM 볼륨 {bgmVolumePercent}%
            </label>
            <input
              id="studio-result-bgm-volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={normalizedBgmVolume}
              onChange={(event) => {
                const next = normalizeStudioBgmVolume(event.target.value, mixPresetId);
                if (bgmPreviewRef.current) bgmPreviewRef.current.volume = next;
                onBgmVolumeChangeAction(next);
              }}
              disabled={controlsDisabled || !bgmEnabled}
              aria-label={`BGM 볼륨 ${bgmVolumePercent}%`}
            />
            <div className="studio-result-video-action-row">
              <button
                type="button"
                className="btn-secondary studio-result-compact-btn"
                onClick={toggleBgmPreview}
                disabled={busy || !bgmEnabled || !selectedBgmOption}
              >
                {bgmPreviewPlaying ? "BGM 듣기 중지" : "BGM 단독 듣기"}
              </button>
              <button
                type="button"
                className="btn-secondary studio-result-compact-btn"
                onClick={() => {
                  const presetVolume = getStudioAudioMixPreset(mixPresetId).bgmVolume;
                  if (bgmPreviewRef.current) bgmPreviewRef.current.volume = presetVolume;
                  onBgmVolumeChangeAction(presetVolume);
                }}
                disabled={controlsDisabled || !bgmEnabled}
              >
                프리셋 볼륨으로
              </button>
            </div>
            {selectedBgmOption ? (
              <audio
                ref={bgmPreviewRef}
                src={selectedBgmOption.path}
                preload="metadata"
                onPlay={() => setBgmPreviewPlaying(true)}
                onPause={() => setBgmPreviewPlaying(false)}
                onEnded={() => setBgmPreviewPlaying(false)}
                onError={() => setBgmPreviewError("BGM 파일을 재생하지 못했습니다.")}
              />
            ) : null}
            {bgmPreviewError ? <div className="studio-result-audio-help" role="status">{bgmPreviewError}</div> : null}
          </div>

          <div className="studio-result-audio-card">
            <label htmlFor="studio-result-mix-preset" className="studio-result-audio-title">오디오 프리셋</label>
            <select
              id="studio-result-mix-preset"
              className="input-field"
              value={mixPresetId}
              onChange={(event) => onMixPresetChangeAction(event.target.value)}
              disabled={controlsDisabled}
            >
              {STUDIO_AUDIO_MIX_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="studio-result-audio-card">
            <div className="studio-result-audio-title">효과음(SFX)</div>
            <label className="studio-result-check-label">
              <input
                type="checkbox"
                checked={sfxEnabled}
                onChange={(event) => onSfxEnabledChangeAction(event.target.checked)}
                disabled={controlsDisabled}
              />
              SFX 켜기
            </label>
            <label htmlFor="studio-result-sfx-gain" className="studio-result-audio-help">SFX 전체 게인(dB)</label>
            <input
              id="studio-result-sfx-gain"
              className="input-field"
              type="number"
              min="-24"
              max="12"
              step="0.5"
              value={sfxMasterGainDb}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                onSfxMasterGainChangeAction(next);
              }}
              disabled={controlsDisabled || !sfxEnabled}
            />
            <div className="studio-advanced-speed-presets" role="radiogroup" aria-label="SFX 자동 배정 밀도">
              {SFX_AUTO_LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`studio-advanced-speed-chip${sfxAutoLevel === option.value ? " is-active" : ""}`}
                  role="radio"
                  aria-checked={sfxAutoLevel === option.value}
                  onClick={() => onSfxAutoLevelChangeAction(option.value)}
                  disabled={controlsDisabled || !sfxEnabled}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="studio-result-video-action-row">
        <button
          type="button"
          className="btn-secondary studio-result-compact-btn"
          onClick={onAutoPlanSfxAction}
          disabled={busy || !hasPreparedSlides || !canEditSelectedCategory}
        >
          {sfxActionLabel}
        </button>
      </div>
    </>
  );
}
