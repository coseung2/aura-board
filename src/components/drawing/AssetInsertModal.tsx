"use client";

import { useEffect, useState } from "react";

export type InsertableAsset = {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
};

type Props = {
  classroomId: string | null;
  onInsert: (asset: InsertableAsset) => void;
  onClose: () => void;
};

export function AssetInsertModal({ classroomId, onInsert, onClose }: Props) {
  const [assets, setAssets] = useState<InsertableAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!classroomId) {
        setLoading(false);
        setAssets([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/student-assets?scope=shared&classroomId=${encodeURIComponent(classroomId)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { assets: InsertableAsset[] };
        if (!cancelled) setAssets(data.assets ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal asset-insert-modal">
        <div className="modal-header">
          <h2 className="modal-title">디자인 에셋 불러오기</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {!classroomId && (
            <p className="create-board-hint">
              학급에 연결된 보드에서만 공유 에셋을 불러올 수 있어요.
            </p>
          )}
          {loading && <div className="gallery-empty">불러오는 중...</div>}
          {error && <div className="gallery-empty">불러오기 실패: {error}</div>}
          {!loading && !error && assets?.length === 0 && classroomId && (
            <div className="gallery-empty">
              아직 공유된 에셋이 없어요. 저장 시 "학급에 공유"로 올리면 여기에
              나타나요.
            </div>
          )}
          {!loading && !error && assets && assets.length > 0 && (
            <div className="drawing-gallery">
              {assets.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className="gallery-thumb"
                  title={a.title || "(제목 없음)"}
                  onClick={() => onInsert(a)}
                >
                  {a.thumbnailUrl || a.fileUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbnailUrl ?? a.fileUrl}
                      alt={a.title}
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
        </div>
      </div>
    </>
  );
}
