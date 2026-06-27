"use client";

import { useCallback, useEffect, useState } from "react";

type StoreItem = {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  imageUrl: string | null;
  archived: boolean;
};

type Props = {
  classroomId: string;
  canManage: boolean;
};

export function ClassroomStoreTab({ classroomId, canManage }: Props) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<StoreItem | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewArchived, setViewArchived] = useState(false);

  const refresh = useCallback(async () => {
    const qs = viewArchived ? "?archived=1" : "";
    const res = await fetch(`/api/classrooms/${classroomId}/store/items${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { items: StoreItem[] };
    setItems(data.items);
    setLoaded(true);
  }, [classroomId, viewArchived]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  async function saveItem(draft: Partial<StoreItem> & { name: string; price: number }) {
    setBusy(true);
    try {
      const isCreate = editing === "new";
      const url = isCreate
        ? `/api/classrooms/${classroomId}/store/items`
        : `/api/classrooms/${classroomId}/store/items/${(editing as StoreItem).id}`;
      const res = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          price: draft.price,
          stock: draft.stock ?? null,
          imageUrl: draft.imageUrl ?? null,
        }),
      });
      if (!res.ok) {
        alert("저장 실패");
        return;
      }
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function archiveItem(id: string) {
    if (!window.confirm("이 상품을 보관 처리할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/store/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("처리 실패");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function restoreItem(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/store/items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) {
        alert("복구 실패");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="classroom-store">
      <header className="classroom-store-header">
        <h2>{viewArchived ? "보관함" : "매점 상품"}</h2>
        {canManage && (
          <div className="classroom-store-header-actions">
            <button
              type="button"
              className="classroom-store-archive-toggle"
              onClick={() => setViewArchived((v) => !v)}
            >
              {viewArchived ? "활성 상품으로" : "보관함 보기"}
            </button>
            {!viewArchived && (
              <button
                type="button"
                className="classroom-store-add"
                onClick={() => setEditing("new")}
              >
                + 상품 추가
              </button>
            )}
          </div>
        )}
      </header>

      {!loaded ? (
        <p className="classroom-store-loading">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="classroom-store-empty">
          {viewArchived ? "보관된 상품이 없어요." : "등록된 상품이 없어요."}
        </p>
      ) : (
        <ul className="classroom-store-grid">
          {items.map((it) => (
            <li
              key={it.id}
              className={`store-item-card ${
                it.imageUrl ? "has-image" : "is-text-only"
              }`}
            >
              {it.imageUrl && (
                <img
                  className="store-item-image"
                  src={it.imageUrl}
                  alt=""
                  width={160}
                  height={120}
                />
              )}
              <div className="store-item-info">
                <div className="store-item-name">{it.name}</div>
                <div className="store-item-price">
                  {it.price.toLocaleString()}원
                </div>
                <div className="store-item-stock">
                  {it.stock === null ? "재고 ∞" : `재고 ${it.stock}`}
                </div>
              </div>
              {canManage && (
                <div className="store-item-actions">
                  {viewArchived ? (
                    <button
                      type="button"
                      className="store-item-restore"
                      onClick={() => restoreItem(it.id)}
                      disabled={busy}
                    >
                      복구
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="store-item-edit"
                        onClick={() => setEditing(it)}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        className="store-item-archive"
                        onClick={() => archiveItem(it.id)}
                        disabled={busy}
                      >
                        보관
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <StoreItemEditor
          initial={editing === "new" ? null : editing}
          onSave={saveItem}
          onCancel={() => setEditing(null)}
          busy={busy}
        />
      )}
    </section>
  );
}

type EditorProps = {
  initial: StoreItem | null;
  onSave: (d: { name: string; price: number; stock?: number | null; imageUrl?: string | null }) => void;
  onCancel: () => void;
  busy: boolean;
};

function StoreItemEditor({ initial, onSave, onCancel, busy }: EditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [stock, setStock] = useState(
    initial?.stock === null || initial?.stock === undefined ? "" : String(initial.stock)
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price.replace(/,/g, ""));
    if (!name.trim() || !Number.isInteger(p) || p < 0) return;
    const s = stock.trim() === "" ? null : Number(stock);
    onSave({
      name: name.trim(),
      price: p,
      stock: s,
      imageUrl: imageUrl.trim() || null,
    });
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <form className="store-item-editor" onSubmit={handleSubmit}>
        <header className="store-item-editor-header">
          <h3>{initial ? "상품 편집" : "상품 추가"}</h3>
          <button type="button" className="modal-close" onClick={onCancel} disabled={busy}>
            ×
          </button>
        </header>
        <label className="store-editor-field">
          <span>이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label className="store-editor-field">
          <span>가격 (원)</span>
          <input
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ""))}
            required
          />
        </label>
        <label className="store-editor-field">
          <span>재고 (비우면 무제한)</span>
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
        <label className="store-editor-field">
          <span>이미지 URL (선택)</span>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </label>
        <footer className="store-item-editor-footer">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </footer>
      </form>
    </div>
  );
}
