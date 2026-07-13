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

type ExportLayout = "a4-auto" | "a4-fit" | "original";

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
    value: "a4-auto",
    label: "A4 자동 배치",
    description: "선택한 Canva 페이지와 이미지를 A4에 알맞게 묶어서 배치",
  },
  {
    value: "a4-fit",
    label: "A4 한 장씩",
    description: "각 페이지와 이미지를 A4 한 장에 크게 맞춤",
  },
  {
    value: "original",
    label: "원본 크기",
    description: "Canva PDF와 이미지 원본 크기를 그대로 유지",
  },
];

export function ExportModal({ sectionTitle, cards, onClose }: Props) {
  const exportItems = useMemo(() => buildExportItems(cards), [cards]);
  const [items, setItems] = useState<ExportItem[]>(exportItems);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(exportItems.map((item) => item.id)),
  );
  const [layout, setLayout] = useState<ExportLayout>("a4-auto");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    setItems(exportItems);
    setSelected(new Set(exportItems.map((item) => item.id)));
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
      else next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((item) => selected.has(item.id));
  const totalSourcePages = selectedItems.reduce(
    (sum, item) => sum + (item.pageCount ?? 1),
    0,
  );

  async function handleExport() {
    if (selectedItems.length === 0) return;

    setExporting(true);
    setProgress(`${selectedItems.length}개 항목 PDF 내보내는 중...`);

    try {
      const res = await fetch("/api/export/canva-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          layout,
          items: selectedItems.map((item) => ({
            type: item.type,
            url: item.url,
            title: item.title,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "unknown" }));
        if (data.error === "canva_not_connected" || data.error === "canva_token_expired") {
          if (window.confirm("Canva 계정 연결이 필요합니다. 지금 연결할까요?")) {
            window.location.href = buildCanvaConnectUrl();
          }
          setExporting(false);
          setProgress("");
          return;
        }
        alert(getCanvaExportErrorMessage(data.error));
        setExporting(false);
        setProgress("");
        return;
      }

      setProgress("PDF 다운로드 중...");
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${sectionTitle}_export.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setProgress("완료!");
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error(err);
      alert("내보내기 중 오류가 발생했습니다.");
      setExporting(false);
      setProgress("");
    }
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
              <p className="export-summary">
                항목 {selected.size}개 선택 · 원본 {totalSourcePages}페이지
              </p>

              <div className="export-layout-options" aria-label="PDF 배치 방식">
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
                      disabled={exporting}
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
                  disabled={exporting || selected.size === 0}
                  className="modal-btn-submit"
                >
                  {exporting ? "내보내는 중..." : `PDF 내보내기 (${selected.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
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
