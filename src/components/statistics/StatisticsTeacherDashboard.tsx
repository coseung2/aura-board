"use client";

import { useEffect, useState } from "react";
import type { DashboardTeam, MissionDTO } from "./StatisticsBoardClient";
import { MISSION_TITLES } from "./missionTitles";

type TeacherFilter = "all" | "pending" | "active" | "done";

type Props = {
  teams: DashboardTeam[];
  actioning: string | null;
  onApprove: (sectionId: string, step: number) => Promise<void>;
  onReject: (sectionId: string, step: number, feedback: string) => Promise<void>;
  onOpenMission: (
    sectionId: string,
    mission: MissionDTO,
    teamName: string
  ) => Promise<void>;
};

const FILTER_LABELS: Record<TeacherFilter, string> = {
  all: "전체",
  pending: "승인 요청",
  active: "진행 중",
  done: "완료",
};

function isDone(status: MissionDTO["status"]): boolean {
  return status === "approved" || status === "completed";
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

function formatDate(value: string | null): string {
  if (!value) return "없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function missionFromTeam(
  team: DashboardTeam,
  mission: DashboardTeam["missions"][number]
): MissionDTO {
  return {
    id: mission.id ?? `${team.sectionId}-${mission.stepNumber}`,
    sectionId: mission.sectionId ?? team.sectionId,
    stepNumber: mission.stepNumber,
    status: mission.status,
    content: mission.content ?? {},
    submittedAt: mission.submittedAt,
    approvedAt: mission.approvedAt,
    approvedBy: mission.approvedBy ?? null,
    teacherFeedback: mission.teacherFeedback ?? null,
    version: mission.version ?? 1,
  };
}

function doneCount(team: DashboardTeam): number {
  return team.missions.filter((mission) => isDone(mission.status)).length;
}

function pendingCount(team: DashboardTeam): number {
  return team.missions.filter((mission) => mission.status === "pending_approval")
    .length;
}

function isTeamDone(team: DashboardTeam): boolean {
  return team.missions.length > 0 && doneCount(team) === team.missions.length;
}

function matchesFilter(team: DashboardTeam, filter: TeacherFilter): boolean {
  if (filter === "pending") return pendingCount(team) > 0;
  if (filter === "done") return isTeamDone(team);
  if (filter === "active") return !isTeamDone(team) && pendingCount(team) === 0;
  return true;
}

export function StatisticsTeacherDashboard({
  teams,
  actioning,
  onApprove,
  onReject,
  onOpenMission,
}: Props) {
  const [filter, setFilter] = useState<TeacherFilter>("all");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null
  );
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const filteredTeams = teams.filter((team) => matchesFilter(team, filter));
  const selectedTeam =
    teams.find((team) => team.sectionId === selectedSectionId) ??
    filteredTeams[0] ??
    teams[0] ??
    null;
  const pendingTotal = teams.reduce((sum, team) => sum + pendingCount(team), 0);
  const doneTeams = teams.filter(isTeamDone).length;
  const activeTeams = teams.length - doneTeams;

  useEffect(() => {
    if (!selectedTeam) return;
    if (selectedSectionId !== selectedTeam.sectionId) {
      setSelectedSectionId(selectedTeam.sectionId);
    }
  }, [selectedSectionId, selectedTeam]);

  useEffect(() => {
    if (!selectedTeam) return;
    setExpandedStep(selectedTeam.currentStep);
  }, [selectedTeam?.sectionId, selectedTeam?.currentStep]);

  function selectTeam(team: DashboardTeam, step?: number) {
    setSelectedSectionId(team.sectionId);
    setExpandedStep(step ?? team.currentStep);
  }

  function rejectWithPrompt(team: DashboardTeam, stepNumber: number) {
    const feedback = prompt("반려 사유를 입력해 주세요.");
    if (feedback) onReject(team.sectionId, stepNumber, feedback);
  }

  return (
    <>
      <section className="teacher-overview" aria-label="교사용 진행 요약">
        <div className="teacher-overview-copy">
          <p className="teacher-overview-kicker">교사 모니터링</p>
          <h2>팀별로 진행을 확인하세요</h2>
        </div>
        <div className="teacher-overview-stats">
          <div>
            <span>전체 모둠</span>
            <strong>{teams.length}</strong>
          </div>
          <div>
            <span>승인 요청</span>
            <strong>{pendingTotal}</strong>
          </div>
          <div>
            <span>진행 중</span>
            <strong>{activeTeams}</strong>
          </div>
          <div>
            <span>완료</span>
            <strong>{doneTeams}</strong>
          </div>
        </div>
      </section>

      <div className="teacher-dashboard-controls" role="tablist">
        {(Object.keys(FILTER_LABELS) as TeacherFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`teacher-filter ${filter === key ? "is-active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="teacher-workspace">
        <aside className="teacher-team-list" aria-label="모둠 목록">
          {filteredTeams.length === 0 ? (
            <div className="teacher-empty-panel">조건에 맞는 모둠이 없습니다.</div>
          ) : (
            filteredTeams.map((team) => {
              const isSelected = selectedTeam?.sectionId === team.sectionId;
              const teamDone = doneCount(team);
              const teamPending = pendingCount(team);
              return (
                <button
                  key={team.sectionId}
                  type="button"
                  className={`teacher-team-row ${isSelected ? "is-selected" : ""}`}
                  onClick={() => selectTeam(team)}
                >
                  <span className="teacher-team-main">
                    <strong>{team.teamName}</strong>
                    <span>
                      {team.memberCount}명 · 미션 {team.currentStep}
                    </span>
                  </span>
                  <span
                    className={`teacher-team-status ${
                      teamPending > 0
                        ? "is-pending"
                        : isTeamDone(team)
                          ? "is-done"
                          : "is-active"
                    }`}
                  >
                    {teamPending > 0
                      ? `승인 ${teamPending}`
                      : isTeamDone(team)
                        ? "완료"
                        : "진행 중"}
                  </span>
                  <span className="teacher-progress-rail">
                    {team.missions.map((mission) => (
                      <span
                        key={mission.stepNumber}
                        className={`teacher-progress-dot is-${mission.status}`}
                        title={`${mission.stepNumber}. ${statusLabel(mission.status)}`}
                      />
                    ))}
                  </span>
                  <span className="teacher-team-progress">
                    {teamDone}/{team.missions.length} 완료
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <section className="teacher-team-detail" aria-label="선택 모둠 상세">
          {!selectedTeam ? (
            <div className="teacher-empty-panel">모둠을 선택하세요.</div>
          ) : (
            <>
              <header className="teacher-detail-header">
                <div>
                  <p className="teacher-overview-kicker">선택 모둠</p>
                  <h3>{selectedTeam.teamName}</h3>
                </div>
                <span className="teacher-detail-meta">
                  {selectedTeam.memberCount}명 · {doneCount(selectedTeam)}/
                  {selectedTeam.missions.length} 완료
                </span>
              </header>

              <div className="teacher-mission-accordion">
                {selectedTeam.missions.map((mission) => {
                  const missionDto = missionFromTeam(selectedTeam, mission);
                  const rows = [
                    { label: "제출", value: formatDate(missionDto.submittedAt) },
                    { label: "승인", value: formatDate(missionDto.approvedAt) },
                    {
                      label: "피드백",
                      value: missionDto.teacherFeedback?.trim() || "없음",
                    },
                  ];
                  const expanded = expandedStep === mission.stepNumber;
                  const actionKey = `${selectedTeam.sectionId}-${mission.stepNumber}`;

                  return (
                    <article
                      key={mission.stepNumber}
                      className={`teacher-mission-row ${
                        expanded ? "is-expanded" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="teacher-mission-summary"
                        onClick={() =>
                          setExpandedStep(expanded ? null : mission.stepNumber)
                        }
                        aria-expanded={expanded}
                      >
                        <span className={`teacher-step-num is-${mission.status}`}>
                          {mission.stepNumber}
                        </span>
                        <span className="teacher-step-title">
                          <strong>{MISSION_TITLES[mission.stepNumber]}</strong>
                          <span>{statusLabel(mission.status)}</span>
                        </span>
                        <span className="teacher-step-open">
                          {expanded ? "접기" : "보기"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="teacher-mission-detail">
                          {rows.length > 0 ? (
                            <dl>
                              {rows.map((row) => (
                                <div key={row.label}>
                                  <dt>{row.label}</dt>
                                  <dd>{row.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="teacher-mission-empty">
                              아직 작성된 내용이 없습니다.
                            </p>
                          )}
                          <div className="teacher-mission-actions">
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() =>
                                onOpenMission(
                                  selectedTeam.sectionId,
                                  missionDto,
                                  selectedTeam.teamName
                                )
                              }
                            >
                              상세 열기
                            </button>
                            {mission.status === "pending_approval" && (
                              <>
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  onClick={() =>
                                    onApprove(
                                      selectedTeam.sectionId,
                                      mission.stepNumber
                                    )
                                  }
                                  disabled={actioning === actionKey}
                                >
                                  승인
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() =>
                                    rejectWithPrompt(
                                      selectedTeam,
                                      mission.stepNumber
                                    )
                                  }
                                  disabled={actioning === actionKey}
                                >
                                  반려
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
