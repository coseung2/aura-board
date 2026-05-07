"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RosterStudentDTO, TeamMemberDTO } from "./StatisticsBoardClient";

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  already_in_another_team: "이 학생은 이미 다른 팀에서 작업 중이에요.",
  already_assigned: "이 학생은 이미 우리 팀에 있어요.",
  board_has_no_classroom: "이 보드에는 학급 명단이 연결되어 있지 않아요.",
  forbidden: "팀 초대 권한이 없어요.",
  student_not_found: "학생을 찾지 못했어요.",
  student_not_in_classroom: "같은 학급 학생만 초대할 수 있어요.",
  "studentId required": "먼저 초대할 학생을 골라 주세요.",
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
    () => new Set(teamMembers.map((member) => member.studentId)),
    [teamMembers]
  );

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rosterStudents
      .filter((student) => !memberIds.has(student.id))
      .filter(
        (student) =>
          !query ||
          student.name.toLowerCase().includes(query) ||
          (student.number != null && String(student.number).includes(query))
      );
  }, [rosterStudents, memberIds, search]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function requestInvite(replaceExisting: boolean) {
    return fetch(`/api/sections/${sectionId}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: selectedId,
        replaceExisting,
      }),
    });
  }

  async function invite() {
    if (!selectedId) return;

    setInviting(true);
    try {
      let res = await requestInvite(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorCode = typeof data.error === "string" ? data.error : "";

        if (errorCode === "already_in_another_team") {
          const shouldReplace = window.confirm(
            "이 학생은 이미 다른 팀에서 작업 중이에요. 기존 팀 작업을 버리고 우리 팀으로 옮길까요?"
          );
          if (shouldReplace) {
            res = await requestInvite(true);
          }
        }

        if (!res.ok) {
          alert(
            INVITE_ERROR_MESSAGES[errorCode] ??
              "초대하지 못했어요. 잠시 후 다시 시도해 주세요."
          );
          return;
        }
      }

      setSelectedId(null);
      setSearch("");
      setOpen(false);
      onInvite?.();
    } catch {
      alert("네트워크 오류가 발생했어요.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="team-invite-container" ref={ref}>
      <button
        className="team-invite-trigger"
        onClick={() => setOpen((value) => !value)}
        title="팀원 초대"
        aria-label="팀원 초대"
      >
        +
      </button>

      {open && (
        <div className="team-invite-dropdown">
          <div className="team-invite-header">
            <span className="team-invite-title">팀원 초대</span>
            <button
              className="team-invite-close"
              onClick={() => setOpen(false)}
              aria-label="팀원 초대 닫기"
            >
              x
            </button>
          </div>

          <input
            className="team-invite-search"
            type="text"
            placeholder="학생 이름 또는 번호 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="team-invite-list">
            {candidates.length === 0 ? (
              <p className="team-invite-empty">검색 결과가 없어요.</p>
            ) : (
              candidates.map((student) => (
                <button
                  key={student.id}
                  className={`team-invite-candidate ${
                    selectedId === student.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedId(student.id)}
                >
                  <span className="candidate-name">
                    {student.number != null ? `${student.number}. ` : ""}
                    {student.name}
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
