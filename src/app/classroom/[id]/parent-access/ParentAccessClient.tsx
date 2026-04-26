"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { InviteCodeCard } from "@/components/parent-access/InviteCodeCard";
import { RotateConfirmModal } from "@/components/parent-access/RotateConfirmModal";
import { PendingRow, type PendingLink, type RejectReason } from "@/components/parent-access/PendingRow";
import { LinkedRow, type LinkedItem } from "@/components/parent-access/LinkedRow";
import { FilterBar, type FilterValue } from "@/components/parent-access/FilterBar";

// parent-class-invite-v2 — teacher parent-access client.
// 2-column Inbox-First layout; left (60%) = approval inbox, right = invite
// code + linked parents. Data via SWR-ish 60s poll (plain setInterval to
// avoid pulling a new dependency for one call site).

interface ActiveCode {
  id: string;
  code: string;
  createdAt: string;
}

export function ParentAccessClient({ classroomId }: { classroomId: string }) {
  return (
    <ToastProvider>
      <InnerPage classroomId={classroomId} />
    </ToastProvider>
  );
}

function InnerPage({ classroomId }: { classroomId: string }) {
  const toast = useToast();
  // ?student=xxx deep-link filter — arrives from the student-table
  // parent count chip on the classroom detail page. Scopes both the
  // inbox and the linked-parents list to a single student.
  const searchParams = useSearchParams();
  const studentFilter = searchParams.get("student");
  const [activeCode, setActiveCode] = useState<ActiveCode | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [linked, setLinked] = useState<LinkedItem[]>([]);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");

  const loadCode = useCallback(async () => {
    const r = await fetch(`/api/class-invite-codes?classroomId=${encodeURIComponent(classroomId)}`);
    if (r.ok) {
      const j = await r.json();
      setActiveCode(j.active);
    }
    setCodeLoading(false);
  }, [classroomId]);

  const loadApprovals = useCallback(async () => {
    const [p, a] = await Promise.all([
      fetch(`/api/parent/approvals?classroomId=${encodeURIComponent(classroomId)}&status=pending`),
      fetch(`/api/parent/approvals?classroomId=${encodeURIComponent(classroomId)}&status=active`),
    ]);
    if (p.ok) {
      const j = await p.json();
      setPending(j.items);
    }
    if (a.ok) {
      const j = await a.json();
      setLinked(
        j.items.map((it: PendingLink & { approvedAt: string | null }) => ({
          linkId: it.linkId,
          parentEmail: it.parentEmail,
          studentId: it.studentId,
          studentName: it.studentName,
          classNo: it.classNo,
          studentNo: it.studentNo,
          approvedAt: it.approvedAt ?? it.requestedAt,
        }))
      );
    }
  }, [classroomId]);

  useEffect(() => {
    loadCode();
    loadApprovals();
    const int = setInterval(loadApprovals, 60_000);
    return () => clearInterval(int);
  }, [loadCode, loadApprovals]);

  const issueCode = async () => {
    const r = await fetch("/api/class-invite-codes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classroomId }),
    });
    if (r.ok) {
      toast.show({ variant: "success", message: "새 코드가 발급되었습니다" });
      loadCode();
    } else {
      toast.show({ variant: "error", message: "발급에 실패했습니다" });
    }
  };

  const doRotate = async () => {
    if (!activeCode) return;
    const r = await fetch(`/api/class-invite-codes/${activeCode.id}/rotate`, { method: "POST" });
    if (r.ok) {
      const j = await r.json();
      toast.show({
        variant: "success",
        message: `새 코드가 발급되었습니다 (기존 대기 ${j.rotatedCount}건은 자동 거부)`,
      });
      setRotateOpen(false);
      loadCode();
      loadApprovals();
    } else {
      toast.show({ variant: "error", message: "회전에 실패했습니다" });
    }
  };

  const onApprove = async (linkId: string) => {
    const r = await fetch(`/api/parent/approvals/${linkId}/approve`, { method: "POST" });
    if (r.ok) {
      toast.show({ variant: "success", message: "승인되었습니다" });
      loadApprovals();
    } else {
      toast.show({ variant: "error", message: "승인에 실패했습니다" });
    }
  };

  const onReject = async (linkId: string, reason: RejectReason) => {
    const r = await fetch(`/api/parent/approvals/${linkId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (r.ok) {
      toast.show({
        variant: "success",
        message: `거부되었습니다 (사유: ${reasonLabel(reason)})`,
      });
      loadApprovals();
    } else {
      toast.show({ variant: "error", message: "거부에 실패했습니다" });
    }
  };

  const onRevoke = async (linkId: string) => {
    // parent-disconnect-broken (2026-04-26): phase7 의 placeholder 가 실배포됨.
    // 실제 endpoint (/api/parent/links/[id] DELETE) 는 이미 정상 동작 — soft-delete
    // + 학부모 세션 전체 revoke (≤60s SLA).
    if (!confirm("이 학부모의 연결을 해제하시겠어요? 즉시 접근이 차단됩니다.")) {
      return;
    }
    const r = await fetch(`/api/parent/links/${linkId}`, { method: "DELETE" });
    if (r.ok) {
      setLinked((prev) => prev.filter((l) => l.linkId !== linkId));
      toast.show({ variant: "success", message: "연결이 해제되었습니다" });
    } else {
      toast.show({ variant: "error", message: "해제에 실패했습니다" });
    }
  };

  const filtered = useMemo(() => {
    let list = pending;
    if (studentFilter) list = list.filter((p) => p.studentId === studentFilter);
    if (filter === "all") return list;
    const threshold = filter === "d3" ? 3 : 6;
    return list.filter((p) => {
      const days = Math.floor((Date.now() - new Date(p.requestedAt).getTime()) / (24 * 60 * 60 * 1000));
      return days >= threshold;
    });
  }, [pending, filter, studentFilter]);

  const linkedFiltered = useMemo(() => {
    if (!studentFilter) return linked;
    return linked.filter((l) => l.studentId === studentFilter);
  }, [linked, studentFilter]);

  return (
    <div>
      {studentFilter && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--color-surface-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-btn)",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            <strong>
              {(pending.find((p) => p.studentId === studentFilter) ??
                linked.find((l) => l.studentId === studentFilter))?.studentName ?? "학생"}
            </strong>
            {" "}
            관련 항목만 보여주고 있습니다.
          </span>
          <a
            href={`/classroom/${classroomId}/parent-access`}
            style={{ fontSize: 13, color: "var(--color-accent)", textDecoration: "none" }}
          >
            필터 해제 ✕
          </a>
        </div>
      )}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(340px, 2fr)", gap: 24, alignItems: "start" }}>
      {/* LEFT: Linked Parents (grows over a school year — primary content). */}
      <section style={cardStyle} aria-labelledby="linked-title">
        <h2 id="linked-title" style={sectionHeaderStyle}>연결된 학부모 ({linkedFiltered.length})</h2>
        {linkedFiltered.length === 0 ? (
          <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 15 }}>
            {studentFilter
              ? "이 학생에 연결된 학부모가 아직 없습니다."
              : "아직 연결된 학부모가 없습니다."}
          </div>
        ) : (
          <div role="list">
            {linkedFiltered.map((l) => (
              <LinkedRow key={l.linkId} link={l} onRevoke={onRevoke} />
            ))}
          </div>
        )}
      </section>

      {/* RIGHT: Invite Code + Pending Approvals (transient inbox under code). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <section style={cardStyle} aria-labelledby="code-title">
          <h2 id="code-title" style={sectionHeaderStyle}>초대 코드</h2>
          <div style={{ padding: 20 }}>
            {codeLoading ? (
              <div style={{ color: "var(--color-text-muted)" }}>불러오는 중...</div>
            ) : activeCode ? (
              <InviteCodeCard
                code={activeCode.code}
                qrJoinUrl={`/parent/onboard/signup`}
                issuedAt={activeCode.createdAt}
                onRotate={() => setRotateOpen(true)}
              />
            ) : (
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>
                  아직 코드가 없습니다. 발급 버튼을 눌러 학부모 초대를 시작하세요.
                </p>
                <button type="button" onClick={issueCode} style={btnPrimary}>
                  초대 코드 발급
                </button>
              </div>
            )}
          </div>
        </section>

        <section style={cardStyle} aria-labelledby="inbox-title">
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h2 id="inbox-title" style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>
              승인 대기 ({pending.length})
            </h2>
            {pending.length > 0 && <FilterBar value={filter} onChange={setFilter} />}
          </header>
          {pending.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: 14 }}>승인 대기 중인 학부모가 없습니다.</div>
            </div>
          ) : (
            <div role="list">
              {filtered.map((p) => (
                <PendingRow key={p.linkId} link={p} onApprove={onApprove} onReject={onReject} />
              ))}
            </div>
          )}
        </section>
      </div>

      <RotateConfirmModal
        open={rotateOpen}
        pendingCount={pending.length}
        onConfirm={doRotate}
        onCancel={() => setRotateOpen(false)}
      />
    </div>
    </div>
  );
}

function reasonLabel(r: RejectReason): string {
  switch (r) {
    case "wrong_child":
      return "자녀 정보 불일치";
    case "not_parent":
      return "학부모가 아님";
    case "other":
      return "기타";
  }
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "var(--border-card)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  overflow: "hidden",
};
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: 0,
  padding: "16px 20px",
  borderBottom: "1px solid var(--color-border)",
};
const btnPrimary: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 20px",
  borderRadius: "var(--radius-btn)",
  border: "none",
  background: "var(--color-accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
