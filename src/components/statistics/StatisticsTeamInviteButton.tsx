"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { TeamMemberDTO, RosterStudentDTO } from "./StatisticsBoardClient";

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  already_in_another_team: "이 친구는 이미 다른 팀에서 활동하고 있어요.",
  already_assigned: "이 친구는 이미 우리 팀에 있어요.",
  board_has_no_classroom: "이 보드에는 학급 명단이 연결되어 있지 않아요.",
  forbidden: "우리 팀에 초대할 수 있는 권한이 없어요.",
  student_not_found: "명단에서 이 친구를 찾을 수 없어요.",
  student_not_in_classroom: "이 보드의 학급 친구만 초대할 수 있어요.",
  "studentId required": "초대할 친구를 먼저 골라 주세요.",
};

export function StatisticsTeamInviteButton({
  sectionId,
  rosterStudents,
  teamMembers,
  onInvite,
}: {
  sectionId: string;
  rosterStudents: RosterStudentDTO[];
  teamMembers: TeamMemberDTO[];
  onInvite?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const memberIds = useMemo(
    () => new Set(teamMembers.map((m) => m.studentId)),
    [teamMembers]
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rosterStudents
      .filter((s) => !memberIds.has(s.id))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.number != null && String(s.number).includes(q))
      );
  }, [rosterStudents, memberIds, search]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function invite() {
    if (!selectedId) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorCode = typeof data.error === "string" ? data.error : "";
        alert(INVITE_ERROR_MESSAGES[errorCode] ?? "초대하지 못했어요. 잠시 후 다시 해 주세요.");
        return;
      }
      setSelectedId(null);
      setSearch("");
      setOpen(false);
      onInvite?.();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="team-invite-container" ref={ref}>
      <button
        className="team-invite-trigger"
        onClick={() => setOpen((v) => !v)}
        title="팀원 초대"
        aria-label="팀원 초대"
      >
        +
      </button>

      {open && (
        <div className="team-invite-dropdown">
          <div className="team-invite-header">
            <span className="team-invite-title">팀원 초대</span>
            <button className="team-invite-close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <input
            className="team-invite-search"
            type="text"
            placeholder="학생 이름 또는 번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="team-invite-list">
            {candidates.length === 0 ? (
              <p className="team-invite-empty">검색 결과가 없습니다.</p>
            ) : (
              candidates.map((s) => (
                <button
                  key={s.id}
                  className={`team-invite-candidate ${selectedId === s.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="candidate-name">
                    {s.number != null ? `${s.number}. ` : ""}
                    {s.name}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="team-invite-actions">
            <button
              className="btn-primary team-invite-btn"
              onClick={invite}
              disabled={!selectedId || inviting}
            >
              {inviting ? "초대 중..." : "초대하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
