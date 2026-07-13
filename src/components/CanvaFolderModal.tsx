"use client";

import { useState, useEffect } from "react";
import { OptimizedImage } from "./ui/OptimizedImage";
import { buildCanvaConnectUrl } from "@/lib/canva-connect-return";
import { CanvaAttribution } from "./canva/CanvaAttribution";

type FolderItem = {
  type: "design" | "folder";
  id: string;
  name: string;
  thumbnail?: { url: string };
  pageCount?: number;
};

type Props = {
  sectionTitle: string;
  onImport: (designs: { id: string; title: string; thumbnail?: string }[]) => void;
  onClose: () => void;
};

export function CanvaFolderModal({ sectionTitle, onImport, onClose }: Props) {
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([
    { id: "root", name: "내 Canva" },
  ]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => {
    loadFolder(currentFolder.id);
  }, [currentFolder.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFolder(folderId: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/canva/folders/${folderId}/items`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "canva_not_connected") {
          if (window.confirm("Canva 계정 연결이 필요합니다. 지금 연결할까요?")) {
            window.location.href = buildCanvaConnectUrl();
          }
          onClose();
          return;
        }
        throw new Error("canva_folder_load_failed");
      }
      const { items: folderItems } = await res.json();
      setItems(folderItems);
    } catch {
      setError("Canva 폴더를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setLoading(false);
  }

  function openFolder(folderId: string, folderName: string) {
    setSelected(new Set());
    setFolderStack((prev) => [...prev, { id: folderId, name: folderName }]);
  }

  function goBack() {
    if (folderStack.length <= 1) return;
    setSelected(new Set());
    setFolderStack((prev) => prev.slice(0, -1));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateFolder() {
    const name = window.prompt(`"${sectionTitle}" 섹션용 Canva 폴더 이름:`);
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/canva/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentFolderId: currentFolder.id }),
      });
      if (res.ok) {
        loadFolder(currentFolder.id);
      } else {
        alert("폴더 생성 실패");
      }
    } catch {
      alert("폴더 생성 실패");
    }
    setCreating(false);
  }

  function handleImport() {
    const selectedDesigns = items
      .filter((i) => i.type === "design" && selected.has(i.id))
      .map((i) => ({
        id: i.id,
        title: i.name,
        thumbnail: i.thumbnail?.url,
      }));
    onImport(selectedDesigns);
  }

  const designs = items.filter((i) => i.type === "design");
  const folders = items.filter((i) => i.type === "folder");

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal export-modal">
        <div className="modal-header">
          <div className="canva-modal-heading">
            <h2 className="modal-title">Canva 폴더</h2>
            <CanvaAttribution />
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Breadcrumb */}
          <div className="canva-breadcrumb">
            {folderStack.map((f, i) => (
              <span key={f.id}>
                {i > 0 && <span className="canva-breadcrumb-sep"> / </span>}
                <button
                  type="button"
                  className={`canva-breadcrumb-btn ${i === folderStack.length - 1 ? "active" : ""}`}
                  onClick={() => {
                    setSelected(new Set());
                    setFolderStack((prev) => prev.slice(0, i + 1));
                  }}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          {loading && (
            <div className="export-hint" role="status" aria-live="polite">
              Canva 폴더를 불러오는 중...
            </div>
          )}
          {error && (
            <div className="export-hint" role="alert" style={{ color: "var(--color-danger)" }}>
              {error}
            </div>
          )}

          {!loading && (
            <div className="export-design-list">
              {folderStack.length > 1 && (
                <button type="button" className="canva-folder-item" onClick={goBack}>
                  <span className="canva-folder-icon">⬆️</span>
                  <span>상위 폴더</span>
                </button>
              )}

              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="canva-folder-item"
                  onClick={() => openFolder(f.id, f.name)}
                >
                  <span className="canva-folder-icon">📁</span>
                  <span>{f.name}</span>
                </button>
              ))}

              {designs.map((d) => (
                <label key={d.id} className={`export-design-item ${selected.has(d.id) ? "ready" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    className="export-item-check"
                  />
                  {d.thumbnail && (
                    <div className="export-design-thumb optimized-img-wrap">
                      {/* unoptimized: Canva returns auth-gated /screen URLs for
                          some designs which fail through next/image's server-
                          side optimizer (400). Direct browser fetch rides the
                          user's canva.com session cookies and usually succeeds;
                          if not, OptimizedImage's onError shows a placeholder. */}
                      <OptimizedImage src={d.thumbnail.url} alt="" sizes="160px" unoptimized />
                    </div>
                  )}
                  <div className="export-design-info">
                    <div className="export-design-title">{d.name}</div>
                    <div className="export-design-meta">
                      {d.pageCount ? `${d.pageCount}페이지` : "디자인"}
                    </div>
                  </div>
                </label>
              ))}

              {folders.length === 0 && designs.length === 0 && (
                <div className="export-hint">이 폴더가 비어있습니다.</div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={handleCreateFolder} disabled={creating} className="modal-btn-cancel">
              {creating ? "생성 중..." : "📁 새 폴더"}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0}
              className="modal-btn-submit"
            >
              카드로 가져오기 ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
