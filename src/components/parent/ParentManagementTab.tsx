"use client";

import { useCallback, useEffect, useState } from "react";

// PV-8 — teacher-facing classroom management tab. Standalone widget so it
// can be mounted into any classroom detail page without rewriting the
// existing shell. Consumes /api/classroom/[id]/parent-links and
// /api/parent/links/[id] (DELETE).
//
// Revoke flow: optimistic removal from the list + server confirm. Failure
// restores the item with a toast-style message.

interface LinkRow {
  id: string;
  createdAt: string;
  student: { id: string; name: string; number: number | null };
  parent: { id: string; name: string; email: string };
  lastSeenAt: string | null;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "접속 이력 없음";
  const t = new Date(iso);
  const diffMin = Math.floor((Date.now() - t.getTime()) / 60_000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hr = Math.floor(diffMin / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return t.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function ParentManagementTab({ classroomId }: { classroomId: string }) {
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/parent-links`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setRows(data.links ?? []);
    } catch (e) {
      setErr("학부모 연결 목록을 불러오지 못했습니다.");
      console.error("[ParentManagementTab] load", e);
    }
  }, [classroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevoke = useCallback(
    async (linkId: string) => {
      if (!confirm("이 학부모의 연결을 해제하시겠어요? 즉시 접근이 차단됩니다.")) {
        return;
      }
      setBusyIds((s) => new Set(s).add(linkId));
      try {
        const res = await fetch(`/api/parent/links/${linkId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setRows((r) => r?.filter((row) => row.id !== linkId) ?? null);
      } catch (e) {
        console.error("[ParentManagementTab] revoke", e);
        alert("연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setBusyIds((s) => {
          const next = new Set(s);
          next.delete(linkId);
          return next;
        });
      }
    },
    []
  );

  if (err) {
    return (
      <div style={{ padding: 16, color: "var(--color-danger, #dc2626)" }}>
        {err}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div style={{ padding: 16, color: "var(--color-text-muted, #6b7280)" }}>
        불러오는 중…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--color-text-muted, #6b7280)" }}>
        아직 학부모 연결이 없습니다.
      </div>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gap: 8,
      }}
    >
      {rows.map((row) => {
        const busy = busyIds.has(row.id);
        return (
          <li
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-border, #e5e7eb)",
              borderRadius: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {row.student.name}
                {row.student.number != null ? ` (${row.student.number}번)` : ""}
                <span
                  style={{
                    marginLeft: 8,
                    fontWeight: 400,
                    fontSize: 12,
                    color: "var(--color-text-muted, #6b7280)",
                  }}
                >
                  ← {row.parent.name}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-muted, #6b7280)",
                  marginTop: 2,
                }}
              >
                {row.parent.email} · {formatLastSeen(row.lastSeenAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRevoke(row.id)}
              disabled={busy}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--color-danger, #dc2626)",
                background: busy ? "var(--color-surface-muted, #f9fafb)" : "#fff",
                color: "var(--color-danger, #dc2626)",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {busy ? "해제 중…" : "해제"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
