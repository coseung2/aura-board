"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  LayoutGrid,
  Maximize2,
  Scan,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { canvaPageThumbnailUrl } from "@/lib/canva-url";
import type {
  TeacherLibraryItemDto,
  TeacherLibraryPdfLayout,
} from "@/lib/teacher-library-types";

type Props = {
  selectedItems: TeacherLibraryItemDto[];
  filename: string;
  layout: TeacherLibraryPdfLayout;
  busy: boolean;
  canvaConnected: boolean;
  error: string | null;
  onFilename: (value: string) => void;
  onLayout: (value: TeacherLibraryPdfLayout) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDownload: () => Promise<void>;
  onReconnectCanva: () => void;
  onPageCount: (itemId: string, pageCount: number) => void;
};

export function LibraryFileBuilder({
  selectedItems,
  filename,
  layout,
  busy,
  canvaConnected,
  error,
  onFilename,
  onLayout,
  onMove,
  onRemove,
  onDownload,
  onReconnectCanva,
  onPageCount,
}: Props) {
  const [resolvedPageCounts, setResolvedPageCounts] = useState<Record<string, number>>({});
  const needsCanva = selectedItems.some((item) => item.kind === "canva");
  const blocked = selectedItems.length === 0 || (needsCanva && !canvaConnected);
  const canvaLookupKey = useMemo(
    () =>
      selectedItems
        .filter((item) => item.kind === "canva" && item.canvaDesignId && !item.pageCount)
        .map((item) => `${item.id}:${item.canvaDesignId}`)
        .join("|"),
    [selectedItems],
  );

  useEffect(() => {
    const unresolved = selectedItems.filter(
      (item) => item.kind === "canva" && item.canvaDesignId && !item.pageCount,
    );
    if (unresolved.length === 0) return;
    let cancelled = false;

    async function loadPageCounts() {
      const results = await Promise.all(
        unresolved.map(async (item) => {
          try {
            const response = await fetch(
              `/api/canva/design/${encodeURIComponent(item.canvaDesignId!)}`,
              { cache: "no-store" },
            );
            if (!response.ok) return null;
            const body = (await response.json()) as {
              design?: { pageCount?: number };
            };
            const pageCount = body.design?.pageCount;
            if (typeof pageCount !== "number" || !Number.isInteger(pageCount) || pageCount < 1) {
              return null;
            }
            return { id: item.id, pageCount };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      for (const result of results) {
        if (!result) continue;
        setResolvedPageCounts((current) => ({ ...current, [result.id]: result.pageCount }));
        onPageCount(result.id, result.pageCount);
      }
    }

    void loadPageCounts();
    return () => {
      cancelled = true;
    };
    // The key changes only when a new unresolved Canva item is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvaLookupKey]);

  const pageCountForItem = (item: TeacherLibraryItemDto) =>
    Math.max(1, resolvedPageCounts[item.id] ?? item.pageCount ?? 1);
  const sourcePageCount = selectedItems.reduce(
    (sum, item) => sum + pageCountForItem(item),
    0,
  );

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
                  <span className="teacher-library-builder-meta">
                    <span className={`teacher-library-kind-chip is-${item.kind}`}>
                      {item.kind === "canva" ? "Canva" : "이미지"}
                    </span>
                    {item.kind === "canva" && item.pageCount
                      ? `${item.pageCount}페이지`
                      : "1페이지"}
                  </span>
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

      <fieldset className="teacher-library-layout-options">
        <legend>페이지 배치</legend>
        {PDF_LAYOUT_OPTIONS.map((option) => {
          const Icon = option.Icon;
          return (
            <label key={option.value} className={layout === option.value ? "is-active" : ""}>
              <input
                type="radio"
                name="teacher-library-layout"
                value={option.value}
                checked={layout === option.value}
                onChange={() => onLayout(option.value)}
              />
              <Icon size={17} aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <section className="teacher-library-preview" aria-labelledby="teacher-library-preview-title">
        <div className="teacher-library-preview-head">
          <strong id="teacher-library-preview-title">미리보기</strong>
          <span>원본 {sourcePageCount}페이지</span>
        </div>
        <PdfLayoutPreview
          items={selectedItems}
          layout={layout}
          pageCountForItem={pageCountForItem}
        />
      </section>

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

const PDF_LAYOUT_OPTIONS: Array<{
  value: TeacherLibraryPdfLayout;
  label: string;
  description: string;
  Icon: typeof LayoutGrid;
}> = [
  {
    value: "a4-auto",
    label: "A4 균등 배치",
    description: "여러 자료를 A4 영역에 고르게 배치",
    Icon: LayoutGrid,
  },
  {
    value: "a4-fit",
    label: "한 페이지에 하나",
    description: "자료 하나를 A4 한 장에 크게 맞춤",
    Icon: Maximize2,
  },
  {
    value: "original",
    label: "원본 크기",
    description: "원본 페이지 비율과 크기를 유지",
    Icon: Scan,
  },
];

function PdfLayoutPreview({
  items,
  layout,
  pageCountForItem,
}: {
  items: TeacherLibraryItemDto[];
  layout: TeacherLibraryPdfLayout;
  pageCountForItem: (item: TeacherLibraryItemDto) => number;
}) {
  const previewUnits = items.flatMap((item) =>
    Array.from({ length: pageCountForItem(item) }, (_, pageIndex) => ({
      item,
      pageIndex,
    })),
  );
  if (previewUnits.length === 0) {
    return <div className="teacher-library-preview-empty">자료를 선택하면 배치를 볼 수 있습니다.</div>;
  }

  // A4 auto export keeps the initial 2x2 scale on overflow pages. Mirror that
  // stable slot size here instead of previewing six items on a fictitious page.
  const unitsPerPage = layout === "a4-auto" ? 4 : 1;
  const pages = Array.from(
    { length: Math.ceil(previewUnits.length / unitsPerPage) },
    (_, pageIndex) =>
      previewUnits.slice(pageIndex * unitsPerPage, (pageIndex + 1) * unitsPerPage),
  );

  return (
    <div className="teacher-library-preview-pages" aria-label="PDF 배치 미리보기">
      {pages.map((page, pageIndex) => (
        <div className="teacher-library-preview-page" key={pageIndex}>
          <div
            className={`teacher-library-preview-sheet is-${layout}`}
            aria-label={`PDF 미리보기 ${pageIndex + 1}페이지`}
          >
            {page.map(({ item, pageIndex: itemPageIndex }, unitIndex) => {
              const sourceIndex = pageIndex * unitsPerPage + unitIndex;
              return (
                <div
                  className="teacher-library-preview-item"
                  key={`${item.id}-${itemPageIndex}`}
                >
                  {previewUrlForPage(item, itemPageIndex) ? (
                    <OptimizedImage
                      src={previewUrlForPage(item, itemPageIndex)!}
                      alt=""
                      sizes="160px"
                      unoptimized={item.kind === "canva"}
                      fit="contain"
                    />
                  ) : (
                    <FileText size={20} aria-hidden="true" />
                  )}
                  <span className="teacher-library-preview-index">
                    {sourceIndex + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="teacher-library-preview-page-number">
            {pageIndex + 1} / {pages.length}
          </span>
        </div>
      ))}
    </div>
  );
}

function previewUrlForPage(
  item: TeacherLibraryItemDto,
  pageIndex: number,
): string | null {
  if (item.kind !== "canva" || !item.canvaDesignId) return item.previewUrl;
  if (pageIndex === 0 && item.previewUrl) return item.previewUrl;

  const designUrl =
    item.canvaViewUrl ?? `https://www.canva.com/design/${item.canvaDesignId}/view`;
  return canvaPageThumbnailUrl(designUrl, pageIndex + 1, 320);
}
