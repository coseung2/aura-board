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
  TeacherLibraryPrintMode,
  TeacherLibraryPrintOptions,
} from "@/lib/teacher-library-types";
import {
  planTeacherLibraryPrint,
  type PrintSourcePage,
} from "@/lib/teacher-library-print-layout";

type Props = {
  selectedItems: TeacherLibraryItemDto[];
  filename: string;
  printOptions: TeacherLibraryPrintOptions;
  printSources?: PrintSourcePage[] | null;
  previewBusy?: boolean;
  busy: boolean;
  canvaConnected: boolean;
  error: string | null;
  onFilename: (value: string) => void;
  onPrintOptions: (value: TeacherLibraryPrintOptions) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDownload: () => Promise<void>;
  onLoadExactPreview?: () => Promise<void>;
  onReconnectCanva: () => void;
  onPageCount: (itemId: string, pageCount: number) => void;
};

export function LibraryFileBuilder({
  selectedItems,
  filename,
  printOptions,
  printSources = null,
  previewBusy = false,
  busy,
  canvaConnected,
  error,
  onFilename,
  onPrintOptions,
  onMove,
  onRemove,
  onDownload,
  onLoadExactPreview,
  onReconnectCanva,
  onPageCount,
}: Props) {
  const [resolvedPageCounts, setResolvedPageCounts] = useState<Record<string, number>>({});
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
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
            <label key={option.value} className={printOptions.mode === option.value ? "is-active" : ""}>
              <input
                type="radio"
                name="teacher-library-layout"
                value={option.value}
                checked={printOptions.mode === option.value}
                onChange={() => onPrintOptions({ ...printOptions, mode: option.value })}
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

      {printOptions.mode !== "original-pages" ? (
        <div className="teacher-library-paper-options">
          <fieldset className="teacher-library-orientation-options">
            <legend>용지 방향</legend>
            <label className={printOptions.orientation === "portrait" ? "is-active" : ""}>
              <input
                type="radio"
                name="teacher-library-orientation"
                checked={printOptions.orientation === "portrait"}
                onChange={() => onPrintOptions({ ...printOptions, orientation: "portrait" })}
              />
              세로
            </label>
            <label className={printOptions.orientation === "landscape" ? "is-active" : ""}>
              <input
                type="radio"
                name="teacher-library-orientation"
                checked={printOptions.orientation === "landscape"}
                onChange={() => onPrintOptions({ ...printOptions, orientation: "landscape" })}
              />
              가로
            </label>
          </fieldset>
          <p className="teacher-library-scale-status">
            <strong>{scaleStatus(printOptions.mode).title}</strong>
            <span>{scaleStatus(printOptions.mode).description}</span>
          </p>
          <button
            type="button"
            className="teacher-library-advanced-toggle"
            aria-expanded={advancedOptionsOpen}
            aria-controls="teacher-library-advanced-options"
            onClick={() => setAdvancedOptionsOpen((current) => !current)}
          >
            <span>고급 옵션</span>
            {advancedOptionsOpen
              ? <ChevronUp size={16} aria-hidden="true" />
              : <ChevronDown size={16} aria-hidden="true" />}
          </button>
          {advancedOptionsOpen ? (
            <div id="teacher-library-advanced-options" className="teacher-library-advanced-options">
              <fieldset className="teacher-library-margin-presets">
                <legend>여백</legend>
                {MARGIN_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={printOptions.marginMm === preset.value ? "is-active" : ""}
                    onClick={() => onPrintOptions({ ...printOptions, marginMm: preset.value })}
                  >
                    {preset.label}
                  </button>
                ))}
              </fieldset>
              <div className="teacher-library-spacing-options">
                <label>
                  <span>바깥 여백</span>
                  <span><input
                    type="number"
                    aria-label="바깥 여백"
                    min="0"
                    max="30"
                    step="0.5"
                    value={printOptions.marginMm}
                    onChange={(event) => onPrintOptions({
                      ...printOptions,
                      marginMm: clampMillimeters(event.currentTarget.value, printOptions.marginMm),
                    })}
                  /> mm</span>
                </label>
                <label>
                  <span>자료 간격</span>
                  <span><input
                    type="number"
                    aria-label="자료 간격"
                    min="0"
                    max="30"
                    step="0.5"
                    value={printOptions.gapMm}
                    onChange={(event) => onPrintOptions({
                      ...printOptions,
                      gapMm: clampMillimeters(event.currentTarget.value, printOptions.gapMm),
                    })}
                  /> mm</span>
                </label>
              </div>
              {printOptions.mode === "auto-original" ? (
                <fieldset className="teacher-library-finishing-options">
                  <legend>마지막 장 정렬</legend>
                  <label>
                    <input
                      type="radio"
                      name="teacher-library-last-page-alignment"
                      checked={printOptions.lastPageAlignment === "center"}
                      onChange={() => onPrintOptions({ ...printOptions, lastPageAlignment: "center" })}
                    />
                    가운데
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="teacher-library-last-page-alignment"
                      checked={printOptions.lastPageAlignment === "start"}
                      onChange={() => onPrintOptions({ ...printOptions, lastPageAlignment: "start" })}
                    />
                    왼쪽 위
                  </label>
                </fieldset>
              ) : null}
              <label className="teacher-library-crop-marks">
                <input
                  type="checkbox"
                  checked={printOptions.cropMarks}
                  onChange={(event) => onPrintOptions({ ...printOptions, cropMarks: event.currentTarget.checked })}
                />
                <span><strong>재단선 표시</strong><small>오려 쓰는 자료의 모서리에 3mm 표시</small></span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

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

      <section className="teacher-library-preview" aria-labelledby="teacher-library-preview-title">
        <div className="teacher-library-preview-head">
          <strong id="teacher-library-preview-title">
            {printSources ? "정확한 배치" : "배치 예시"}
          </strong>
          <span>{printSources ? `출력 ${planTeacherLibraryPrint(printSources, printOptions).pages.length}장` : `원본 ${sourcePageCount}페이지`}</span>
        </div>
        {printSources ? (
          <ExactPrintPreview
            items={selectedItems}
            sources={printSources}
            options={printOptions}
            pageCountForItem={pageCountForItem}
          />
        ) : (
          <>
            <PdfLayoutPreview
              items={selectedItems}
              mode={printOptions.mode}
              orientation={printOptions.orientation}
              pageCountForItem={pageCountForItem}
            />
            {selectedItems.length > 0 ? (
              <button
                type="button"
                className="teacher-library-exact-preview"
                disabled={previewBusy || (needsCanva && !canvaConnected)}
                onClick={() => void onLoadExactPreview?.()}
              >
                {previewBusy ? "실제 크기 읽는 중…" : "실제 크기로 정확히 보기"}
              </button>
            ) : null}
          </>
        )}
      </section>
    </aside>
  );
}

function ExactPrintPreview({
  items,
  sources,
  options,
  pageCountForItem,
}: {
  items: TeacherLibraryItemDto[];
  sources: PrintSourcePage[];
  options: TeacherLibraryPrintOptions;
  pageCountForItem: (item: TeacherLibraryItemDto) => number;
}) {
  const units = items.flatMap((item) =>
    Array.from({ length: pageCountForItem(item) }, (_, pageIndex) => ({ item, pageIndex })),
  );
  const plan = planTeacherLibraryPrint(sources, options);
  return (
    <div className="teacher-library-preview-pages" aria-label="정확한 PDF 배치 미리보기">
      {plan.pages.map((page, pageIndex) => (
        <div className="teacher-library-preview-page" key={pageIndex}>
          <div
            className="teacher-library-exact-sheet"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
            aria-label={`정확한 PDF 미리보기 ${pageIndex + 1}페이지`}
          >
            {page.placements.map((placement) => {
              const unit = units[placement.sourceIndex];
              if (!unit) return null;
              return (
                <div
                  className="teacher-library-exact-item"
                  key={placement.sourceIndex}
                  style={{
                    left: `${(placement.x / page.width) * 100}%`,
                    bottom: `${(placement.y / page.height) * 100}%`,
                    width: `${(placement.width / page.width) * 100}%`,
                    height: `${(placement.height / page.height) * 100}%`,
                  }}
                >
                  {previewUrlForPage(unit.item, unit.pageIndex) ? (
                    <OptimizedImage
                      src={previewUrlForPage(unit.item, unit.pageIndex)!}
                      alt=""
                      sizes="160px"
                      unoptimized={unit.item.kind === "canva"}
                      fit="contain"
                    />
                  ) : <FileText size={18} aria-hidden="true" />}
                  <span className="teacher-library-preview-index">{placement.sourceIndex + 1}</span>
                </div>
              );
            })}
          </div>
          <span className="teacher-library-preview-page-number">{pageIndex + 1} / {plan.pages.length}</span>
        </div>
      ))}
      {plan.warnings.includes("source_scaled_down") ? (
        <p className="teacher-library-preview-warning">A4 인쇄 영역보다 큰 원본은 축소됩니다.</p>
      ) : null}
    </div>
  );
}

const PDF_LAYOUT_OPTIONS: Array<{
  value: TeacherLibraryPrintMode;
  label: string;
  description: string;
  Icon: typeof LayoutGrid;
}> = [
  {
    value: "auto-original",
    label: "A4 균등 배치",
    description: "원본 크기로 A4 영역에 고르게 배치",
    Icon: LayoutGrid,
  },
  {
    value: "fit-page",
    label: "한 페이지에 하나",
    description: "자료 하나를 A4 한 장에 크게 맞춤",
    Icon: Maximize2,
  },
  {
    value: "original-pages",
    label: "원본 크기",
    description: "원본 페이지 비율과 크기를 유지",
    Icon: Scan,
  },
];

const MARGIN_PRESETS = [
  { label: "없음", value: 0 },
  { label: "좁게", value: 6.4 },
  { label: "보통", value: 12.7 },
  { label: "넓게", value: 20 },
] as const;

function scaleStatus(mode: TeacherLibraryPrintMode) {
  if (mode === "fit-page") {
    return { title: "A4에 맞춰 배율 조정", description: "자료가 인쇄 영역에 맞게 확대되거나 축소됩니다." };
  }
  return { title: "원본 크기 우선", description: "원본은 확대하지 않고, A4 인쇄 영역보다 클 때만 축소합니다." };
}

function PdfLayoutPreview({
  items,
  mode,
  orientation,
  pageCountForItem,
}: {
  items: TeacherLibraryItemDto[];
  mode: TeacherLibraryPrintMode;
  orientation: TeacherLibraryPrintOptions["orientation"];
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
  const unitsPerPage = mode === "auto-original" ? 4 : 1;
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
            className={`teacher-library-preview-sheet is-${mode} is-${orientation}`}
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

function clampMillimeters(raw: string, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30, Math.max(0, value));
}
