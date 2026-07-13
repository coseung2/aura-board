"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardData } from "./DraggableCard";
import { OptimizedImage } from "./ui/OptimizedImage";
import { buildCanvaConnectUrl } from "@/lib/canva-connect-return";
import { CanvaAttribution } from "./canva/CanvaAttribution";

type Props = {
  sectionTitle: string;
  cards: CardData[];
  onClose: () => void;
};

type ExportLayout = "a4-fit" | "original";

const MAX_EXPORT_ITEMS = 10;

type ExportItem = {
  id: string;
  type: "canva" | "image";
  cardId: string;
  url: string;
  title: string;
  pageCount: number | null;
  thumbnail: string | null;
  status: "loading" | "ready" | "error";
};

const EXPORT_LAYOUTS: Array<{
  value: ExportLayout;
  label: string;
  description: string;
}> = [
  {
    value: "a4-fit",
    label: "A4 한 장",
    description: "이미지 한 개를 A4 한 장에 크게 맞춤",
  },
  {
    value: "original",
    label: "원본 크기",
    description: "이미지 원본 크기를 유지",
  },
];

export function ExportModal({ sectionTitle, cards, onClose }: Props) {
  const exportItems = useMemo(() => buildExportItems(cards), [cards]);
  const [items, setItems] = useState<ExportItem[]>(exportItems);
  const [selected, setSelected] = useState<Set<string>>(() =>
    createInitialSelection(exportItems),
  );
  const [layout, setLayout] = useState<ExportLayout>("a4-fit");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    setItems(exportItems);
    setSelected(createInitialSelection(exportItems));
  }, [exportItems]);

  useEffect(() => {
    const canvaItems = exportItems.filter((item) => item.type === "canva");
    async function fetchDesignInfo() {
      for (const item of canvaItems) {
        try {
          const resolveRes = await fetch(
            `/api/export/resolve-canva?url=${encodeURIComponent(item.url)}`,
          );
          if (!resolveRes.ok) throw new Error("resolve failed");
          const { designId } = await resolveRes.json();
          if (!designId) throw new Error("no design ID");

          const infoRes = await fetch(`/api/canva/design/${designId}`);
          if (infoRes.ok) {
            const { design } = await infoRes.json();
            setItems((prev) =>
              prev.map((d) =>
                d.id === item.id
                  ? {
                      ...d,
                      title: design.title,
                      pageCount: design.pageCount,
                      thumbnail: design.thumbnail?.url || d.thumbnail,
                      status: "ready" as const,
                    }
                  : d,
              ),
            );
          } else {
            setItems((prev) =>
              prev.map((d) =>
                d.id === item.id ? { ...d, status: "ready" as const } : d,
              ),
            );
          }
        } catch {
          setItems((prev) =>
            prev.map((d) =>
              d.id === item.id ? { ...d, status: "error" as const } : d,
            ),
          );
        }
      }
    }
    void fetchDesignInfo();
  }, [exportItems]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_EXPORT_ITEMS) next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((item) => selected.has(item.id));
  const hasSelectedImages = selectedItems.some((item) => item.type === "image");

  async function handleExport() {
    if (selectedItems.length === 0) return;

    const total = selectedItems.length;
    const usedFilenames = new Set<string>();
    const failures: string[] = [];
    let completed = 0;
    let successCount = 0;

    setExporting(true);
    setProgress(`0/${total} 준비 중...`);

    for (const [index, item] of selectedItems.entries()) {
      const itemNumber = index + 1;
      let itemFailed = false;
      setProgress(`${itemNumber}/${total} 처리 중 · ${item.title}`);

      try {
        const res = await fetch("/api/export/canva-pdf", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            layout,
            items: [
              {
                type: item.type,
                url: item.url,
                title: item.title,
              },
            ],
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "unknown" }));
          if (
            data.error === "canva_not_connected" ||
            data.error === "canva_token_expired"
          ) {
            if (
              window.confirm("Canva 계정 연결이 필요합니다. 지금 연결할까요?")
            ) {
              setProgress("Canva 연결 페이지로 이동 중...");
              setExporting(false);
              window.location.href = buildCanvaConnectUrl();
              return;
            }
            itemFailed = true;
            failures.push(`${item.title}: Canva 계정 연결이 필요합니다.`);
          } else {
            itemFailed = true;
            failures.push(
              `${item.title}: ${getCanvaExportErrorMessage(data.error)}`,
            );
          }
        } else {
          const blob = await res.blob();
          downloadBlob(
            blob,
            buildDownloadFilename(
              sectionTitle,
              item.title,
              usedFilenames,
              itemNumber,
            ),
          );
          successCount += 1;
        }
      } catch (err) {
        console.error(`[Export] ${item.title}`, err);
        itemFailed = true;
        failures.push(
          `${item.title}: 네트워크 오류로 다운로드하지 못했습니다.`,
        );
      }

      completed = itemNumber;
      setProgress(
        itemFailed
          ? `${completed}/${total} 완료 · ${item.title} 실패`
          : `${completed}/${total} 완료 · ${item.title}`,
      );
    }

    setExporting(false);
    if (failures.length > 0) {
      setProgress(
        `${successCount}/${total}개 PDF 다운로드 완료 · 실패: ${failures.join(" · ")}`,
      );
      return;
    }

    setProgress(`완료 · ${successCount}/${total}개 PDF 다운로드 완료`);
    window.setTimeout(onClose, 1500);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={exporting ? undefined : onClose} />
      <div className="add-card-modal export-modal">
        <div className="modal-header">
          <div className="canva-modal-heading">
            <h2 className="modal-title">{sectionTitle} - PDF 내보내기</h2>
            <CanvaAttribution />
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={exporting}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {items.length === 0 ? (
            <p className="export-hint">이 섹션에 내보낼 Canva 링크나 이미지가 없습니다.</p>
          ) : (
            <>
              <p className="export-summary" id="export-summary">
                항목 {selectedItems.length}개 선택 · 각 항목을 별도 PDF 파일로
                다운로드
              </p>
              <p className="export-selection-limit" id="export-selection-limit">
                한 번에 최대 {MAX_EXPORT_ITEMS}개까지 선택할 수 있습니다.
                {items.length > MAX_EXPORT_ITEMS
                  ? ` 처음 ${MAX_EXPORT_ITEMS}개 항목이 기본으로 선택되었습니다.`
                  : ""}
                {selectedItems.length > 1
                  ? " 브라우저에서 여러 파일 다운로드 허용을 요청할 수 있습니다."
                  : ""}
              </p>

              <p className="export-hint">
                Canva 디자인은 Canva에서 받은 원본 PDF 그대로 다운로드합니다.
              </p>

              {hasSelectedImages && (
                <div
                  className="export-layout-options"
                  aria-label="이미지 PDF 페이지 크기"
                >
                  {EXPORT_LAYOUTS.map((option) => (
                    <label
                      key={option.value}
                      className={`export-layout-option ${layout === option.value ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="export-layout"
                        value={option.value}
                        checked={layout === option.value}
                        disabled={exporting}
                        onChange={() => setLayout(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="export-design-list">
                {items.map((d) => (
                  <label
                    key={d.id}
                    className={`export-design-item ${selected.has(d.id) ? "ready" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                      disabled={
                        exporting ||
                        (!selected.has(d.id) &&
                          selectedItems.length >= MAX_EXPORT_ITEMS)
                      }
                      aria-describedby="export-selection-limit"
                      aria-label={`${d.title} 선택`}
                      className="export-item-check"
                    />
                    {d.thumbnail && (
                      <div className="export-design-thumb optimized-img-wrap">
                        <OptimizedImage src={d.thumbnail} alt="" sizes="160px" />
                      </div>
                    )}
                    <div className="export-design-info">
                      <div className="export-design-title">{d.title}</div>
                      <div className="export-design-meta">
                        {d.status === "loading" && "디자인 정보 가져오는 중..."}
                        {d.status === "ready" &&
                          (d.type === "image"
                            ? "이미지 · 1페이지"
                            : d.pageCount
                              ? `${d.pageCount}페이지`
                              : "준비됨")}
                        {d.status === "error" && "정보 가져오기 실패"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {progress && (
                <div className="export-ready-msg" role="status" aria-live="polite">
                  {progress}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={exporting}
                  className="modal-btn-cancel"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || selectedItems.length === 0}
                  className="modal-btn-submit"
                >
                  {exporting
                    ? "내보내는 중..."
                    : `PDF 내보내기 (${selectedItems.length})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function createInitialSelection(items: ExportItem[]): Set<string> {
  return new Set(items.slice(0, MAX_EXPORT_ITEMS).map((item) => item.id));
}

function downloadBlob(blob: Blob, filename: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function buildDownloadFilename(
  sectionTitle: string,
  itemTitle: string,
  usedFilenames: Set<string>,
  itemNumber: number,
): string {
  const section = sanitizeFilenamePart(sectionTitle);
  const item = sanitizeFilenamePart(itemTitle);
  const base =
    [section, item].filter(Boolean).join(" - ") || `export-${itemNumber}`;
  const trimmedBase =
    base.slice(0, 120).replace(/[. ]+$/g, "") || `export-${itemNumber}`;

  let filename = `${trimmedBase}.pdf`;
  let suffix = 2;
  while (usedFilenames.has(filename.toLowerCase())) {
    filename = `${trimmedBase}-${suffix}.pdf`;
    suffix += 1;
  }
  usedFilenames.add(filename.toLowerCase());
  return filename;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
}

function buildExportItems(cards: CardData[]): ExportItem[] {
  const items: ExportItem[] = [];
  for (const card of cards) {
    if (card.linkUrl && isCanvaUrl(card.linkUrl)) {
      items.push({
        id: `${card.id}:canva`,
        type: "canva",
        cardId: card.id,
        url: card.linkUrl,
        title: card.linkTitle || card.title || "Canva 디자인",
        pageCount: null,
        thumbnail: card.linkImage || null,
        status: "loading",
      });
    }

    const seenImageUrls = new Set<string>();
    for (const image of getCardImages(card)) {
      if (seenImageUrls.has(image.url)) continue;
      seenImageUrls.add(image.url);
      items.push({
        id: `${card.id}:image:${image.id}`,
        type: "image",
        cardId: card.id,
        url: image.url,
        title: image.title,
        pageCount: 1,
        thumbnail: image.previewUrl || image.url,
        status: "ready",
      });
    }
  }
  return items;
}

function getCardImages(card: CardData): Array<{
  id: string;
  url: string;
  previewUrl: string | null;
  title: string;
}> {
  const images = (card.attachments ?? [])
    .filter((attachment) => attachment.kind === "image")
    .map((attachment, index) => ({
      id: attachment.id || `attachment-${index}`,
      url: attachment.url,
      previewUrl: attachment.previewUrl ?? null,
      title: attachment.fileName || card.title || `이미지 ${index + 1}`,
    }));

  if (images.length === 0 && card.imageUrl) {
    images.push({
      id: "legacy",
      url: card.imageUrl,
      previewUrl: card.thumbUrl ?? null,
      title: card.title || "이미지",
    });
  }

  return images;
}

function isCanvaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "canva.link" || host === "canva.com" || host.endsWith(".canva.com");
  } catch {
    return url.includes("canva.link") || url.includes("canva.com");
  }
}

function getCanvaExportErrorMessage(error: unknown): string {
  if (error === "No export items provided") {
    return "내보낼 항목을 선택해주세요.";
  }
  if (error === "No valid Canva designs found") {
    return "현재 연결된 Canva 계정으로 내보낼 수 있는 디자인이 없습니다. 디자인 접근 권한을 확인해주세요.";
  }
  if (error === "No pages in merged PDF") {
    return "선택한 항목에서 PDF 페이지를 만들 수 없습니다. 다른 항목을 선택해 다시 시도해주세요.";
  }
  return "PDF를 내보내지 못했습니다. 잠시 후 다시 시도해주세요.";
}
