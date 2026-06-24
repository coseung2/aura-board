"use client";

type Props = {
  classroomName: string;
  renaming: boolean;
  renameErr: string | null;
  onRename: (next: string) => void;
  onClose: () => void;
  onRequestDelete: () => void;
};

export function ClassroomSettingsModal({
  classroomName,
  renaming,
  renameErr,
  onRename,
  onClose,
  onRequestDelete,
}: Props) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="학급 설정"
    >
      <div className="classroom-settings-modal">
        <header className="classroom-settings-modal-header">
          <h3>학급 설정</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="classroom-settings-modal-body">
          <div className="classroom-setting-row">
            <label
              className="classroom-setting-label"
              htmlFor="classroom-name-input"
            >
              학급 이름
            </label>
            <div className="classroom-setting-name-row">
              <input
                id="classroom-name-input"
                className="classroom-setting-input"
                type="text"
                defaultValue={classroomName}
                maxLength={100}
                onBlur={(e) => {
                  if (e.target.value.trim() !== classroomName) {
                    onRename(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={renaming}
              />
              {renaming && (
                <span className="classroom-setting-saving">저장 중...</span>
              )}
            </div>
            {renameErr && (
              <p className="classroom-setting-err">
                이름 저장 실패: {renameErr}
              </p>
            )}
          </div>

          <div className="classroom-setting-row classroom-setting-danger">
            <div>
              <p className="classroom-setting-label">학급 삭제</p>
              <p className="classroom-setting-hint">
                삭제하면 연결된 학부모 접근이 해제되고 학생 계정이
                비활성화됩니다. 되돌릴 수 없습니다.
              </p>
            </div>
            <button
              type="button"
              className="classroom-detail-delete"
              onClick={onRequestDelete}
            >
              학급 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
