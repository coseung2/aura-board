import Link from "next/link";
import { getCurrentParent } from "@/lib/parent-session";

// Account overview (PV-11 entry). Parent accounts are viewer-only, so this
// page shows identity details and the withdraw confirm flow only.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentAccountPage() {
  const current = (await getCurrentParent())!;
  const p = current.parent;

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: 16,
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "var(--color-text, #111827)",
      }}
    >
      <h1 style={{ fontSize: 20, margin: "8px 0 16px" }}>계정</h1>
      <section
        style={{
          padding: 16,
          background: "var(--color-surface, #fff)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
        }}
      >
        <Row label="이름" value={p.name} />
        <Row label="이메일" value={p.email} />
      </section>

      <div style={{ marginTop: 24 }}>
        <Link
          href="/parent/account/withdraw"
          prefetch={false}
          style={{
            display: "block",
            padding: 14,
            textAlign: "center",
            color: "var(--color-danger, #dc2626)",
            background: "var(--color-surface, #fff)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: 12,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          계정 탈퇴
        </Link>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted, #6b7280)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          탈퇴 후 90일이 지나면 개인정보가 익명화됩니다.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border, #e5e7eb)",
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--color-text-muted, #6b7280)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
