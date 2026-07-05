"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CodeInputCells } from "@/components/parent/CodeInputCells";
import { CODE_LENGTH, normalizeCode } from "@/lib/class-invite-codes-shared";
import { OnboardingShell } from "../../_shell";

// parent-class-invite-v2 — P3 Code Input.
// invite-code-5-digit (2026-04-26): 길이 8 → 5, 컴포넌트 generic 화.
// Next.js requires `useSearchParams` consumers to be wrapped in Suspense so
// the surrounding static boundary can be prerendered. We export a tiny
// wrapper rather than the inner component directly.
export default function MatchCodePage() {
  return (
    <Suspense fallback={null}>
      <MatchCodeInner />
    </Suspense>
  );
}

function MatchCodeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("code");
    if (!raw) return;
    const normalized = normalizeCode(raw);
    if (!normalized) return;
    setCode(normalized.slice(0, CODE_LENGTH));
  }, [searchParams]);

  const submit = async (codeStr: string) => {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch("/api/parent/match/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: codeStr }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 404) setErr("이 코드를 찾을 수 없습니다");
        else if (r.status === 410) setErr("이 코드는 만료되었습니다. 선생님께 새 코드를 요청해 주세요.");
        else if (r.status === 429) setErr("잠시 후 다시 시도해 주세요 (15분)");
        else if (r.status === 401) router.replace("/parent/onboard/signup");
        else setErr("오류가 발생했습니다");
        setCode("");
        return;
      }
      const ticket = j.ticket as string;
      router.push(`/parent/onboard/match/select?ticket=${encodeURIComponent(ticket)}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const ready = code.length === CODE_LENGTH;

  return (
    <OnboardingShell step={2} total={4}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>학급 코드 입력</h1>
      <p style={{ margin: "8px 0 24px", fontSize: 15, color: "var(--color-text-muted)" }}>
        선생님께 받은 {CODE_LENGTH}자리 코드를 입력하세요.
      </p>
      <CodeInputCells
        value={code}
        onChange={setCode}
        onComplete={submit}
        disabled={submitting}
        autoFocus
      />
      {err && (
        <p style={{ textAlign: "center", marginTop: 12, color: "var(--color-danger)", fontSize: 13 }}>
          {err}
        </p>
      )}
      <button
        type="button"
        disabled={!ready || submitting}
        onClick={() => submit(code)}
        style={{
          marginTop: 24,
          width: "100%",
          height: 56,
          borderRadius: "var(--radius-btn)",
          border: "none",
          background: ready ? "var(--color-accent)" : "var(--color-border)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: ready && !submitting ? "pointer" : "not-allowed",
        }}
      >
        {submitting ? "확인 중..." : "다음"}
      </button>
    </OnboardingShell>
  );
}
