"use client";

/**
 * QrShareModal — 공유 QR 코드 + 링크 표시 모달.
 * BoardHeader의 공유 아이콘 버튼에서 열린다.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  boardId: string;
  shareToken: string;
  shareShortCode?: string | null;
  onClose: () => void;
};

export function QrShareModal({ boardId, shareToken, shareShortCode, onClose }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shortCopied, setShortCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const shareUrl = `${window.location.origin}/share/${shareToken}`;
  const shortUrl = shareShortCode
    ? `${window.location.origin}/s/${shareShortCode}`
    : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/share/qr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setSvg(typeof j.svg === "string" ? j.svg : null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSvg(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, shareToken]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [shareUrl]);

  const copyShortLink = useCallback(async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setShortCopied(true);
      setTimeout(() => setShortCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [shortUrl]);

  if (!mounted) return null;

  return createPortal(
    <div className="share-qr-overlay" onClick={onClose}>
      <div className="share-qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-qr-modal-header">
          <span style={{ fontWeight: 600, fontSize: 15 }}>보드 공유</span>
          <button
            type="button"
            className="share-qr-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="share-qr-modal-body">
          <div className="share-qr-code-wrap">
            {loading && <span className="share-qr-loading">QR 생성 중…</span>}
            {!loading && svg && (
              <div
                className="share-qr-svg"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
            {!loading && !svg && (
              <span className="share-qr-loading">QR을 불러올 수 없어요</span>
            )}
          </div>

          <div className="share-link-row">
            <input
              type="text"
              className="share-link-input"
              value={shareUrl}
              readOnly
            />
            <button
              type="button"
              className="share-copy-btn"
              onClick={copyLink}
            >
              {copied ? "✓" : "복사"}
            </button>
          </div>

          {shortUrl && (
            <div className="share-link-row" style={{ marginTop: 6 }}>
              <span className="share-link-label">짧은 링크</span>
              <input
                type="text"
                className="share-link-input"
                value={shortUrl}
                readOnly
              />
              <button
                type="button"
                className="share-copy-btn"
                onClick={copyShortLink}
              >
                {shortCopied ? "✓" : "복사"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
