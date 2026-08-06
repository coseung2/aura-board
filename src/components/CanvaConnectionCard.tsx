"use client";

import { useState } from "react";
import { CanvaAttribution } from "./canva/CanvaAttribution";

type Props = {
  initialConnected: boolean;
};

const CANVA_SCOPE_SUMMARY = "디자인 메타데이터·콘텐츠 읽기 · 폴더 읽기·쓰기";
const CANVA_SCOPE_VALUE =
  "design:meta:read · design:content:read · folder:read · folder:write";

export function CanvaConnectionCard({ initialConnected }: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectUrl = "/api/auth/canva?returnTo=/teacher/settings";

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
    <div className="ai-provider-table" role="table" aria-label="Canva 연결" aria-busy={busy}>
      <div className="ai-provider-table-row" role="row">
        <div className="ai-provider-table-provider" role="cell">
          <div className="connected-app-heading">
            <strong className="connected-app-name">Canva</strong>
            <CanvaAttribution />
          </div>
          <span>
            {connected ? "계정이 연결되어 있습니다." : "연결된 Canva 계정이 없습니다."}
          </span>
          {error ? (
            <span className="connected-apps-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <div className="canva-scope-cell" role="cell">
          <strong>권한</strong>
          <span>{CANVA_SCOPE_SUMMARY}</span>
          <code>{CANVA_SCOPE_VALUE}</code>
        </div>
        <div className="ai-provider-table-billing" role="cell">
          {connected ? (
            <button
              type="button"
              className="settings-action-btn is-danger"
              onClick={disconnect}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "해제 중…" : "연결 해제"}
            </button>
          ) : (
            <a className="settings-action-btn" href={connectUrl}>
              연결
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
