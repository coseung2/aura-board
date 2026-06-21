"use client";

/**
 * ShareTab — 보드 공유 설정 (BoardSettingsPanel 에서 사용).
 *
 * - 비공개 / 학생 권한 공유 토글
 * - 공개 시 QR 코드 + 링크 표시
 * - 링크 갱신 / 공유 해제
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  boardId: string;
  initialShareMode: string;
  initialShareToken: string | null;
  initialShareShortCode?: string | null;
};

export function ShareTab({ boardId, initialShareMode, initialShareToken, initialShareShortCode }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState(initialShareMode);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [shareShortCode, setShareShortCode] = useState<string | null>(initialShareShortCode ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shortCopied, setShortCopied] = useState(false);

  const isPublic = mode !== "private";
  const shareUrl =
    isPublic && shareToken
      ? `${window.location.origin}/share/${shareToken}`
      : null;
  const shortUrl =
    isPublic && shareShortCode
      ? `${window.location.origin}/s/${shareShortCode}`
      : null;

  // QR 생성
  const loadQr = useCallback(async () => {
    if (!isPublic || !shareToken) {
      setSvg(null);
      return;
    }
    setQrLoading(true);
    try {
      const res = await fetch("/api/share/qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId }),
      });
      if (res.ok) {
        const j = await res.json();
        setSvg(typeof j.svg === "string" ? j.svg : null);
      } else {
        setSvg(null);
      }
    } catch {
      setSvg(null);
    } finally {
      setQrLoading(false);
    }
  }, [boardId, mode, shareToken]);

  useEffect(() => {
    loadQr();
  }, [loadQr]);

  // 공유 상태 변경
  const handleModeChange = async (nextMode: string) => {
    if (nextMode === mode) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (!res.ok) {
        const j = await res.json();
        setErr(j.error === "forbidden" ? "권한이 없어요" : "저장에 실패했어요");
        return;
      }
      const j = await res.json();
      setMode(j.shareMode);
      setShareToken(j.shareToken);
      setShareShortCode(j.shareShortCode ?? null);
      router.refresh();
    } catch {
      setErr("저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  // 링크 갱신
  const handleRotate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/share/rotate`, {
        method: "POST",
      });
      if (!res.ok) {
        setErr("갱신에 실패했어요");
        return;
      }
      const j = await res.json();
      setShareToken(j.shareToken);
      setShareShortCode(j.shareShortCode ?? null);
      router.refresh();
      setSvg(null); // QR 다시 로드
    } catch {
      setErr("갱신에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const copyShortLink = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setShortCopied(true);
      setTimeout(() => setShortCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="share-tab">
      <div className="share-mode-row">
        <label className="share-mode-label">
          <span style={{ fontSize: 14, fontWeight: 600 }}>공유</span>
          <button
            type="button"
            className="share-mode-select"
            onClick={() => handleModeChange(isPublic ? "private" : "student")}
            disabled={busy}
          >
            {isPublic ? "학생 권한 공유 중" : "학생 권한으로 공유"}
          </button>
        </label>
      </div>

      {err && <p className="share-error">{err}</p>}

      {/* QR + 링크 표시 영역 */}
      {isPublic && shareUrl && (
        <div className="share-qr-area">
          <div className="share-qr-wrap">
            {qrLoading && <span className="share-qr-loading">QR 생성 중…</span>}
            {!qrLoading && svg && (
              <div
                className="share-qr-svg"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
            {!qrLoading && !svg && (
              <span className="share-qr-loading">QR을 불러올 수 없어요</span>
            )}
          </div>

          {/* 긴 링크 */}
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
              {copied ? "✓ 복사됨" : "복사"}
            </button>
          </div>

          {/* 짧은 링크 */}
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
                {shortCopied ? "✓ 복사됨" : "복사"}
              </button>
            </div>
          )}

          <div className="share-actions">
            <button
              type="button"
              className="share-rotate-btn"
              onClick={handleRotate}
              disabled={busy}
            >
              🔄 새 링크 발급
            </button>
            <button
              type="button"
              className="share-rotate-btn"
              onClick={() => handleModeChange("private")}
              disabled={busy}
            >
              공유 해제
            </button>
          </div>
        </div>
      )}

      {mode === "private" && (
        <div className="share-off-notice">
          <span aria-hidden="true" style={{ fontSize: 24 }}>🔒</span>
          <p>이 보드는 비공개예요. 교사와 학생만 접근할 수 있어요.</p>
        </div>
      )}
    </div>
  );
}
