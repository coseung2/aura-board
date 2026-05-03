"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { TeamMemberDTO, RosterStudentDTO } from "./StatisticsBoardClient";

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
        alert(data.error || "초대에 실패했습니다.");
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
