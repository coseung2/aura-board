import { ParentAuthButtons } from "@/components/parent/ParentAuthButtons";

// PV-9 terminal state after teacher-initiated revoke or client-side 401.
// Deliberately rendered outside `(app)` so it doesn't trigger the layout
// session redirect (which would bounce the parent back to /parent/onboard/signup).
//
// parent-redesign (2026-04-26): "새 코드 입력하기" 버튼 → OAuth 버튼 2개로
// 교체. 로그아웃/세션 만료 후 다시 진입 시 학부모는 로그인부터 시작 (자녀
// 코드는 로그인 후 입력).

export const dynamic = "force-static";

export default function ParentLoggedOutPage() {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: "0 auto",
        padding: "48px 16px",
        textAlign: "center",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "var(--color-text, #111827)",
      }}
    >
      <div aria-hidden style={{ fontSize: 44, marginBottom: 16 }}>
        {"\u{1F512}"}
      </div>
      <h1 style={{ fontSize: 20, margin: 0 }}>접근이 해제되었습니다</h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-muted, #6b7280)",
          marginTop: 12,
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        교사가 연결을 해제했거나 세션이 만료되었습니다. 다시 로그인해 주세요.
      </p>
      <ParentAuthButtons />
    </main>
  );
}
