"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BoardThumbnailPicker,
  type ThumbnailMode,
} from "./BoardThumbnailPicker";

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type BoardItem = {
  id: string;
  title: string;
  layout: string;
  classroomId: string | null;
  thumbnailMode: string | null;
  thumbnailUrl: string | null;
};

type Props = {
  board: BoardItem;
  classrooms: ClassroomItem[];
  onClose: () => void;
};

export function EditBoardModal({ board, classrooms, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(board.title);
  const [classroomId, setClassroomId] = useState<string | null>(
    board.classroomId
  );
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>(
    normalizeMode(board.thumbnailMode)
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    board.thumbnailUrl
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(board.title);
    setClassroomId(board.classroomId);
    setThumbnailMode(normalizeMode(board.thumbnailMode));
    setThumbnailUrl(board.thumbnailUrl);
    setError(null);
  }, [board]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "제목 없음",
          ...(board.layout === "assignment" ? {} : { classroomId }),
          thumbnailMode:
            thumbnailMode === "custom" && thumbnailUrl
              ? "custom"
              : thumbnailMode === "none"
                ? "none"
                : "default",
          thumbnailUrl:
            thumbnailMode === "custom" && thumbnailUrl ? thumbnailUrl : null,
        }),
      });
      if (!res.ok) {
        setError(`저장 실패: ${await res.text()}`);
        return;
      }
      if (shouldSyncAssignmentClassroom) {
        const syncRes = await fetch(`/api/boards/${board.id}/roster-sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ classroomId }),
        });
        if (!syncRes.ok) {
          setError(`학급 연결 실패: ${await syncRes.text()}`);
          return;
        }
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  const titleDirty = title !== board.title;
  const classroomDirty = classroomId !== board.classroomId;
  const thumbnailDirty =
    thumbnailMode !== normalizeMode(board.thumbnailMode) ||
    thumbnailUrl !== board.thumbnailUrl;
  const canSave = titleDirty || classroomDirty || thumbnailDirty;
  const canEditClassroom =
    board.layout !== "assignment" || board.classroomId == null;
  const shouldSyncAssignmentClassroom =
    board.layout === "assignment" &&
    board.classroomId == null &&
    Boolean(classroomId);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal">
        <div className="modal-header">
          <h2 className="modal-title">보드 수정</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-field-label" htmlFor="edit-board-title">
            보드 이름
          </label>
          <input
            id="edit-board-title"
            type="text"
            className="modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            disabled={busy}
            maxLength={200}
          />

          <label className="modal-field-label" htmlFor="edit-board-classroom">
            학급 연결
          </label>
          <select
            id="edit-board-classroom"
            className="modal-select"
            value={classroomId ?? ""}
            onChange={(e) =>
              setClassroomId(e.target.value || null)
            }
            disabled={busy || !canEditClassroom}
          >
            <option value="" disabled={board.layout === "dj-queue"}>
              학급 연결 없음
            </option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (학생 {c.studentCount}명)
              </option>
            ))}
          </select>

          <label className="modal-field-label">대시보드 썸네일</label>
          <BoardThumbnailPicker
            layout={board.layout}
            mode={thumbnailMode}
            url={thumbnailUrl}
            onChange={({ mode, url }) => {
              setThumbnailMode(mode);
              setThumbnailUrl(url);
            }}
            disabled={busy}
          />

          {error && <p className="board-settings-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
              disabled={busy}
            >
              취소
            </button>
            <button
              type="button"
              className="modal-btn-submit"
              onClick={() => void save()}
              disabled={busy || !canSave}
            >
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function normalizeMode(value: string | null): ThumbnailMode {
  if (value === "none" || value === "custom") return value;
  return "default";
}
