"use client";

import { useState } from "react";

type Props = {
  actor: "teacher" | "student";
  initialConnected: boolean;
};

export function CanvaConnectionCard({ actor, initialConnected }: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectUrl =
    actor === "teacher"
      ? "/api/auth/canva?returnTo=/teacher/settings"
      : "/api/auth/canva/student?returnTo=/my/wallet";

  async function disconnect() {
    if (busy) return;
    if (!window.confirm("Canva 연결을 해제할까요? 다음 Canva 작업에서 다시 연결해야 합니다.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/canva/connection", {
        method: "DELETE",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Canva 연결을 해제하지 못했습니다.");
      setConnected(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Canva 연결을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connected-app-row">
      <div className="connected-app-main">
        <strong className="connected-app-name">Canva</strong>
        <span className="connected-app-meta">
          {connected ? "계정이 연결되어 있습니다." : "연결된 Canva 계정이 없습니다."}
        </span>
        <span className="connected-app-meta-faint">
          연결 해제 시 OAuth 토큰과 임시 인증 데이터가 즉시 삭제됩니다.
        </span>
        {error && <span className="connected-apps-error" role="alert">{error}</span>}
      </div>
      {connected ? (
        <button
          type="button"
          className="settings-action-btn is-danger"
          onClick={disconnect}
          disabled={busy}
        >
          {busy ? "해제 중…" : "연결 해제"}
        </button>
      ) : (
        <a className="settings-action-btn is-primary" href={connectUrl}>
          Canva 연결
        </a>
      )}
    </div>
  );
}
