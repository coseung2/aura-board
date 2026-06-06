"use client";

export type LibraryAsset = {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
};

type Props = {
  loading: boolean;
  assets: LibraryAsset[] | null;
  pickedId: string | null;
  canConfirm: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function LibraryPickerModal({
  loading,
  assets,
  pickedId,
  canConfirm,
  onPick,
  onClose,
  onConfirm,
}: Props) {
  return (
    <div className="library-picker-overlay" onClick={onClose}>
      <div className="library-picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">내 라이브러리</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {loading && <p className="muted">불러오는 중...</p>}
        {!loading && assets && assets.length === 0 && (
          <p className="muted">
            아직 업로드한 그림이 없어요. 그림보드(🎨) 레이아웃에서 먼저
            업로드하세요.
          </p>
        )}
        {!loading && assets && assets.length > 0 && (
          <div className="library-picker-grid">
            {assets.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`library-picker-item ${pickedId === a.id ? "selected" : ""}`}
                onClick={() => onPick(a.id)}
                aria-pressed={pickedId === a.id}
              >
                {a.thumbnailUrl || a.fileUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.thumbnailUrl ?? a.fileUrl}
                    alt={a.title || "그림"}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span aria-hidden>🖼️</span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="modal-btn-submit"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            첨부
          </button>
        </div>
      </div>
    </div>
  );
}
