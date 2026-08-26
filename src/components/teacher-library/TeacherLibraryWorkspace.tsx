"use client";

import { useCallback, useMemo, useState } from "react";

import { buildCanvaConnectUrl } from "@/lib/canva-connect-return";
import type {
  TeacherLibraryCollectionDto,
  TeacherLibraryItemDto,
  TeacherLibraryPdfLayout,
  TeacherLibraryPayload,
} from "@/lib/teacher-library-types";
import { LibraryFileBuilder } from "./LibraryFileBuilder";
import { LibraryItemList } from "./LibraryItemList";
import { LibrarySidebar } from "./LibrarySidebar";

type Props = {
  initialPayload: TeacherLibraryPayload;
  initialCanvaConnected: boolean;
};

export function TeacherLibraryWorkspace({
  initialPayload,
  initialCanvaConnected,
}: Props) {
  const [collections, setCollections] = useState(initialPayload.collections);
  const [items, setItems] = useState(initialPayload.items);
  const [activeCollectionId, setActiveCollectionId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filename, setFilename] = useState("수업 자료");
  const [layout, setLayout] = useState<TeacherLibraryPdfLayout>("a4-auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko");
    return items.filter((item) => {
      if (activeCollectionId !== "all" && item.collectionId !== activeCollectionId) return false;
      return !query || item.title.toLocaleLowerCase("ko").includes(query);
    });
  }, [activeCollectionId, items, search]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = selectedIds
    .map((id) => itemById.get(id))
    .filter((item): item is TeacherLibraryItemDto => Boolean(item));

  const onPageCount = useCallback((itemId: string, pageCount: number) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, pageCount } : item)),
    );
  }, []);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setError(null);
  }

  function toggleAll(ids: string[]) {
    setSelectedIds((current) => {
      const visibleIds = new Set(ids);
      const allSelected = ids.every((id) => current.includes(id));
      if (allSelected) return current.filter((id) => !visibleIds.has(id));

      const currentIds = new Set(current);
      return [...current, ...ids.filter((id) => !currentIds.has(id))];
    });
    setError(null);
  }

  function moveSelected(index: number, direction: -1 | 1) {
    setSelectedIds((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function createCollection(name: string) {
    const response = await fetch("/api/teacher/library/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json().catch(() => null)) as
      | { collection?: TeacherLibraryCollectionDto }
      | null;
    if (!response.ok || !body?.collection) throw new Error("폴더를 만들지 못했습니다.");
    setCollections((current) => {
      const without = current.filter((item) => item.id !== body.collection!.id);
      return [body.collection!, ...without];
    });
    setActiveCollectionId(body.collection.id);
  }

  async function moveItem(id: string, collectionId: string | null) {
    const previous = items;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, collectionId } : item)));
    const response = await fetch(`/api/teacher/library/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId }),
    });
    if (!response.ok) {
      setItems(previous);
      setError("폴더 이동을 저장하지 못했습니다.");
      return;
    }
    recalculateCounts(collections, items.map((item) => (item.id === id ? { ...item, collectionId } : item)), setCollections);
  }

  async function deleteItem(id: string) {
    const target = itemById.get(id);
    if (!target || !window.confirm(`“${target.title}”을 라이브러리에서 삭제할까요?`)) return;
    const response = await fetch(`/api/teacher/library/items/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("자료를 삭제하지 못했습니다.");
      return;
    }
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    setSelectedIds((current) => current.filter((value) => value !== id));
    recalculateCounts(collections, nextItems, setCollections);
  }

  async function download() {
    if (selectedIds.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/teacher/library/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds: selectedIds, filename: filename.trim(), layout }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(exportErrorMessage(body?.error));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename.trim()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "PDF를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="teacher-library-page">
      <div className="teacher-library-shell">
        <LibrarySidebar
          collections={collections}
          activeCollectionId={activeCollectionId}
          totalCount={items.length}
          onSelect={setActiveCollectionId}
          onCreate={createCollection}
        />
        <LibraryItemList
          items={visibleItems}
          collections={collections}
          selectedIds={selectedIdSet}
          search={search}
          onSearch={setSearch}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onMove={moveItem}
          onDelete={deleteItem}
        />
        <LibraryFileBuilder
          selectedItems={selectedItems}
          filename={filename}
          layout={layout}
          busy={busy}
          canvaConnected={initialCanvaConnected}
          error={error}
          onFilename={setFilename}
          onLayout={setLayout}
          onMove={moveSelected}
          onRemove={toggle}
          onDownload={download}
          onPageCount={onPageCount}
          onReconnectCanva={() => {
            window.location.href = buildCanvaConnectUrl();
          }}
        />
      </div>
    </main>
  );
}

function recalculateCounts(
  collections: TeacherLibraryCollectionDto[],
  items: TeacherLibraryItemDto[],
  setCollections: (value: TeacherLibraryCollectionDto[]) => void,
) {
  setCollections(
    collections.map((collection) => ({
      ...collection,
      itemCount: items.filter((item) => item.collectionId === collection.id).length,
    })),
  );
}

function exportErrorMessage(code: string | undefined): string {
  if (code === "canva_reconnect_required") return "Canva 계정을 다시 연결해 주세요.";
  if (code === "rate_limited") return "잠시 후 다시 시도해 주세요.";
  if (code?.startsWith("canva_")) return "Canva 디자인을 PDF로 가져오지 못했습니다.";
  if (code?.startsWith("image_")) return "이미지 파일을 불러오지 못했습니다.";
  return "PDF를 만들지 못했습니다.";
}
