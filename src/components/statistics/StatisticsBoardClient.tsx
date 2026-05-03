"use client";

import { useState, useEffect, useCallback } from "react";
import { MissionPanel } from "./MissionPanel";
import { CardBody } from "../cards/CardBody";
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

type DashboardTeam = {
  sectionId: string;
  teamName: string;
  memberCount: number;
  currentStep: number;
  missions: Array<{
    stepNumber: number;
    status: MissionDTO["status"];
    submittedAt: string | null;
    approvedAt: string | null;
  }>;
};

const MISSION_TITLES: Record<number, string> = {
  1: "주제 카드",
  2: "질문 사다리",
  3: "설문 문항",
  4: "조사 계획",
  5: "자료 수집",
  6: "그래프 계획",
  7: "결과 해석",
  8: "결론·제안",
  9: "포스터 의뢰",
  10: "포스터 검토",
  11: "발표 준비",
};

function statusColor(status: MissionDTO["status"]): string | null {
  switch (status) {
    case "not_started":
      return "#f3f4f6";
    case "in_progress":
      return "#dbeafe";
    case "pending_approval":
      return "#fef3c7";
    case "approved":
      return "#d1fae5";
    case "teacher_working":
      return "#f3e8ff";
    case "completed":
      return "#d1fae5";
    default:
      return null;
  }
}

function statusLabel(status: MissionDTO["status"]): string {
  switch (status) {
    case "not_started":
      return "시작 전";
    case "in_progress":
      return "수정 중";
    case "pending_approval":
      return "승인 요청";
    case "approved":
      return "승인 완료";
    case "teacher_working":
      return "교사 제작 중";
    case "completed":
      return "완료";
  }
}

type CardItem = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  sectionId: string;
  teamName: string;
  mission: MissionDTO;
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
  const [teams, setTeams] = useState<DashboardTeam[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(!studentSectionId && !isTeacher);
  const [creating, setCreating] = useState(false);
  const [teamMembers, setTeamMembers] =
    useState<TeamMemberDTO[]>(initialTeamMembers);
  const [modalMission, setModalMission] = useState<MissionDTO | null>(null);
  const [modalSectionId, setModalSectionId] = useState<string | null>(null);
  const [modalTeamName, setModalTeamName] = useState<string>("");
  const [actioning, setActioning] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    if (isTeacher) {
      await refreshDashboard();
    } else {
      await refreshMissions();
    }
  }, [isTeacher, sectionId, boardId]);

  useEffect(() => {
    async function init() {
      if (isTeacher) {
        setLoading(true);
        await refreshDashboard();
        setLoading(false);
        return;
      }
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
  }, [isTeacher, sectionId]);

  async function refreshMissions() {
    if (!sectionId) return;
    const res = await fetch(`/api/sections/${sectionId}/missions`);
    if (res.ok) {
      const data = await res.json();
      const list = data.missions as MissionDTO[];
      setMissions(list);
      const firstIncomplete = list.find(
        (m) => m.status !== "approved" && m.status !== "completed"
      );
      setCurrentStep(firstIncomplete?.stepNumber ?? 1);
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

  async function refreshDashboard() {
    try {
      const dashRes = await fetch(`/api/boards/${boardId}/missions/dashboard`);
      if (!dashRes.ok) throw new Error("대시보드를 불러올 수 없습니다.");
      const dashData = await dashRes.json();
      setTeams(dashData.teams as DashboardTeam[]);
    } catch {
      // ignore
    }
  }

  useMissionsSSE(boardId, refreshData);

  async function createTeam() {
    setCreating(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/teams`, {
        method: "POST",
      });
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

  async function approve(targetSectionId: string, step: number) {
    setActioning(`${targetSectionId}-${step}`);
    try {
      const res = await fetch(
        `/api/sections/${targetSectionId}/missions/${step}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) throw new Error("승인 실패");
      await refreshDashboard();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActioning(null);
    }
  }

  async function reject(
    targetSectionId: string,
    step: number,
    feedback: string
  ) {
    setActioning(`${targetSectionId}-${step}`);
    try {
      const res = await fetch(
        `/api/sections/${targetSectionId}/missions/${step}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        }
      );
      if (!res.ok) throw new Error("반려 실패");
      await refreshDashboard();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActioning(null);
    }
  }

  async function openMissionModal(
    sid: string,
    mission: MissionDTO,
    teamName: string
  ) {
    setModalSectionId(sid);
    setModalTeamName(teamName);
    // 교사 화면에서는 dashboard API가 content/version을 주지 않으므로
    // 모달 열기 전에 상세 미션 데이터를 불러온다.
    if (isTeacher && !mission.content || Object.keys(mission.content).length === 0) {
      try {
        const res = await fetch(`/api/sections/${sid}/missions/${mission.stepNumber}`);
        if (res.ok) {
          const data = await res.json();
          setModalMission(data.mission as MissionDTO);
          return;
        }
      } catch {
        // fallthrough
      }
    }
    setModalMission(mission);
  }

  function closeModal() {
    setModalMission(null);
    setModalSectionId(null);
    setModalTeamName("");
  }

  function getStudentTeamName(): string {
    if (teamMembers.length === 0) return "우리 팀";
    return `팀 ${teamMembers.map((m) => m.studentName).join(" ")}`;
  }

  function getCardsForStep(step: number): CardItem[] {
    const cards: CardItem[] = [];
    if (isTeacher) {
      for (const team of teams) {
        const m = team.missions.find((x) => x.stepNumber === step);
        if (!m) continue;
        const missionDto: MissionDTO = {
          id: `${team.sectionId}-${step}`,
          sectionId: team.sectionId,
          stepNumber: step,
          status: m.status,
          content: {},
          submittedAt: m.submittedAt,
          approvedAt: m.approvedAt,
          approvedBy: null,
          teacherFeedback: null,
          version: 1,
        };
        cards.push({
          id: `${team.sectionId}-${step}`,
          title: team.teamName,
          content: `${team.memberCount}명 · ${statusLabel(m.status)}`,
          color: statusColor(m.status),
          sectionId: team.sectionId,
          teamName: team.teamName,
          mission: missionDto,
        });
      }
    } else {
      for (const m of missions) {
        if (m.stepNumber !== step) continue;
        const name = getStudentTeamName();
        cards.push({
          id: m.id,
          title: name,
          content: teamMembers.map((tm) => tm.studentName).join(", "),
          color: statusColor(m.status),
          sectionId: sectionId ?? m.sectionId,
          teamName: name,
          mission: m,
        });
      }
    }
    return cards;
  }

  if (loading) {
    return <div className="statistics-loading">불러오는 중...</div>;
  }

  if (!isTeacher && !sectionId) {
    return (
      <div className="statistics-board statistics-board-empty">
        <div className="statistics-empty-state">
          <h2 className="statistics-empty-title">📊 통계활용대회</h2>
          <p className="statistics-empty-text">
            팀을 만들어 미션을 시작하세요!
          </p>
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
    <div className="statistics-board columns-board" style={{ flexDirection: "column" }}>
      {!isTeacher && sectionId && (
        <div className="statistics-toolbar">
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
      )}

      <div className="columns-board">
        {Array.from({ length: 11 }, (_, i) => i + 1).map((step) => {
          const stepCards = getCardsForStep(step);
          return (
            <div key={step} className="column">
              <div className="column-header">
                <h3 className="column-title">
                  {step}. {MISSION_TITLES[step]}
                </h3>
                <span className="column-count">{stepCards.length}</span>
              </div>
              <div className="column-cards">
                {stepCards.map((card) => (
                  <article
                    key={card.id}
                    className="column-card is-clickable"
                    style={{ backgroundColor: card.color ?? undefined }}
                    onClick={() =>
                      openMissionModal(
                        card.sectionId,
                        card.mission,
                        card.teamName
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openMissionModal(
                          card.sectionId,
                          card.mission,
                          card.teamName
                        );
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${card.title} ${MISSION_TITLES[step]}`}
                  >
                    <CardBody card={card} titleAs="h4" showEngagement={false} />
                    {isTeacher &&
                      card.mission.status === "pending_approval" && (
                        <div
                          className="card-inline-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => approve(card.sectionId, step)}
                            disabled={
                              actioning === `${card.sectionId}-${step}`
                            }
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              const feedback = prompt(
                                "반려 사유를 입력해 주세요."
                              );
                              if (feedback)
                                reject(card.sectionId, step, feedback);
                            }}
                            disabled={
                              actioning === `${card.sectionId}-${step}`
                            }
                          >
                            반려
                          </button>
                        </div>
                      )}
                  </article>
                ))}
                {stepCards.length === 0 && (
                  <div className="column-empty">아직 없음</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalMission && modalSectionId && (
        <>
          <div className="modal-backdrop" onClick={closeModal} />
          <div
            className="add-card-modal mission-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${modalTeamName} ${MISSION_TITLES[modalMission.stepNumber]}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeModal}
              aria-label="닫기"
            >
              ×
            </button>
            <div className="mission-modal-body">
              <MissionPanel
                boardId={boardId}
                sectionId={modalSectionId}
                mission={modalMission}
                isTeacher={isTeacher}
                onUpdate={() => {
                  refreshData();
                  closeModal();
                }}
                isSaving={isSaving}
                setIsSaving={setIsSaving}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
