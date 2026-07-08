"use client";

import { useCallback, useState } from "react";

type Props = {
  initialConnected: boolean;
};

export function CanvaSettingsSection({ initialConnected }: Props) {
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
    if (!window.confirm("Canva \uC5F0\uB3D9\uC744 \uD574\uC81C\uD560\uAE4C\uC694? \uC378\uB124\uC77C\uACFC \uB514\uC790\uC778 \uAC00\uC838\uC624\uAE30\uAC00 \uB3D9\uC791\uD558\uC9C0 \uC54A\uC744 \uC218 \uC788\uC5B4\uC694.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/canva", { method: "DELETE" });
      if (!res.ok) throw new Error("disconnect failed");
      setConnected(false);
    } catch {
      setError("\uC5F0\uB3D9 \uD574\uC81C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2 className="docs-h2">Canva \uC5F0\uB3D9</h2>
      </div>
      <div className="settings-card">
        <div className="settings-card-body">
          <div className="settings-card-status">
            {connected ? (
              <span className="settings-status settings-status--success">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {" "}\uC5F0\uB3D9\uB428
              </span>
            ) : (
              <span className="settings-status settings-status--danger">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {" "}\uC5F0\uB3D9 \uB04A\uAE40
              </span>
            )}
          </div>
          <p className="settings-card-hint">
            {connected
              ? "Canva \uB514\uC790\uC778 \uC378\uB124\uC77C\uACFC \uB0B4\uBCF4\uB0B4\uAE30, \uD3F4\uB354 \uC815\uB9AC \uAE30\uB2A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694."
              : "Canva \uC5F0\uB3D9\uC774 \uB04A\uACA8\uC2B5\uB2C8\uB2E4. \uB514\uC790\uC778 \uC378\uB124\uC77C\uC774 \uBCF4\uC774\uC9C0 \uC54A\uAC70\uB098 \uB0B4\uBCF4\uB0B4\uAE30\uAC00 \uC548 \uB418\uBA74 \uB2E4\uC2DC \uC5F0\uACB0\uD574\uC8FC\uC138\uC694."}
          </p>
        </div>
        <div className="settings-card-action">
          {connected ? (
            <button
              type="button"
              className="settings-btn settings-btn-secondary"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {busy ? "\uD574\uC81C \uC911..." : "\uC5F0\uB3D9 \uD574\uC81C"}
            </button>
          ) : (
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              onClick={handleConnect}
            >
              Canva \uB2E4\uC2DC \uC5F0\uACB0\uD558\uAE30
            </button>
          )}
        </div>
        {error && <p className="settings-error">{error}</p>}
      </div>
    </section>
  );
}