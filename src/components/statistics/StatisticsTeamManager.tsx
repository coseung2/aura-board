"use client";

import { useState, useEffect, useCallback } from "react";

type Student = { id: string; name: string; number: number | null };
type Team = { sectionId: string; title: string; order: number; members: Member[] };
type Member = { id: string; studentId: string; studentName: string; studentNumber: number | null };

export function StatisticsTeamManager({
  boardId,
  sections,
  roster,
  onClose,
  onChange,
}: {
  boardId: string;
  sections: Array<{ id: string; title: string; order: number }>;
  roster: Student[];
  onClose: () => void;
  onChange?: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    const next: Team[] = sections.map((s) => ({ sectionId: s.id, title: s.title, order: s.order, members: [] }));
    for (const team of next) {
      const res = await fetch(`/api/boards/${boardId}/sections/${team.sectionId}/memberships`);
      if (res.ok) {
        const data = await res.json();
        team.members = data.memberships as Member[];
      }
    }
    setTeams(next);
    setLoading(false);
  }, [boardId, sections]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  async function assignStudent(team: Team, student: Student) {
    setPendingStudentId(student.id);
    try {
      const res = await fetch(`/api/boards/${boardId}/sections/${team.sectionId}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      if (res.ok) {
        await fetchTeams();
        onChange?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "배정 실패");
      }
    } finally {
      setPendingStudentId(null);
    }
  }

  async function removeMember(team: Team, member: Member) {
    if (!window.confirm(`${member.studentName} 학생을 팀에서 제거할까요?`)) return;
    try {
      const res = await fetch(
        `/api/boards/${boardId}/sections/${team.sectionId}/memberships/${member.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchTeams();
        onChange?.();
      }
    } finally {
      /* no-op */
    }
  }

  const assignedStudentIds = new Set(teams.flatMap((t) => t.members.map((m) => m.studentId)));
  const unassigned = roster.filter((s) => !assignedStudentIds.has(s.id));

  if (loading) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="add-card-modal" onClick={(e) => e.stopPropagation()}>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="add-card-modal team-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">팀 구성</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body team-manager-body">
          <div className="team-manager-roster">
            <h3>학생 명부 ({unassigned.length}명 미배정)</h3>
            <div className="team-manager-roster-list">
              {unassigned.map((s) => (
                <div key={s.id} className="team-manager-student-chip">
                  <span>{s.number ? `${s.number}. ` : ""}{s.name}</span>
                  <div className="team-manager-assign-buttons">
                    {teams.map((team) => (
                      <button
                        key={team.sectionId}
                        className="btn-team-assign"
                        onClick={() => assignStudent(team, s)}
                        disabled={pendingStudentId === s.id}
                      >
                        {team.title.replace("모둠 ", "")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {unassigned.length === 0 && (
                <p className="team-manager-empty">모든 학생이 배정되었습니다.</p>
              )}
            </div>
          </div>

          <div className="team-manager-teams">
            <h3>팀별 배정 현황</h3>
            <div className="team-manager-team-grid">
              {teams.map((team) => (
                <div key={team.sectionId} className="team-manager-team-card">
                  <h4>{team.title}</h4>
                  <ul className="team-manager-member-list">
                    {team.members.map((m) => (
                      <li key={m.id} className="team-manager-member-item">
                        <span>{m.studentNumber ? `${m.studentNumber}. ` : ""}{m.studentName}</span>
                        <button
                          className="btn-team-remove"
                          onClick={() => removeMember(team, m)}
                          title="제거"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    {team.members.length === 0 && (
                      <li className="team-manager-empty-item">아직 없음</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
