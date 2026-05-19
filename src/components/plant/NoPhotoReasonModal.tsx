"use client";

import { useEffect, useState } from "react";

const PRESETS = [
  { value: "weather", label: "날씨가 좋지 않았어요" },
  { value: "forgot", label: "관찰을 깜빡했어요" },
  { value: "no_class", label: "수업이 없었어요" },
  { value: "other", label: "기타" },
];

interface Props {
  open: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function NoPhotoReasonModal({ open, onCancel, onSubmit, busy, error }: Props) {
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");

  useEffect(() => {
    if (!open) {
      setPick("");
      setOther("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, open]);

  if (!open) return null;

  const reasonText =
    pick === "other" ? other.trim() : PRESETS.find((preset) => preset.value === pick)?.label ?? "";
  const canSubmit = reasonText.length > 0 && !busy;

  return (
    <div className="plant-modal-backdrop" role="dialog" aria-modal="true" aria-label="사진 없음 사유">
      <div className="plant-modal">
        <h3>사진 없이 다음 단계로 갈까요?</h3>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          이번 단계에 사진이 없는 이유를 간단히 남겨 주세요.
        </p>
        <div className="plant-reason-list">
          {PRESETS.map((preset) => (
            <label key={preset.value}>
              <input
                type="radio"
                name="no-photo-reason"
                value={preset.value}
                checked={pick === preset.value}
                onChange={() => setPick(preset.value)}
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
        {pick === "other" && (
          <textarea
            className="plant-reason-other"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            placeholder="사유를 직접 적어 주세요. (200자 이내)"
            maxLength={200}
          />
        )}
        {error && <p className="plant-error">{error}</p>}
        <div className="plant-modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => canSubmit && onSubmit(reasonText)}
            disabled={!canSubmit}
          >
            {busy ? "저장 중..." : "계속"}
          </button>
        </div>
      </div>
    </div>
  );
}
