"use client";

import {
  createEmptyStoryCharacterProfileRow,
  removeStoryCharacterProfileRow,
  resolveStoryCharacterAnchorPreviewUrl,
  updateStoryCharacterProfileRow,
  type StoryCharacterProfileEditableField,
} from "../studio-character-profile-helpers";

type StoryCharacterProfileRow = {
  characterId: string;
  displayName: string;
  identityPrompt: string;
  anchorImageUrl: string;
  anchorAssetId: string;
  sampleTexts: string[];
  isInferred: boolean;
};

type StudioCharacterProfileEditorProps = {
  rows: StoryCharacterProfileRow[];
  disabled?: boolean;
  isJsonValid: boolean;
  onChangeAction: (value: StoryCharacterProfileRow[]) => void;
};

export function StudioCharacterProfileEditor({
  rows,
  disabled = false,
  isJsonValid,
  onChangeAction,
}: StudioCharacterProfileEditorProps) {
  const canEdit = !disabled && isJsonValid;
  const updateRow = (characterId: string, field: StoryCharacterProfileEditableField, value: string) => {
    onChangeAction(updateStoryCharacterProfileRow(rows, characterId, field, value));
  };
  const addRow = () => {
    onChangeAction([...rows, createEmptyStoryCharacterProfileRow(rows)]);
  };
  const removeRow = (characterId: string) => {
    onChangeAction(removeStoryCharacterProfileRow(rows, characterId));
  };

  return (
    <div className="studio-character-profile-editor">
      <div className="studio-script-json-speaker-head">
        <div>
          <strong className="studio-script-json-speaker-title">캐릭터 기준 설정</strong>
          <p className="studio-script-json-note">
            characterId는 장면/대사 참조값이라 고정합니다. 이름, 외형 설명, 기준 이미지 URL만 조정해서 이미지 일관성을 맞춥니다.
          </p>
        </div>
        <button type="button" className="btn-secondary" disabled={!canEdit} onClick={addRow}>
          캐릭터 추가
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="studio-character-profile-grid">
          {rows.map((row, index) => {
            const fieldPrefix = `studio-character-${index}`;
            const hasAnchorImage = Boolean(row.anchorImageUrl.trim());
            const anchorPreviewUrl = resolveStoryCharacterAnchorPreviewUrl(row.anchorImageUrl);
            const hasValidAnchorImage = Boolean(anchorPreviewUrl);
            const actionLabel = row.isInferred ? "설정 초기화" : "프로필 삭제";
            return (
              <article key={row.characterId} className="studio-character-profile-card">
                <div className="studio-character-profile-card-head">
                  <div className="studio-character-profile-title-block">
                    <span className="studio-character-profile-id">{row.characterId}</span>
                    <span className="studio-character-profile-lock">ID 고정</span>
                    {row.isInferred ? <span className="studio-character-profile-badge">대사에서 감지됨</span> : null}
                  </div>
                  <button type="button" className="btn-secondary" disabled={!canEdit} onClick={() => removeRow(row.characterId)}>
                    {actionLabel}
                  </button>
                </div>

                <div className="studio-character-profile-body">
                  <div className="studio-character-profile-anchor">
                    {anchorPreviewUrl ? (
                      <img src={anchorPreviewUrl} alt="" className="studio-character-profile-thumb" />
                    ) : (
                      <div className="studio-character-profile-thumb is-empty">No anchor</div>
                    )}
                    <span className={`studio-character-profile-anchor-status${hasValidAnchorImage ? " is-ready" : ""}`}>
                      {hasValidAnchorImage
                        ? "기준 이미지 준비됨"
                        : hasAnchorImage
                          ? "URL 형식을 확인하세요"
                          : "이미지 생성 시 기준 이미지 자동 준비"}
                    </span>
                  </div>

                  <label className="studio-script-json-label-secondary" htmlFor={`${fieldPrefix}-display-name`}>
                    표시 이름
                  </label>
                  <input
                    id={`${fieldPrefix}-display-name`}
                    className="input-field"
                    value={row.displayName}
                    disabled={!canEdit}
                    onChange={(event) => updateRow(row.characterId, "displayName", event.target.value)}
                    placeholder="예: 도서관 여자 / 검은 코트 남자"
                  />

                  <label className="studio-script-json-label-secondary" htmlFor={`${fieldPrefix}-identity-prompt`}>
                    외형 기준 프롬프트
                  </label>
                  <textarea
                    id={`${fieldPrefix}-identity-prompt`}
                    className="input-field studio-character-profile-textarea"
                    rows={3}
                    value={row.identityPrompt}
                    disabled={!canEdit}
                    onChange={(event) => updateRow(row.characterId, "identityPrompt", event.target.value)}
                    placeholder="헤어, 의상, 나이대, 인상, 고정 소품 등 반복되어야 하는 외형 기준"
                  />

                  <label className="studio-script-json-label-secondary" htmlFor={`${fieldPrefix}-anchor-url`}>
                    기준 이미지 URL
                  </label>
                  <input
                    id={`${fieldPrefix}-anchor-url`}
                    className="input-field"
                    value={row.anchorImageUrl}
                    disabled={!canEdit}
                    onChange={(event) => updateRow(row.characterId, "anchorImageUrl", event.target.value)}
                    placeholder="/api/local-storage/... 또는 https://..."
                  />

                  <details className="studio-character-profile-advanced">
                    <summary>고급: 기준 이미지 assetId</summary>
                    <label className="studio-script-json-label-secondary" htmlFor={`${fieldPrefix}-anchor-asset-id`}>
                      anchorAssetId
                    </label>
                    <input
                      id={`${fieldPrefix}-anchor-asset-id`}
                      className="input-field"
                      value={row.anchorAssetId}
                      disabled={!canEdit}
                      onChange={(event) => updateRow(row.characterId, "anchorAssetId", event.target.value)}
                      placeholder="자동 저장된 기준 이미지 asset id"
                    />
                  </details>

                  {row.sampleTexts.length > 0 ? (
                    <div className="studio-script-json-speaker-samples">
                      <span className="studio-script-json-speaker-samples-label">예시 대사</span>
                      <div className="studio-script-json-speaker-samples-list">
                        {row.sampleTexts.map((sampleText, sampleIndex) => (
                          <span key={`${row.characterId}:character-sample:${sampleIndex}`} className="studio-script-json-speaker-sample-chip">
                            {`"${sampleText}"`}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="studio-script-json-note">
          화자 대사나 수동 캐릭터가 아직 없습니다. 캐릭터가 필요한 영상이면 직접 추가하고, 캐릭터 없는 사물/배경 영상이면 비워둬도 됩니다.
        </div>
      )}
      <p className="studio-script-json-note">
        프로필 설정을 삭제하거나 초기화해도 장면의 등장 캐릭터 선택은 유지됩니다. 장면에서 제외하려면 2단계 이미지 검토에서 선택을 해제하세요.
      </p>
    </div>
  );
}
