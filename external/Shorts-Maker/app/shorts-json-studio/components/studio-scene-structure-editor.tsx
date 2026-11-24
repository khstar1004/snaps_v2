"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyStudioSceneStructureEdit,
  parseStudioSceneStructure,
  type StudioSceneStructureEdit,
} from "../studio-scene-structure-editor";

type StudioSceneStructureEditorProps = {
  jsonText: string;
  disabled?: boolean;
  onJsonTextChangeAction: (value: string) => void;
  onJsonTextCommitAction: (value: string, previousValue: string) => void;
};

type DraftInputProps = {
  value: string;
  ariaLabel: string;
  disabled: boolean;
  onCommitAction: (value: string) => void;
};

function DraftInput({
  value,
  ariaLabel,
  disabled,
  onCommitAction,
}: DraftInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (!draft.trim()) {
      setDraft(value);
      return;
    }
    if (draft === value) return;
    onCommitAction(draft);
  };

  return (
    <input
      className="input-field studio-scene-structure-title-input"
      value={draft}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

type SceneLineRowProps = {
  sceneIndex: number;
  lineIndex: number;
  lineCount: number;
  text: string;
  disabled: boolean;
  onCommitLineAction: (text: string) => void;
  onSplitLineAction: (text: string, offset?: number) => void;
  onMergePreviousAction: (text: string) => void;
  onMergeNextAction: (text: string) => void;
};

function SceneLineRow({
  sceneIndex,
  lineIndex,
  lineCount,
  text,
  disabled,
  onCommitLineAction,
  onSplitLineAction,
  onMergePreviousAction,
  onMergeNextAction,
}: SceneLineRowProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = () => {
    if (!draft.trim()) {
      setDraft(text);
      return;
    }
    if (draft !== text) onCommitLineAction(draft);
  };

  return (
    <div className="studio-scene-structure-line-row">
      <span className="studio-scene-structure-line-number">{String(lineIndex + 1).padStart(2, "0")}</span>
      <textarea
        ref={inputRef}
        className="input-field studio-scene-structure-line-input"
        rows={2}
        value={draft}
        aria-label={`장면 ${sceneIndex + 1} 라인 ${lineIndex + 1}`}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      <div className="studio-scene-structure-line-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || draft.trim().length < 2}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSplitLineAction(draft, inputRef.current?.selectionStart)}
        >
          커서에서 분리
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || !draft.trim() || lineIndex <= 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onMergePreviousAction(draft)}
        >
          위 라인과 병합
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || !draft.trim() || lineIndex >= lineCount - 1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onMergeNextAction(draft)}
        >
          아래 라인과 병합
        </button>
      </div>
    </div>
  );
}

export function StudioSceneStructureEditor({
  jsonText,
  disabled = false,
  onJsonTextChangeAction,
  onJsonTextCommitAction,
}: StudioSceneStructureEditorProps) {
  const structure = useMemo(() => parseStudioSceneStructure(jsonText), [jsonText]);
  const latestJsonTextRef = useRef(jsonText);
  const [confirmingDeleteIndex, setConfirmingDeleteIndex] = useState<number | null>(null);
  latestJsonTextRef.current = jsonText;

  useEffect(() => {
    if (confirmingDeleteIndex !== null && confirmingDeleteIndex >= structure.scenes.length) {
      setConfirmingDeleteIndex(null);
    }
  }, [confirmingDeleteIndex, structure.scenes.length]);

  if (structure.scenes.length <= 0) return null;

  const commitJson = (nextJsonText: string, previousJsonText: string) => {
    if (nextJsonText === previousJsonText) return;
    latestJsonTextRef.current = nextJsonText;
    onJsonTextChangeAction(nextJsonText);
    onJsonTextCommitAction(nextJsonText, previousJsonText);
    setConfirmingDeleteIndex(null);
  };

  const applyEdit = (edit: StudioSceneStructureEdit) => {
    const previousJsonText = latestJsonTextRef.current;
    commitJson(applyStudioSceneStructureEdit(previousJsonText, edit), previousJsonText);
  };

  const applyLineDraftThenEdit = (
    sceneIndex: number,
    lineIndex: number,
    draft: string,
    nextEdit: StudioSceneStructureEdit
  ) => {
    if (!draft.trim()) return;
    const previousJsonText = latestJsonTextRef.current;
    const withDraft = applyStudioSceneStructureEdit(previousJsonText, {
      type: "update-line",
      sceneIndex,
      lineIndex,
      text: draft,
    });
    const nextJsonText = applyStudioSceneStructureEdit(withDraft, nextEdit);
    commitJson(nextJsonText, previousJsonText);
  };

  return (
    <section className="studio-scene-structure-editor" aria-label="장면과 라인 편집">
      <div className="studio-scene-structure-editor-head">
        <div>
          <strong className="studio-script-json-speaker-title">장면·라인 정밀 편집</strong>
          <p className="studio-script-json-note">
            장면 구조를 다시 생성하지 않고 필요한 부분만 수정합니다. 변경한 장면의 음성·이미지는 다음 단계에서 다시 확인하세요.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={() => applyEdit({ type: "add-scene", afterSceneIndex: structure.scenes.length - 1 })}
        >
          + 장면 추가
        </button>
      </div>

      <div className="studio-scene-structure-scene-list">
        {structure.scenes.map((scene) => (
          <article key={`scene:${scene.index}`} className="studio-scene-structure-scene-card">
            <div className="studio-scene-structure-scene-head">
              <span className="studio-scene-structure-scene-number">장면 {String(scene.index + 1).padStart(2, "0")}</span>
              <DraftInput
                value={scene.title}
                ariaLabel={`장면 ${scene.index + 1} 제목`}
                disabled={disabled}
                onCommitAction={(title) => applyEdit({ type: "update-title", sceneIndex: scene.index, title })}
              />
              <div className="studio-scene-structure-scene-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`장면 ${scene.index + 1} 위로 이동`}
                  disabled={disabled || scene.index <= 0}
                  onClick={() => applyEdit({ type: "move-scene", fromSceneIndex: scene.index, toSceneIndex: scene.index - 1 })}
                >
                  위로
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`장면 ${scene.index + 1} 아래로 이동`}
                  disabled={disabled || scene.index >= structure.scenes.length - 1}
                  onClick={() => applyEdit({ type: "move-scene", fromSceneIndex: scene.index, toSceneIndex: scene.index + 1 })}
                >
                  아래로
                </button>
                <button
                  type="button"
                  className={`btn-secondary studio-scene-structure-delete${confirmingDeleteIndex === scene.index ? " is-confirming" : ""}`}
                  disabled={disabled || structure.scenes.length <= 1}
                  onClick={() => {
                    if (confirmingDeleteIndex !== scene.index) {
                      setConfirmingDeleteIndex(scene.index);
                      return;
                    }
                    applyEdit({ type: "delete-scene", sceneIndex: scene.index });
                  }}
                >
                  {confirmingDeleteIndex === scene.index ? "삭제 확인" : "삭제"}
                </button>
              </div>
            </div>

            <div className="studio-scene-structure-lines">
              {scene.lines.map((line, lineIndex) => (
                <SceneLineRow
                  key={`scene:${scene.index}:line:${lineIndex}`}
                  sceneIndex={scene.index}
                  lineIndex={lineIndex}
                  lineCount={scene.lines.length}
                  text={line}
                  disabled={disabled}
                  onCommitLineAction={(text) =>
                    applyEdit({ type: "update-line", sceneIndex: scene.index, lineIndex, text })
                  }
                  onSplitLineAction={(text, offset) =>
                    applyLineDraftThenEdit(scene.index, lineIndex, text, {
                      type: "split-line",
                      sceneIndex: scene.index,
                      lineIndex,
                      offset,
                    })
                  }
                  onMergePreviousAction={(text) =>
                    applyLineDraftThenEdit(scene.index, lineIndex, text, {
                      type: "merge-line-with-previous",
                      sceneIndex: scene.index,
                      lineIndex,
                    })
                  }
                  onMergeNextAction={(text) =>
                    applyLineDraftThenEdit(scene.index, lineIndex, text, {
                      type: "merge-line-with-next",
                      sceneIndex: scene.index,
                      lineIndex,
                    })
                  }
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
