"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StudioVoicePicker } from "@/components/studio-voice-picker";
import { requestApi } from "@/lib/ui/api-client";

type Provider = "typecast";

type SettingsRecord = {
  defaultProvider: Provider;
  defaultVoiceId: string;
  previewText: string;
  typecast: {
    apiKey: string;
    defaultVoiceId: string;
    modelId: string;
    defaultLanguage: string;
    defaultEmotionType: string;
    speed: number;
  };
};

type RuntimeSnapshot = {
  provider: Provider;
  reachable: boolean;
  error?: string;
};

type VoiceAsset = {
  id: string;
  provider: Provider;
  name: string;
  description: string;
  previewText: string;
  tags: string[];
  updatedAtMs: number;
  typecast: {
    voiceId: string;
    modelId: string;
    language: string;
    emotionType?: string;
  };
};

type VoiceOption = {
  id: string;
  label: string;
};

type SettingsResponse = {
  ok: boolean;
  settings: SettingsRecord;
  runtime: RuntimeSnapshot;
  voiceAssets: VoiceAsset[];
  voiceOptions: VoiceOption[];
};

type DraftAsset = {
  id?: string;
  provider: Provider;
  name: string;
  description: string;
  previewText: string;
  tagsInput: string;
  typecast: {
    voiceId: string;
    modelId: string;
    language: string;
    emotionType: string;
  };
};

function apiRequest<T extends { ok: boolean }>(input: RequestInfo | URL, body?: unknown, fallback = "요청 처리에 실패했습니다."): Promise<T> {
  return requestApi<T>(
    input,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
    fallback
  );
}

function toDraftAsset(settings: SettingsRecord, asset?: VoiceAsset | null): DraftAsset {
  return {
    id: asset?.id,
    provider: "typecast",
    name: asset?.name || "",
    description: asset?.description || "",
    previewText: asset?.previewText || settings.previewText,
    tagsInput: asset?.tags.join(", ") || "",
    typecast: {
      voiceId: asset?.typecast?.voiceId || settings.typecast.defaultVoiceId || "",
      modelId: asset?.typecast?.modelId || settings.typecast.modelId || "ssfm-v30",
      language: asset?.typecast?.language || settings.typecast.defaultLanguage || "kor",
      emotionType: asset?.typecast?.emotionType || settings.typecast.defaultEmotionType || "smart",
    },
  };
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "시간 정보 없음";
  return new Date(value).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function decodeAudio(base64: string, mimeType: string): Blob {
  const raw = window.atob(base64);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}

function normalizeTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function normalizeSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.5, Math.min(2, value));
}

export function StudioTtsSettingsManager() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [voiceAssets, setVoiceAssets] = useState<VoiceAsset[]>([]);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState("");
  const [previewAudioUrl, setPreviewAudioUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const selectedAsset = useMemo(
    () => voiceAssets.find((asset) => asset.id === selectedAssetId) || null,
    [selectedAssetId, voiceAssets]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<SettingsResponse>("/api/studio/tts/settings", undefined, "TTS 설정을 불러오지 못했습니다.");
      if (!response.ok) {
        throw new Error("TTS 설정을 불러오지 못했습니다.");
      }
      setSettings(response.settings);
      setRuntime(response.runtime);
      setVoiceAssets(response.voiceAssets || []);
      setVoiceOptions(response.voiceOptions || []);
      setDraft((current) => current || toDraftAsset(response.settings));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    };
  }, [previewAudioUrl]);

  const updateSettings = useCallback((updater: (current: SettingsRecord) => SettingsRecord) => {
    setSettings((current) => (current ? updater(current) : current));
  }, []);

  const updateDraft = useCallback((updater: (current: DraftAsset) => DraftAsset) => {
    setDraft((current) => (current ? updater(current) : current));
  }, []);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ ok: boolean; settings: SettingsRecord; runtime: RuntimeSnapshot }>(
        "/api/studio/tts/settings",
        {
          defaultProvider: "typecast",
          defaultVoiceId: settings.defaultVoiceId,
          previewText: settings.previewText,
          typecast: settings.typecast,
        },
        "TTS 설정 저장에 실패했습니다."
      );
      if (!response.ok) {
        throw new Error("TTS 설정 저장에 실패했습니다.");
      }
      setSettings(response.settings);
      setRuntime(response.runtime);
      setStatusMessage("설정을 저장했습니다.");
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }, [loadSettings, settings]);

  const saveVoiceAsset = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("보이스 자산 이름을 입력해 주세요.");
      return;
    }
    if (!draft.typecast.voiceId.trim()) {
      setError("Typecast voice id를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ ok: boolean; voiceAsset: VoiceAsset }>(
        "/api/studio/tts/voices",
        {
          id: draft.id,
          provider: "typecast",
          name: draft.name,
          description: draft.description,
          previewText: draft.previewText,
          tags: normalizeTags(draft.tagsInput),
          typecast: draft.typecast,
        },
        "보이스 자산 저장에 실패했습니다."
      );
      if (!response.ok) {
        throw new Error("보이스 자산 저장에 실패했습니다.");
      }
      setSelectedAssetId(response.voiceAsset.id);
      setDraft(toDraftAsset(settings || {
        defaultProvider: "typecast",
        defaultVoiceId: "",
        previewText: "",
        typecast: { apiKey: "", defaultVoiceId: "", modelId: "ssfm-v30", defaultLanguage: "kor", defaultEmotionType: "smart", speed: 1 },
      }, response.voiceAsset));
      setStatusMessage("보이스 자산을 저장했습니다.");
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }, [draft, loadSettings, settings]);

  const deleteVoiceAsset = useCallback(async () => {
    if (!selectedAssetId || !settings) return;
    setSaving(true);
    setError("");
    try {
      const response = await requestApi<{ ok: boolean }>(
        `/api/studio/tts/voices?id=${encodeURIComponent(selectedAssetId)}`,
        { method: "DELETE" },
        "보이스 자산 삭제에 실패했습니다."
      );
      if (!response.ok) {
        throw new Error("보이스 자산 삭제에 실패했습니다.");
      }
      setSelectedAssetId(null);
      setDraft(toDraftAsset(settings));
      setStatusMessage("보이스 자산을 삭제했습니다.");
      await loadSettings();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setSaving(false);
    }
  }, [loadSettings, selectedAssetId, settings]);

  const importTypecastCatalog = useCallback(async () => {
    setImporting(true);
    setError("");
    try {
      const response = await apiRequest<{ ok: boolean; importedCount: number; voiceAssets: VoiceAsset[] }>(
        "/api/studio/tts/voices",
        {
          action: "import_typecast_catalog",
          limit: 40,
        },
        "Typecast 샘플 보이스를 가져오지 못했습니다."
      );
      setVoiceAssets(response.voiceAssets || []);
      setStatusMessage(`${response.importedCount}개 Typecast 샘플 보이스를 저장했습니다.`);
      await loadSettings();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImporting(false);
    }
  }, [loadSettings]);

  const applyDraftAsDefault = useCallback(async () => {
    if (!settings || !draft) return;
    const nextDefaultVoiceId = draft.id || (draft.typecast.voiceId ? `typecast:voice:${draft.typecast.voiceId}` : "");
    if (!nextDefaultVoiceId) {
      setError("기본값으로 적용할 voice id가 없습니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ ok: boolean; settings: SettingsRecord; runtime: RuntimeSnapshot }>(
        "/api/studio/tts/settings",
        {
          defaultProvider: "typecast",
          defaultVoiceId: nextDefaultVoiceId,
          previewText: settings.previewText,
          typecast: {
            ...settings.typecast,
            defaultVoiceId: draft.typecast.voiceId || settings.typecast.defaultVoiceId,
            modelId: draft.typecast.modelId || settings.typecast.modelId,
            defaultLanguage: draft.typecast.language || settings.typecast.defaultLanguage,
            defaultEmotionType: draft.typecast.emotionType || settings.typecast.defaultEmotionType,
          },
        },
        "기본 음성 적용에 실패했습니다."
      );
      setSettings(response.settings);
      setRuntime(response.runtime);
      setStatusMessage(`${draft.name || draft.typecast.voiceId} 보이스를 기본값으로 적용했습니다.`);
      await loadSettings();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setSaving(false);
    }
  }, [draft, loadSettings, settings]);

  const runPreview = useCallback(async (voiceId: string, text: string) => {
    setPreviewing(voiceId || "default");
    setError("");
    try {
      const response = await apiRequest<{ ok: boolean; audioBase64: string; mimeType: string }>(
        "/api/studio/voice-preview",
        {
          voiceId,
          text,
          typecastEmotionType: settings?.typecast.defaultEmotionType,
          typecastSpeed: settings?.typecast.speed,
        },
        "미리듣기 생성에 실패했습니다."
      );
      if (!response.ok || !response.audioBase64) {
        throw new Error("미리듣기 생성에 실패했습니다.");
      }
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
      const url = URL.createObjectURL(decodeAudio(response.audioBase64, response.mimeType));
      setPreviewAudioUrl(url);
      const audio = new Audio(url);
      await audio.play();
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setPreviewing("");
    }
  }, [previewAudioUrl, settings]);

  if (loading && !settings) {
    return <section className="studio-tts-panel">불러오는 중...</section>;
  }

  if (!settings) {
    return (
      <section className="studio-tts-panel">
        <div className="studio-tts-banner is-error">{error || "TTS 설정을 불러오지 못했습니다."}</div>
        <button type="button" className="btn-secondary" onClick={() => void loadSettings()}>다시 불러오기</button>
      </section>
    );
  }

  const effectiveDefaultVoiceId =
    settings.defaultVoiceId || (settings.typecast.defaultVoiceId ? `typecast:voice:${settings.typecast.defaultVoiceId}` : "");

  return (
    <section className="studio-tts-panel">
      <div className="studio-tts-head">
        <div>
          <h2>Typecast 음성 설정</h2>
          <div className="studio-tts-helper-text">Typecast 보이스, 모델, 감정, 속도와 미리듣기를 관리합니다.</div>
        </div>
        <div className="studio-tts-head-actions">
          <button type="button" className="btn-secondary" onClick={() => void loadSettings()} disabled={loading}>새로고침</button>
          <button type="button" className="btn-primary" onClick={() => void saveSettings()} disabled={saving}>설정 저장</button>
        </div>
      </div>

      {error ? <div className="studio-tts-banner is-error">{error}</div> : null}
      {statusMessage ? <div className="studio-tts-banner is-success">{statusMessage}</div> : null}

      <div className="studio-tts-stats">
        <article className="studio-tts-stat-card"><strong>{runtime?.reachable ? "연결됨" : "확인 필요"}</strong><span>Typecast API</span></article>
        <article className="studio-tts-stat-card"><strong>{voiceOptions.length}</strong><span>선택 가능 보이스</span></article>
        <article className="studio-tts-stat-card"><strong>{voiceAssets.length}</strong><span>저장된 보이스 자산</span></article>
      </div>

      {runtime?.error ? <div className="studio-tts-banner is-warning">{runtime.error}</div> : null}

      <div className="studio-tts-settings-grid">
        <div className="studio-tts-field">
          <span>기본 보이스</span>
          <StudioVoicePicker
            id="studio-tts-default-voice"
            value={settings.defaultVoiceId}
            options={voiceOptions}
            emptyLabel="기본 voice 사용"
            onChangeAction={(nextVoiceId) => updateSettings((current) => ({ ...current, defaultVoiceId: nextVoiceId }))}
          />
        </div>
        <label className="studio-tts-field">
          <span>API Key</span>
          <input className="input-field" type="password" value={settings.typecast.apiKey} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, apiKey: event.target.value } }))} />
        </label>
        <label className="studio-tts-field">
          <span>기본 voice id</span>
          <input className="input-field" value={settings.typecast.defaultVoiceId} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, defaultVoiceId: event.target.value } }))} />
        </label>
        <label className="studio-tts-field">
          <span>모델</span>
          <input className="input-field" value={settings.typecast.modelId} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, modelId: event.target.value } }))} />
        </label>
        <label className="studio-tts-field">
          <span>언어</span>
          <input className="input-field" value={settings.typecast.defaultLanguage} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, defaultLanguage: event.target.value } }))} />
        </label>
        <label className="studio-tts-field">
          <span>감정</span>
          <input className="input-field" value={settings.typecast.defaultEmotionType} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, defaultEmotionType: event.target.value } }))} />
        </label>
        <label className="studio-tts-field">
          <span>속도</span>
          <input className="input-field" type="number" min="0.5" max="2" step="0.05" value={settings.typecast.speed} onChange={(event) => updateSettings((current) => ({ ...current, typecast: { ...current.typecast, speed: normalizeSpeed(Number(event.target.value)) } }))} />
        </label>
        <label className="studio-tts-field studio-tts-field-span-2">
          <span>미리듣기 문장</span>
          <textarea className="input-field studio-tts-textarea" value={settings.previewText} onChange={(event) => updateSettings((current) => ({ ...current, previewText: event.target.value }))} />
        </label>
      </div>

      <div className="studio-tts-toolbar">
        <button type="button" className="btn-secondary" onClick={() => void runPreview(effectiveDefaultVoiceId, settings.previewText)} disabled={previewing !== ""}>
          {previewing ? "생성 중..." : "기본 음성 미리듣기"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void importTypecastCatalog()} disabled={importing || saving}>
          {importing ? "가져오는 중..." : "Typecast 샘플 보이스 가져오기"}
        </button>
        <button type="button" className="studio-tts-chip" onClick={() => { setSelectedAssetId(null); setDraft(toDraftAsset(settings)); }}>
          새 Typecast 보이스
        </button>
      </div>

      <div className="studio-tts-assets-grid">
        <aside className="studio-tts-voice-list">
          <div className="studio-tts-section-title">보이스 자산</div>
          {voiceAssets.length <= 0 ? <div className="studio-tts-empty">저장된 보이스 자산이 없습니다.</div> : null}
          {voiceAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`studio-tts-voice-card ${selectedAssetId === asset.id ? "is-active" : ""}`}
              onClick={() => {
                setSelectedAssetId(asset.id);
                setDraft(toDraftAsset(settings, asset));
              }}
            >
              <div className="studio-tts-voice-card-head"><strong>{asset.name}</strong><span>Typecast</span></div>
              <p>{asset.description || asset.typecast.voiceId || "설명 없음"}</p>
              <small>{formatUpdatedAt(asset.updatedAtMs)}</small>
            </button>
          ))}
        </aside>

        <div className="studio-tts-editor">
          <div className="studio-tts-section-title">보이스 자산 편집</div>
          {draft ? (
            <>
              <div className="studio-tts-settings-grid">
                <label className="studio-tts-field"><span>이름</span><input className="input-field" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="studio-tts-field"><span>voice id</span><input className="input-field" value={draft.typecast.voiceId} onChange={(event) => updateDraft((current) => ({ ...current, typecast: { ...current.typecast, voiceId: event.target.value } }))} /></label>
                <label className="studio-tts-field"><span>모델</span><input className="input-field" value={draft.typecast.modelId} onChange={(event) => updateDraft((current) => ({ ...current, typecast: { ...current.typecast, modelId: event.target.value } }))} /></label>
                <label className="studio-tts-field"><span>언어</span><input className="input-field" value={draft.typecast.language} onChange={(event) => updateDraft((current) => ({ ...current, typecast: { ...current.typecast, language: event.target.value } }))} /></label>
                <label className="studio-tts-field"><span>감정</span><input className="input-field" value={draft.typecast.emotionType} onChange={(event) => updateDraft((current) => ({ ...current, typecast: { ...current.typecast, emotionType: event.target.value } }))} /></label>
                <label className="studio-tts-field"><span>태그</span><input className="input-field" value={draft.tagsInput} onChange={(event) => updateDraft((current) => ({ ...current, tagsInput: event.target.value }))} /></label>
                <label className="studio-tts-field studio-tts-field-span-2"><span>설명</span><textarea className="input-field studio-tts-textarea" value={draft.description} onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="studio-tts-field studio-tts-field-span-2"><span>미리듣기 문장</span><textarea className="input-field studio-tts-textarea" value={draft.previewText} onChange={(event) => updateDraft((current) => ({ ...current, previewText: event.target.value }))} /></label>
              </div>
              <div className="studio-tts-toolbar">
                <button type="button" className="btn-primary" onClick={() => void saveVoiceAsset()} disabled={saving}>보이스 저장</button>
                <button type="button" className="btn-secondary" onClick={() => void runPreview(draft.id || `typecast:voice:${draft.typecast.voiceId}`, draft.previewText)} disabled={previewing !== "" || !draft.typecast.voiceId.trim()}>미리듣기</button>
                <button type="button" className="btn-secondary" onClick={() => void applyDraftAsDefault()} disabled={saving || !draft.typecast.voiceId.trim()}>기본값으로 적용</button>
                {selectedAsset ? <button type="button" className="btn-secondary is-danger" onClick={() => void deleteVoiceAsset()} disabled={saving}>삭제</button> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
