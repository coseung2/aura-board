"use client";

import { useState, useEffect } from "react";
import { MissionStepper } from "./MissionStepper";
import { MissionPanel } from "./MissionPanel";
import { TeacherDashboard } from "./TeacherDashboard";
import { MobileTabBar } from "./MobileTabBar";
import { StatisticsTeamInviteButton } from "./StatisticsTeamInviteButton";
import { useMissionsSSE } from "./useMissionsSSE";

export type MissionDTO = {
  id: string;
  sectionId: string;
  stepNumber: number;
  status:
    | "not_started"
    | "in_progress"
    | "pending_approval"
    | "approved"
    | "teacher_working"
    | "completed";
  content: Record<string, unknown>;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  teacherFeedback: string | null;
  version: number;
};

export type TeamMemberDTO = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
};

export type RosterStudentDTO = {
  id: string;
  name: string;
  number: number | null;
};

export type StatisticsBoardClientProps = {
  boardId: string;
  isTeacher: boolean;
  studentSectionId: string | null;
  teamMembers: TeamMemberDTO[];
  rosterStudents: RosterStudentDTO[];
};

export function StatisticsBoardClient({
  boardId,
  isTeacher,
  studentSectionId,
  teamMembers: initialTeamMembers,
  rosterStudents,
}: StatisticsBoardClientProps) {
  const [sectionId, setSectionId] = useState<string | null>(studentSectionId);
  const [missions, setMissions] = useState<MissionDTO[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(!studentSectionId);
  const [creating, setCreating] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberDTO[]>(initialTeamMembers);

  const currentMission = missions.find((m) => m.stepNumber === currentStep);

  // On mount, if student already has a section, fetch missions
  useEffect(() => {
    async function init() {
      if (!sectionId) {
        setLoading(false);
        return;
      }
      try {
        const missionsRes = await fetch(`/api/sections/${sectionId}/missions`);
        if (missionsRes.ok) {
          const data = await missionsRes.json();
          const list = data.missions as MissionDTO[];
          setMissions(list);
          const firstIncomplete = list.find(
            (m) => m.status !== "approved" && m.status !== "completed"
          );
          setCurrentStep(firstIncomplete?.stepNumber ?? 1);
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [sectionId]);

  async function refreshMissions() {
    if (!sectionId) return;
    const res = await fetch(`/api/sections/${sectionId}/missions`);
    if (res.ok) {
      const data = await res.json();
      setMissions(data.missions as MissionDTO[]);
    }
  }

  async function refreshMembers() {
    if (!sectionId) return;
    const res = await fetch(`/api/sections/${sectionId}/memberships`);
    if (res.ok) {
      const data = await res.json();
      setTeamMembers(data.memberships as TeamMemberDTO[]);
    }
  }

  useMissionsSSE(boardId, refreshMissions);

  async function createTeam() {
    setCreating(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/teams`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "already_in_team" && data.sectionId) {
          setSectionId(data.sectionId);
          return;
        }
        alert(data.error || "팀 만들기에 실패했습니다.");
        return;
      }
      const data = await res.json();
      setSectionId(data.sectionId);
      setTeamMembers([]);
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="statistics-loading">미션을 불러오는 중...</div>;
  }

  if (isTeacher) {
    return <TeacherDashboard boardId={boardId} />;
  }

  if (!sectionId) {
    return (
      <div className="statistics-board statistics-board-empty">
        <div className="statistics-empty-state">
          <h2 className="statistics-empty-title">📊 통계활용대회</h2>
          <p className="statistics-empty-text">팀을 만들어 미션을 시작하세요!</p>
          <button
            className="btn-primary statistics-create-team-btn"
            onClick={createTeam}
            disabled={creating}
          >
            {creating ? "팀 만드는 중..." : "팀 만들기"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-board">
      <aside className="statistics-sidebar">
        <h2 className="statistics-sidebar-title">📊 통계활용대회</h2>
        <MissionStepper
          missions={missions}
          currentStep={currentStep}
          onSelect={setCurrentStep}
        />
      </aside>
      <div className="mobile-tab-bar-wrapper">
        <MobileTabBar
          missions={missions}
          currentStep={currentStep}
          onSelect={setCurrentStep}
        />
      </div>
      <main className="statistics-main">
        <div className="statistics-team-header">
          <div className="statistics-team-avatars">
            {teamMembers.map((m) => (
              <span key={m.id} className="team-avatar" title={m.studentName}>
                {m.studentName.charAt(0)}
              </span>
            ))}
          </div>
          <StatisticsTeamInviteButton
            sectionId={sectionId}
            rosterStudents={rosterStudents}
            teamMembers={teamMembers}
            onInvite={refreshMembers}
          />
        </div>

        {currentMission ? (
          <MissionPanel
            boardId={boardId}
            sectionId={sectionId}
            mission={currentMission}
            isTeacher={isTeacher}
            onUpdate={refreshMissions}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
          />
        ) : (
          <div className="statistics-empty">미션을 선택해 주세요.</div>
        )}
      </main>
    </div>
  );
}
