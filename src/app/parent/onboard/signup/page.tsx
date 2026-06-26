"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingShell } from "../_shell";
import { ParentAuthButtons } from "@/components/parent/ParentAuthButtons";

// parent-class-invite-v2 - P1 Signup.
// parent-redesign (2026-04-26): OAuth(Google/Kakao) 버튼 + 매직링크 fallback.
// 1차 진입은 OAuth, 매직링크는 보조. URL ?error=... 가 있으면 OAuth 흐름
// 에서 돌아온 에러 - 진입점에서 사용자에게 안내.

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_disabled:
    "현재 OAuth 로그인이 비활성화돼 있어요. 관리자에게 문의하거나 매직링크로 로그인해 주세요.",
  invalid_provider: "잘못된 OAuth provider 입니다.",
  invalid_state: "로그인 인증이 만료됐어요. 다시 시도해 주세요.",
  missing_params: "OAuth 응답이 누락됐어요. 다시 시도해 주세요.",
  missing_pkce: "보안 키가 누락됐어요. 다시 시도해 주세요.",
  token_exchange_failed: "OAuth 토큰 교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
  userinfo_failed: "OAuth 사용자 정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.",
  upsert_failed: "계정 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

export default function ParentSignupPage() {
  return (
    <Suspense fallback={<OnboardingShell step={1} total={4}><h1 style={titleStyle}>학부모 로그인</h1></OnboardingShell>}>
      <ParentSignupBody />
    </Suspense>
  );
}

function ParentSignupBody() {
  const searchParams = useSearchParams();
  const oauthError = searchParams?.get("error") ?? null;
  const oauthErrorMsg = oauthError
    ? OAUTH_ERROR_MESSAGES[oauthError] ??
      `로그인 중 오류가 발생했어요 (${oauthError})`
    : null;
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ email: string; devUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMagicLink, setShowMagicLink] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/parent/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setError(j.error === "rate_limited" ? "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." : "잠시 후 다시 시도해 주세요");
        return;
      }
      setSent({ email: email.trim(), devUrl: j.devMagicLinkUrl ?? null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <OnboardingShell>
        <h1 style={titleStyle}>메일함을 확인해 주세요</h1>
        <p style={bodyStyle}>
          <strong>{sent.email}</strong> 으로 매직링크를 보냈습니다. 15분간 유효합니다.
        </p>
        {sent.devUrl && (
          <div style={devStyle}>
            [DEV] 이메일 인프라 미연결 - 다음 링크로 바로 인증하세요:
            <div style={{ marginTop: 6, wordBreak: "break-all" }}>
              <a href={sent.devUrl}>{sent.devUrl}</a>
            </div>
          </div>
        )}
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={1} total={4}>
      <h1 style={titleStyle}>학부모 로그인</h1>
      <p style={bodyStyle}>
        Google 또는 Kakao 계정으로 빠르게 시작할 수 있어요.
      </p>
      {oauthErrorMsg && (
        <div role="alert" style={errorBannerStyle}>
          ⚠ {oauthErrorMsg}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <ParentAuthButtons />
      </div>
      <div style={{ marginTop: 24, textAlign: "center" }}>
        {!showMagicLink ? (
          <button
            type="button"
            onClick={() => setShowMagicLink(true)}
            style={linkBtn}
          >
            이메일 매직링크로 로그인
          </button>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <input
              type="email"
              placeholder="parent@example.com"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="이메일"
              style={inputStyle}
            />
            <button type="submit" disabled={!valid || submitting} style={primaryBtn(valid && !submitting)}>
              {submitting ? "매직링크 발송 중..." : "매직링크 받기"}
            </button>
            {error && <p style={{ color: "var(--color-danger)", fontSize: 13, margin: 0 }}>{error}</p>}
          </form>
        )}
      </div>
    </OnboardingShell>
  );
}

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--color-text-muted)",
  fontSize: 13,
  textDecoration: "underline",
  cursor: "pointer",
  padding: 4,
};

const errorBannerStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 14px",
  background: "var(--color-status-returned-bg, #ffebee)",
  color: "var(--color-status-returned-text, #c62828)",
  border: "1px solid var(--color-status-returned-text, #c62828)",
  borderRadius: 6,
  fontSize: 13,
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const bodyStyle: React.CSSProperties = { margin: "8px 0 0", fontSize: 15, color: "var(--color-text-muted)" };
const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  height: 48,
  fontSize: 15,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--color-surface)",
};
const primaryBtn = (active: boolean): React.CSSProperties => ({
  height: 56,
  padding: "0 20px",
  borderRadius: "var(--radius-btn)",
  border: "none",
  background: active ? "var(--color-accent)" : "var(--color-border)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: active ? "pointer" : "not-allowed",
  boxShadow: active ? "var(--shadow-accent)" : "none",
});
const devStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "var(--color-warning-tinted-bg)",
  border: "1px dashed var(--color-warning)",
  borderRadius: 6,
  fontSize: 12,
};
