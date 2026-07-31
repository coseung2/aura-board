"use client";

import { useCallback, useEffect, useState } from "react";
import { StudentLibrary } from "./StudentLibrary";

type Asset = {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  format: string;
  studentId: string;
  createdAt: string;
};

type Props = {
  boardId: string;
  boardTitle: string;
  classroomId: string | null;
  viewerKind: "teacher" | "student" | "none";
  studentId: string | null;
};

const DRAWPILE_URL = process.env.NEXT_PUBLIC_DRAWPILE_URL ?? "";

// Drawing layout shell — gallery surface only. Drawing happens in the mobile
// app (native DrawingBoard → POST /api/student-assets), and shared artwork
// shows up here. Real-time Drawpile integration is still deferred: the 작업실
// tab renders the iframe once NEXT_PUBLIC_DRAWPILE_URL is set, otherwise a
// placeholder (see BLOCKERS.md). The gallery tab and StudentLibrary sidebar
// are functional today.
export function DrawingBoard({
  boardId: _boardId,
  boardTitle: _boardTitle,
  classroomId,
  viewerKind,
  studentId,
}: Props) {
  const [tab, setTab] = useState<"studio" | "gallery">("gallery");
  const [sharedAssets, setSharedAssets] = useState<Asset[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const loadShared = useCallback(async () => {
    if (!classroomId) return;
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const res = await fetch(
        `/api/student-assets?scope=shared&classroomId=${encodeURIComponent(classroomId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { assets: Asset[] };
      setSharedAssets(data.assets ?? []);
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "load failed");
    } finally {
      setGalleryLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    if (tab === "gallery") {
      void loadShared();
    }
  }, [tab, loadShared]);

  const showSidebar = viewerKind === "student" && studentId;

  return (
    <section className="drawing-board">
      <div className="drawing-main">
        <div role="tablist" aria-label="그림보드 탭" className="drawing-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "studio"}
            className="drawing-tab"
            onClick={() => setTab("studio")}
          >
            🎨 작업실
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "gallery"}
            className="drawing-tab"
            onClick={() => setTab("gallery")}
          >
            🖼️ 갤러리
          </button>
        </div>

        <div role="tabpanel" className="drawing-panel">
          {tab === "studio" ? (
            DRAWPILE_URL ? (
              // parent seed path — Drawpile 서버 realtime collab.
              <iframe
                src={DRAWPILE_URL}
                title="그림보드 작업실"
                className="drawing-iframe"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              />
            ) : (
              <div className="drawing-placeholder">
                <span className="placeholder-icon" aria-hidden>
                  🎨
                </span>
                <p>웹 작업실은 준비 중이에요</p>
                <p className="muted">
                  지금은 모바일 앱에서 그림을 그리고 저장하면 갤러리 탭에 바로
                  나타납니다.
                </p>
              </div>
            )
          ) : (
            <div className="drawing-gallery-wrap">
              {galleryLoading && (
                <div className="gallery-empty">불러오는 중...</div>
              )}
              {galleryError && (
                <div className="gallery-empty">불러오기 실패: {galleryError}</div>
              )}
              {!galleryLoading && !galleryError && sharedAssets.length === 0 && (
                <div className="gallery-empty">공유된 그림이 아직 없어요</div>
              )}
              {!galleryLoading && sharedAssets.length > 0 && (
                <div className="drawing-gallery">
                  {sharedAssets.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      className="gallery-thumb"
                      title={a.title || "(제목 없음)"}
                    >
                      {a.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnailUrl} alt={a.title} />
                      ) : (
                        <span aria-hidden>🖼️</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSidebar && <StudentLibrary />}
    </section>
  );
}
