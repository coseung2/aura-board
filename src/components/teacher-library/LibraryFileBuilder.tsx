"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  X,
} from "lucide-react";

import type { TeacherLibraryItemDto } from "@/lib/teacher-library-types";

type Props = {
  selectedItems: TeacherLibraryItemDto[];
  filename: string;
  busy: boolean;
  canvaConnected: boolean;
  error: string | null;
  onFilename: (value: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDownload: () => Promise<void>;
  onReconnectCanva: () => void;
};

export function LibraryFileBuilder({
  selectedItems,
  filename,
  busy,
  canvaConnected,
  error,
  onFilename,
  onMove,
  onRemove,
  onDownload,
  onReconnectCanva,
}: Props) {
  const needsCanva = selectedItems.some((item) => item.kind === "canva");
  const blocked = selectedItems.length === 0 || (needsCanva && !canvaConnected);

  return (
    <aside className="teacher-library-builder" aria-labelledby="teacher-library-builder-title">
      <div className="teacher-library-builder-head">
        <div>
          <span>PDF 만들기</span>
          <h2 id="teacher-library-builder-title">한 파일로 다운로드</h2>
        </div>
        <strong>{selectedItems.length}</strong>
      </div>

      <div className="teacher-library-builder-list" aria-live="polite">
        {selectedItems.length === 0 ? (
          <div className="teacher-library-builder-empty">
            <FileText size={30} aria-hidden="true" />
            <span>왼쪽에서 자료를 선택하세요.</span>
          </div>
        ) : (
          <ol>
            {selectedItems.map((item, index) => (
              <li key={item.id}>
                <GripVertical size={17} aria-hidden="true" />
                <span className="teacher-library-order">{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.kind === "canva" ? "Canva PDF" : "이미지 페이지"}</span>
                </div>
                <div className="teacher-library-order-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove(index, -1)}
                    aria-label={`${item.title} 위로 이동`}
                  >
                    <ChevronUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === selectedItems.length - 1}
                    onClick={() => onMove(index, 1)}
                    aria-label={`${item.title} 아래로 이동`}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={`${item.title} 선택 해제`}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {needsCanva && !canvaConnected ? (
        <div className="teacher-library-canva-warning" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Canva 재연결이 필요합니다</strong>
            <span>선택한 Canva 디자인을 내려받으려면 계정을 연결하세요.</span>
          </div>
          <button type="button" onClick={onReconnectCanva}>재연결</button>
        </div>
      ) : null}

      {error ? <p className="teacher-library-builder-error" role="alert">{error}</p> : null}

      <label className="teacher-library-filename">
        <span>파일 이름</span>
        <div>
          <input
            value={filename}
            onChange={(event) => onFilename(event.target.value)}
            maxLength={100}
          />
          <span>.pdf</span>
        </div>
      </label>
      <button
        type="button"
        className="teacher-library-download"
        disabled={blocked || busy || !filename.trim()}
        onClick={() => void onDownload()}
      >
        <Download size={18} aria-hidden="true" />
        {busy ? "PDF 만드는 중…" : "한 파일로 다운로드"}
      </button>
    </aside>
  );
}
