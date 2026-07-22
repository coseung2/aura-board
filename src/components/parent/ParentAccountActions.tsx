"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ParentAccountLink = {
  id: string;
  status: "pending" | "active";
  studentName: string;
  studentNumber: number | null;
  classroomName: string;
};

type Props = {
  initialLinks: ParentAccountLink[];
};

export function ParentAccountActions({ initialLinks }: Props) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setBusy("logout");
    setError(null);
    try {
      const res = await fetch("/api/parent/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      router.replace("/login?role=parent&error=logged_out");
    } catch (e) {
      console.error("[ParentAccountActions] logout", e);
      setError("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  async function handleRemove(link: ParentAccountLink) {
    const action = link.status === "pending" ? "신청을 취소" : "연결을 해제";
    if (!confirm(`${link.studentName} 학생 ${action}하시겠어요?`)) return;

    setBusy(link.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/parent/my-links/${encodeURIComponent(link.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      setLinks((current) => current.filter((item) => item.id !== link.id));
      router.refresh();
    } catch (e) {
      console.error("[ParentAccountActions] remove link", e);
      setError("처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={{ marginTop: 20, display: "grid", gap: 16 }}>
      <div
        style={{
          padding: 16,
          background: "var(--color-surface, #fff)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>자녀 연결</h2>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 13,
            color: "var(--color-text-muted, #6b7280)",
            lineHeight: 1.5,
          }}
        >
          잘못 신청한 자녀는 승인 전에는 신청 취소, 승인 후에는 연결 해제를 할
          수 있습니다.
        </p>
        {links.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            연결된 자녀나 대기 중인 신청이 없습니다.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {links.map((link) => (
              <li
                key={link.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 0",
                  borderTop: "1px solid var(--color-border, #e5e7eb)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {link.studentName}
                    {link.studentNumber != null
                      ? ` (${link.studentNumber}번)`
                      : ""}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: "var(--color-text-muted, #6b7280)",
                    }}
                  >
                    {link.classroomName} ·{" "}
                    {link.status === "pending" ? "승인 대기" : "연결됨"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(link)}
                  disabled={busy === link.id}
                  style={{
                    flex: "0 0 auto",
                    padding: "8px 10px",
                    border: "1px solid var(--color-border, #e5e7eb)",
                    borderRadius: 8,
                    background: "var(--color-surface, #fff)",
                    color:
                      link.status === "pending"
                        ? "var(--color-text, #111827)"
                        : "var(--color-danger, #dc2626)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busy === link.id ? "not-allowed" : "pointer",
                  }}
                >
                  {busy === link.id
                    ? "처리 중..."
                    : link.status === "pending"
                      ? "신청 취소"
                      : "연결 해제"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={busy === "logout"}
        style={{
          width: "100%",
          padding: 14,
          background:
            busy === "logout"
              ? "var(--color-surface-muted, #f9fafb)"
              : "var(--color-surface, #fff)",
          color: "var(--color-text, #111827)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 14,
          cursor: busy === "logout" ? "not-allowed" : "pointer",
        }}
      >
        {busy === "logout" ? "로그아웃 중..." : "로그아웃"}
      </button>

      {error ? (
        <p
          style={{
            margin: 0,
            color: "var(--color-danger, #dc2626)",
            fontSize: 12,
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
