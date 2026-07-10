"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ParentPendingLinkView } from "@/lib/parent-pending-link";

export type ParentPendingLink = ParentPendingLinkView;

type Props = {
  links: ParentPendingLink[];
  compact?: boolean;
};

export function ParentPendingLinks({ links, compact = false }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(links);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancelRequest(link: ParentPendingLink) {
    if (!confirm(`${link.studentName} 학생 연결 신청을 취소하시겠어요?`)) return;

    setBusy(link.id);
    setError(null);
    try {
      const res = await fetch(`/api/parent/my-links/${encodeURIComponent(link.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setItems((current) => current.filter((item) => item.id !== link.id));
      router.refresh();
    } catch (e) {
      console.error("[ParentPendingLinks] cancel request", e);
      setError("신청 취소에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className={`parent-pending-panel ${compact ? "is-compact" : ""}`}>
      <div className="parent-pending-panel-head">
        <div>
          <p className="parent-pending-kicker">승인 대기</p>
          <h2>선생님 승인을 기다리고 있어요</h2>
        </div>
      </div>
      <p className="parent-pending-help">
        승인 전에도 신청 상태를 여기서 확인할 수 있습니다. 잘못 신청했다면 취소하고 다시 연결하세요.
      </p>
      <ul className="parent-pending-list">
        {items.map((link) => (
          <li key={link.id} className="parent-pending-item">
            <div className="parent-pending-main">
              <span className="parent-pending-status">대기 중</span>
              <strong>
                {link.studentName}
                {link.studentNumber != null ? ` (${link.studentNumber}번)` : ""}
              </strong>
              <span>{link.classroomName}</span>
            </div>
            <div className="parent-pending-meta">
              <span>{link.requestedAtLabel} 신청</span>
              <span>
                {link.expiresInDays > 0
                  ? `${link.expiresInDays}일 뒤 자동 만료`
                  : "곧 자동 만료"}
              </span>
            </div>
            <button
              type="button"
              className="parent-pending-cancel"
              onClick={() => cancelRequest(link)}
              disabled={busy === link.id}
            >
              {busy === link.id ? "처리 중..." : "신청 취소"}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="parent-pending-error">{error}</p> : null}
    </section>
  );
}
