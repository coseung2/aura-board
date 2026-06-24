"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AddStudentsModal, type CreatedStudent } from "./AddStudentsModal";
import { QRPrintSheet } from "./QRPrintSheet";
import { ClassroomDeleteModal } from "./classroom/ClassroomDeleteModal";
import { ClassroomSettingsModal } from "./classroom/ClassroomSettingsModal";
import { StudentRow, type Student } from "./classroom/StudentRow";
// parent-class-invite-v2 — per-student ParentInviteButton removed.
// Codes are now classroom-scoped (see /classroom/[id]/parent-access).
// The separate ParentManagementTab widget was pulled too — connected
// parents now surface as a count column in the student table, and the
// full inbox UI lives on the parent-access page (linked via the
// 🔗 초대 코드 · 승인 관리 action-bar button).

type Board = {
  id: string;
  slug: string;
  title: string;
  layout: string;
};

type Props = {
  classroom: {
    id: string;
    name: string;
    code: string;
    students: Student[];
    boards: Board[];
  };
};

// Tab navigation moved to the top <ClassroomNav />. 학부모 연결/공유된 보드
// = 각자 페이지로 이동. 설정 = 학급명 옆 톱니바퀴 → 모달. (2026-04-21)

export function ClassroomDetail({ classroom }: Props) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [students, setStudents] = useState(classroom.students);
  const linkedBoardCount = classroom.boards.length;
  const [showAddStudents, setShowAddStudents] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showClassroomDelete, setShowClassroomDelete] = useState(false);
  const [deletingClassroom, setDeletingClassroom] = useState(false);
  const [classroomName, setClassroomName] = useState(classroom.name);
  const [renaming, setRenaming] = useState(false);
  const [renameErr, setRenameErr] = useState<string | null>(null);

  // Per-student parent-link counts, loaded once on mount and refreshed on
  // approval/revoke actions elsewhere. Plain Record keyed by studentId
  // so the table row lookup is O(1). Count = active links only.
  const [parentCounts, setParentCounts] = useState<Record<string, number>>({});

  // Classroom-role defs + current (studentId → roleKey) assignments for the
  // 역할 column dropdown. One role per student (enforced by PUT endpoint).
  const [roleDefs, setRoleDefs] = useState<
    { key: string; labelKo: string; emoji: string | null }[]
  >([]);
  const [studentRoleKey, setStudentRoleKey] = useState<Record<string, string>>({});
  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await fetch(`/api/classrooms/${classroom.id}/roles`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          defs: { id: string; key: string; labelKo: string; emoji: string | null }[];
          assignments: { studentId: string; classroomRoleId: string }[];
        };
        setRoleDefs(
          data.defs.map((d) => ({
            key: d.key,
            labelKo: d.labelKo,
            emoji: d.emoji,
          }))
        );
        const keyById = new Map(data.defs.map((d) => [d.id, d.key]));
        const next: Record<string, string> = {};
        for (const a of data.assignments) {
          const k = keyById.get(a.classroomRoleId);
          if (k) next[a.studentId] = k;
        }
        setStudentRoleKey(next);
      } catch {
        // silent — column falls back to "없음"
      }
    }
    loadRoles();
  }, [classroom.id]);

  async function handleRoleChange(studentId: string, roleKey: string) {
    const prev = studentRoleKey[studentId] ?? "";
    const next = roleKey === "" ? "" : roleKey;
    // Optimistic
    setStudentRoleKey((cur) => {
      const copy = { ...cur };
      if (next === "") delete copy[studentId];
      else copy[studentId] = next;
      return copy;
    });
    const res = await fetch(`/api/classrooms/${classroom.id}/roles/set`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        studentId,
        roleKey: next === "" ? null : next,
      }),
    });
    if (!res.ok) {
      // rollback
      setStudentRoleKey((cur) => {
        const copy = { ...cur };
        if (prev === "") delete copy[studentId];
        else copy[studentId] = prev;
        return copy;
      });
    }
  }

  // Count of pending approval requests across this classroom. Shown as a
  // red badge next to the "초대 코드·승인 관리" action-bar button so the
  // teacher sees inbox activity without leaving the student management
  // screen. 60s poll matches the polling cadence inside /parent-access.
  // (Inline approve/reject UI moved to /classroom/[id]/parent-access —
  //  this surface only tracks the count.)
  const [pendingCount, setPendingCount] = useState<number>(0);

  async function loadPendingCount() {
    try {
      const res = await fetch(
        `/api/parent/approvals?classroomId=${encodeURIComponent(classroom.id)}&status=pending`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setPendingCount((data.items ?? []).length);
      }
    } catch {
      /* best-effort; badge just stays at last known value */
    }
  }

  useEffect(() => {
    async function loadParentLinks() {
      try {
        const res = await fetch(
          `/api/classroom/${classroom.id}/parent-links`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const counts: Record<string, number> = {};
        for (const link of data.links ?? []) {
          const sid = link.student?.id;
          if (!sid) continue;
          counts[sid] = (counts[sid] ?? 0) + 1;
        }
        setParentCounts(counts);
      } catch {
        /* best-effort; header badges fall back to 0 */
      }
    }
    loadParentLinks();
    void loadPendingCount();
    const poll = setInterval(() => void loadPendingCount(), 60_000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom.id]);

  const allSelected = students.length > 0 && selected.size === students.length;

  function handleStudentsAdded(newStudents: CreatedStudent[]) {
    // Optimistic: splice new students into the existing list locally,
    // keeping the table sorted by student number (with unnumbered at the end).
    setStudents((prev) => {
      const normalized = newStudents.map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        qrToken: s.qrToken,
        textCode: s.textCode,
        createdAt: s.createdAt,
      }));
      const merged = [...prev, ...normalized];
      merged.sort((a, b) => {
        if (a.number == null && b.number == null) {
          return a.createdAt.localeCompare(b.createdAt);
        }
        if (a.number == null) return 1;
        if (b.number == null) return -1;
        return a.number - b.number;
      });
      return merged;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(students.map((s) => s.id)));
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명의 학생을 삭제하시겠습니까?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/classroom/${classroom.id}/students/batch-delete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ studentIds: Array.from(selected) }),
        }
      );
      if (res.ok) {
        setStudents((prev) => prev.filter((s) => !selected.has(s.id)));
        setSelected(new Set());
      } else {
        alert(`삭제 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
    setDeleting(false);
  }

  async function handleRenameClassroom(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === classroomName) return;
    setRenaming(true);
    setRenameErr(null);
    try {
      const res = await fetch(`/api/classroom/${classroom.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setClassroomName(trimmed);
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRenameErr(body.error ?? `rename ${res.status}`);
      }
    } catch (err) {
      setRenameErr((err as Error).message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteClassroom() {
    setDeletingClassroom(true);
    try {
      const res = await fetch(`/api/classroom/${classroom.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: classroom.name }),
      });
      if (res.ok) {
        router.push("/classroom");
      } else {
        const errText = await res.text();
        alert(`학급 삭제 실패: ${errText}`);
      }
    } catch (err) {
      console.error("[handleDeleteClassroom]", err);
      alert("학급 삭제에 실패했습니다.");
    } finally {
      setDeletingClassroom(false);
    }
  }

  async function handleReissue(studentId: string) {
    if (
      !confirm(
        "이 학생의 QR 코드를 재발급하시겠습니까? 기존 코드는 사용할 수 없게 됩니다."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/classroom/${classroom.id}/students/${studentId}/reissue`,
        { method: "POST" }
      );
      if (res.ok) {
        const { student: updated } = await res.json();
        setStudents((prev) =>
          prev.map((s) => (s.id === studentId ? { ...s, ...updated } : s))
        );
      } else {
        alert(`재발급 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(studentId: string) {
    if (!confirm("이 학생을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(
        `/api/classroom/${classroom.id}/students/${studentId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setStudents((prev) => prev.filter((s) => s.id !== studentId));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      } else {
        alert(`삭제 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="classroom-detail">
      {/* Header — classroom.code used to be displayed here as a 6-char
          "learner code" but no lookup path actually consumes it (student
          login uses per-student textCode; parents use ClassInviteCode).
          The field stays in the DB schema for future use. */}
      <div className="classroom-detail-header">
        <div className="classroom-detail-header-main">
          <div className="classroom-detail-name-row">
            <h1 className="classroom-detail-name">{classroomName}</h1>
            <button
              type="button"
              className="classroom-settings-gear"
              onClick={() => setShowSettings(true)}
              title="학급 설정"
              aria-label="학급 설정"
            >
              ⚙
            </button>
          </div>
          <p className="classroom-detail-meta">
            학생 {students.length}명 · 보드 {linkedBoardCount}개
          </p>
        </div>
        <a
          href={`/classroom/${classroom.id}/parent-access`}
          className="classroom-invite-card"
        >
          <div>
            <div className="classroom-invite-label">학부모 초대 코드</div>
            <div className="classroom-invite-cta">코드 · 승인 관리 →</div>
          </div>
          {pendingCount > 0 && (
            <span
              className="classroom-invite-badge"
              aria-label={`승인 대기 ${pendingCount}건`}
              title={`승인 대기 ${pendingCount}건`}
            >
              {pendingCount}
            </span>
          )}
        </a>
      </div>

      {/* Tab navigation owned by the top <ClassroomNav />:
          학생 명단 = this page, 학부모 연결 = /parent-access,
          공유된 보드 = /boards, 설정 = 학급명 옆 톱니바퀴 → 설정 모달.
          2026-04-21. */}
      {/* Action bar */}
      <div className="classroom-action-bar">
        <button
          type="button"
          className="classroom-action-btn"
          onClick={() => setShowAddStudents(true)}
        >
          + 학생 추가
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            className="classroom-action-btn"
            style={{
              background: "var(--color-danger)",
              color: "#fff",
              borderColor: "var(--color-danger)",
            }}
            onClick={handleBatchDelete}
            disabled={deleting}
          >
            {deleting ? "삭제 중..." : `${selected.size}명 삭제`}
          </button>
        )}
        <QRPrintSheet students={students} classroomName={classroomName} />
      </div>

      <div className="classroom-table-wrap">
        {students.length === 0 ? (
          <div className="classroom-empty">
            <p className="classroom-empty-text">아직 학생이 없습니다</p>
            <button
              type="button"
              className="classroom-empty-btn"
              onClick={() => setShowAddStudents(true)}
            >
              + 학생 추가
            </button>
          </div>
        ) : (
          <table className="classroom-table">
            <thead>
              <tr>
                <th className="classroom-th" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="전체 선택"
                  />
                </th>
                <th className="classroom-th classroom-th-num">#</th>
                <th
                  className="classroom-th"
                  style={{ width: 44 }}
                  aria-label="아바타"
                />
                <th className="classroom-th">이름 / 역할</th>
                <th className="classroom-th">QR</th>
                <th className="classroom-th">코드</th>
                <th className="classroom-th">학부모</th>
                <th className="classroom-th classroom-th-actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  classroomId={classroom.id}
                  parentCount={parentCounts[s.id] ?? 0}
                  roleKey={studentRoleKey[s.id] ?? ""}
                  roleDefs={roleDefs}
                  onRoleChange={(k) => handleRoleChange(s.id, k)}
                  checked={selected.has(s.id)}
                  onToggle={() => toggleSelect(s.id)}
                  onReissue={() => handleReissue(s.id)}
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings moved to a modal opened by the ⚙ gear button next to the
          classroom name. Content kept 1:1 with the old 설정 탭. */}
      {showSettings && (
        <ClassroomSettingsModal
          classroomId={classroom.id}
          classroomName={classroomName}
          students={students}
          renaming={renaming}
          renameErr={renameErr}
          onRename={(next) => void handleRenameClassroom(next)}
          onClose={() => setShowSettings(false)}
          onRequestDelete={() => {
            setShowSettings(false);
            setShowClassroomDelete(true);
          }}
        />
      )}

      {/* Add students modal */}
      {showAddStudents && (
        <AddStudentsModal
          open={showAddStudents}
          classroomId={classroom.id}
          onClose={() => setShowAddStudents(false)}
          onAdded={(newStudents) => {
            setShowAddStudents(false);
            handleStudentsAdded(newStudents);
          }}
        />
      )}

      {/* Classroom delete — re-type classroom name to confirm. Backend
          cascades parent-link revokes and emails the affected parents. */}
      <ClassroomDeleteModal
        open={showClassroomDelete}
        classroomName={classroomName}
        pendingCount={pendingCount}
        activeCount={Object.values(parentCounts).reduce((a, b) => a + b, 0)}
        onConfirm={async () => {
          await handleDeleteClassroom();
          setShowClassroomDelete(false);
        }}
        onCancel={() => {
          if (!deletingClassroom) setShowClassroomDelete(false);
        }}
      />
    </div>
  );
}
