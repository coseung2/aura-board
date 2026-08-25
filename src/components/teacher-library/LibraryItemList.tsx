"use client";

import { FileText, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { OptimizedImage } from "@/components/ui/OptimizedImage";
import type {
  TeacherLibraryCollectionDto,
  TeacherLibraryItemDto,
} from "@/lib/teacher-library-types";

type Props = {
  items: TeacherLibraryItemDto[];
  collections: TeacherLibraryCollectionDto[];
  selectedIds: ReadonlySet<string>;
  search: string;
  onSearch: (value: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onMove: (id: string, collectionId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function LibraryItemList({
  items,
  collections,
  selectedIds,
  search,
  onSearch,
  onToggle,
  onToggleAll,
  onMove,
  onDelete,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedVisibleCount = items.filter((item) =>
    selectedIds.has(item.id),
  ).length;
  const allSelected = items.length > 0 && selectedVisibleCount === items.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allSelected;
    }
  }, [allSelected, selectedVisibleCount]);

  return (
    <section className="teacher-library-list-panel" aria-labelledby="teacher-library-list-title">
      <div className="teacher-library-list-head">
        <div>
          <h1 id="teacher-library-list-title">내 라이브러리</h1>
          <p>{items.length}개의 자료</p>
        </div>
        <label className="teacher-library-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">자료 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="제목으로 검색"
          />
        </label>
      </div>

      {items.length === 0 ? (
        <div className="teacher-library-empty">
          <FileText size={34} aria-hidden="true" />
          <strong>{search ? "검색 결과가 없습니다" : "아직 저장한 자료가 없습니다"}</strong>
          <span>{search ? "다른 검색어를 입력해 보세요." : "보드 컬럼 메뉴에서 라이브러리에 추가할 수 있습니다."}</span>
        </div>
      ) : (
        <>
          <div className="teacher-library-select-all">
            <label>
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(items.map((item) => item.id))}
              />
              <span>전체 선택</span>
            </label>
            {selectedVisibleCount > 0 && <span>{selectedVisibleCount}개 선택</span>}
          </div>
          <ul className="teacher-library-item-list">
            {items.map((item) => {
              const checked = selectedIds.has(item.id);
              return (
              <li key={item.id} className={checked ? "is-selected" : ""}>
                <label className="teacher-library-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(item.id)}
                    aria-label={`${item.title} 선택`}
                  />
                </label>
                <div className="teacher-library-thumb">
                  {item.previewUrl ? (
                    <OptimizedImage
                      src={item.previewUrl}
                      alt=""
                      sizes="72px"
                      unoptimized={item.kind === "canva"}
                      fit="contain"
                    />
                  ) : item.kind === "canva" ? (
                    <FileText size={24} aria-hidden="true" />
                  ) : (
                    <ImageIcon size={24} aria-hidden="true" />
                  )}
                </div>
                <button
                  type="button"
                  className="teacher-library-item-main"
                  onClick={() => onToggle(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span className="teacher-library-item-meta">
                    <span className={`teacher-library-kind-chip is-${item.kind}`}>
                      {item.kind === "canva" ? "Canva" : "이미지"}
                    </span>
                    {item.kind === "canva"
                      ? item.pageCount
                        ? `${item.pageCount}페이지`
                        : "디자인"
                      : formatFileSize(item.fileSize)}
                  </span>
                </button>
                <select
                  value={item.collectionId ?? ""}
                  onChange={(event) => void onMove(item.id, event.target.value || null)}
                  aria-label={`${item.title} 폴더 이동`}
                >
                  <option value="">폴더 없음</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="teacher-library-delete"
                  aria-label={`${item.title} 삭제`}
                  onClick={() => void onDelete(item.id)}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "이미지";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
