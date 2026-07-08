"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initialConnected: boolean;
  connectedAt: string | null;
};

export function CanvaSettingsSection({ initialConnected, connectedAt }: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = useCallback(() => {
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = "/api/auth/canva?returnTo=" + returnTo;
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (!window.confirm("Canva 연동을 해제할까요? 디자인 썸네일과 내보내기가 동작하지 않을 수 있어요.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/canva", { method: "DELETE" });
      if (!res.ok) throw new Error("disconnect failed");
      setConnected(false);
      router.refresh();
    } catch {
      setError("연동 해제 중 오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <section id="canva" className="docs-section settings-section">
      <div className="settings-section-header">
        <h2 className="docs-h2">캔바 연동 설정</h2>
      </div>

      {connected ? (
        <div className="connected-apps-list">
          <div className="connected-app-row">
            <div className="connected-app-main">
              <div className="connected-app-name">
                <span className="settings-status-dot is-on">●</span> Canva
              </div>
              <div className="connected-app-meta">
                디자인 썸네일, 내보내기, 폴더 정리
              </div>
              {connectedAt && (
                <div className="connected-app-meta connected-app-meta-faint">
                  연동 {new Date(connectedAt).toLocaleString("ko-KR")}
                </div>
              )}
            </div>
            <button
              type="button"
              className="settings-action-btn"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {busy ? "해제 중…" : "연동 해제"}
            </button>
          </div>
          {error && <p className="connected-apps-error">{error}</p>}
        </div>
      ) : (
        <div className="settings-status-row is-idle">
          <div className="settings-status-line">
            <span className="settings-status-dot">○</span>
            <span className="settings-status-text">Canva 계정이 연결되지 않았습니다</span>
          </div>
          <p className="docs-p" style={{ marginTop: 8 }}>
            Canva 디자인 썸네일이 보이지 않거나 내보내기가 안 되면 다시 연결해주세요.
          </p>
          <button
            type="button"
            className="settings-action-btn is-primary"
            onClick={handleConnect}
            style={{ marginTop: 8 }}
          >
            Canva 다시 연결하기
          </button>
        </div>
      )}
    </section>
  );
}