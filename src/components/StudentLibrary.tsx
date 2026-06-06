"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Asset = {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  format: string;
  createdAt: string;
};

// Right-hand sidebar for a logged-in student: lists their own StudentAsset
// rows and offers a quick upload path. Used by DrawingBoard on drawing-layout
// boards. Non-student viewers should not mount this component.
export function StudentLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/student-assets?scope=mine");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { assets: Asset[] };
      setAssets(data.assets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/student-assets", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        alert(`업로드 실패: ${data.error ?? "unknown"}`);
        return;
      }
      const { asset } = (await res.json()) as { asset: Asset };
      setAssets((prev) => [asset, ...prev]);
    } catch (e) {
      alert(`업로드 실패: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="drawing-sidebar" aria-label="내 그림 라이브러리">
      <div className="drawing-sidebar-header">
        <span>내 그림</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="내 그림 업로드"
          className="drawing-sidebar-upload"
        >
          {uploading ? "업로드 중..." : "＋"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {loading && <p className="muted">불러오는 중...</p>}
      {error && <p className="muted">불러오기 실패</p>}
      {!loading && !error && assets.length === 0 && (
        <p className="muted">아직 업로드한 그림이 없어요.</p>
      )}

      {assets.length > 0 && (
        <ul className="library-list">
          {assets.map((a) => (
            <li key={a.id} className="library-item">
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
              <span className="library-item-title">{a.title || "(제목 없음)"}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
