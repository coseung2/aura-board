"use client";

import { useState, useEffect, useCallback } from "react";
import { MissionPanel } from "./MissionPanel";
import { StatisticsTeacherDashboard } from "./StatisticsTeacherDashboard";
import { StatisticsTeamInviteButton } from "./StatisticsTeamInviteButton";
import { useMissionsSSE } from "./useMissionsSSE";
import { MISSION_TITLES } from "./missionTitles";

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
  content: unknown;
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

export type DashboardTeam = {
  sectionId: string;
  teamName: string;
  memberCount: number;
  currentStep: number;
  missions: Array<{
    id?: string;
    sectionId?: string;
    stepNumber: number;
    status: MissionDTO["status"];
    content?: unknown;
    submittedAt: string | null;
    approvedAt: string | null;
    approvedBy?: string | null;
    teacherFeedback?: string | null;
    version?: number;
  }>;
};

const TEAM_CREATE_ERROR_MESSAGES: Record<string, string> = {
  board_has_no_classroom: "이 보드에는 학급 명단이 연결되어 있지 않아요.",
  board_not_found: "보드를 찾을 수 없어요.",
  forbidden: "이 보드에서 팀을 만들 수 있는 권한이 없어요.",
  not_classroom_student: "이 보드의 학급 친구만 팀을 만들 수 있어요.",
  student_not_found: "명단에서 이 친구를 찾을 수 없어요.",
  student_not_in_classroom: "이 보드의 학급 친구만 팀을 만들 수 있어요.",
  unauthorized: "먼저 로그인해 주세요.",
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
  color: string | null;
  sectionId: string;
  teamName: string;
  mission: MissionDTO;
  previewRows: MissionPreviewRow[];
};

type MissionPreviewRow = {
  label: string;
  value: string;
};

type MissionPreviewField = {
  path: string[];
  label: string;
};

const MISSION_PREVIEW_FIELDS: Record<number, MissionPreviewField[]> = {
  1: [
    { path: ["topic", "issue"], label: "우리 팀 이슈" },
    { path: ["topic", "curiosity"], label: "궁금해진 이유" },
    { path: ["topic", "stakeholder1"], label: "관련된 사람" },
    { path: ["topic", "evidence"], label: "확인할 증거" },
    { path: ["topic", "title"], label: "임시 제목" },
  ],
  2: [
    { path: ["questionLadder", "issue"], label: "우리 팀 이슈" },
    { path: ["questionLadder", "experience"], label: "경험 질문" },
    { path: ["questionLadder", "currentStatus"], label: "현황 질문" },
    { path: ["questionLadder", "reason"], label: "이유 질문" },
    { path: ["questionLadder", "condition"], label: "조건 질문" },
    { path: ["questionLadder", "alternative"], label: "해결 질문" },
    { path: ["questionLadder", "position"], label: "입장 질문" },
  ],
  3: [{ path: ["survey", "items"], label: "설문 문항" }],
  4: [
    { path: ["investigationPlan", "target"], label: "조사 대상" },
    { path: ["investigationPlan", "goalCount"], label: "목표 인원" },
    { path: ["investigationPlan", "method"], label: "조사 방법" },
    { path: ["investigationPlan", "period"], label: "조사 기간" },
  ],
  5: [
    { path: ["dataCollection", "respondentCount"], label: "응답 수" },
    { path: ["dataCollection", "period"], label: "조사 기간" },
    { path: ["dataCollection", "notes"], label: "메모" },
  ],
  6: [{ path: ["graphPlans"], label: "그래프 계획" }],
  7: [
    { path: ["interpretation", "fact"], label: "알게 된 점" },
    { path: ["interpretation", "highest"], label: "가장 많음" },
    { path: ["interpretation", "lowest"], label: "가장 적음" },
    { path: ["interpretation", "meaning"], label: "뜻" },
  ],
  8: [
    { path: ["conclusion", "findings"], label: "중요한 발견" },
    { path: ["conclusion", "conclusion"], label: "결론" },
    { path: ["conclusion", "proposal"], label: "제안" },
  ],
  9: [
    { path: ["posterRequest", "posterTitle"], label: "포스터 제목" },
    { path: ["posterRequest", "topic"], label: "주제" },
    { path: ["posterRequest", "keyData"], label: "중요한 자료" },
    { path: ["posterRequest", "conclusion"], label: "결론" },
  ],
  10: [
    { path: ["posterReview", "isAccurate"], label: "자료 확인" },
    { path: ["posterReview", "titleCorrect"], label: "제목 확인" },
    { path: ["posterReview", "revisionRequests"], label: "고칠 점" },
  ],
  11: [
    { path: ["presentation", "structure"], label: "발표 순서" },
    { path: ["presentation", "ready"], label: "준비" },
  ],
};

function getValueAtPath(
  source: unknown,
  path: string[]
): unknown {
  let value: unknown = source;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? `${value}` : "";
  if (typeof value === "boolean") return value ? "확인했어요" : "아직 확인 전";
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const text = formatPreviewListItem(item);
        return text ? `${index + 1}. ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(formatPreviewValue)
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

function formatPreviewListItem(item: unknown): string {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return formatPreviewValue(item);
  }

  const record = item as Record<string, unknown>;
  const primary =
    record.question ??
    record.content ??
    record.insight ??
    record.title ??
    record.name;
  const primaryText = formatPreviewValue(primary);
  if (!primaryText) return formatPreviewValue(record);

  const options = Array.isArray(record.options)
    ? record.options.map(formatPreviewValue).filter(Boolean).join(", ")
    : "";
  const type = typeof record.type === "string" ? record.type : "";
  const detail = options || type;
  return detail ? `${primaryText} (${detail})` : primaryText;
}

function buildMissionPreviewRows(mission: MissionDTO): MissionPreviewRow[] {
  const content = mission.content;
  if (isPreviewBlank(content)) return [];

  const fields = MISSION_PREVIEW_FIELDS[mission.stepNumber] ?? [];
  const rows = fields
    .map((field) => ({
      label: field.label,
      value: formatPreviewValue(getValueAtPath(content, field.path)),
    }))
    .filter((row) => row.value.length > 0);

  if (rows.length > 0) return rows.slice(0, 4);

  if (typeof content === "string" || typeof content === "number" || typeof content === "boolean") {
    const value = formatPreviewValue(content);
    return value ? [{ label: "내용", value }] : [];
  }

  if (Array.isArray(content)) {
    const value = formatPreviewValue(content);
    return value ? [{ label: "내용", value }] : [];
  }

  if (!content || typeof content !== "object") return [];

  return Object.entries(content as Record<string, unknown>)
    .map(([key, value]) => ({
      label: key,
      value: formatPreviewValue(value),
    }))
    .filter((row) => row.value.length > 0)
    .slice(0, 4);
}

function isPreviewBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.every(isPreviewBlank);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isPreviewBlank);
  }
  return false;
}

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
        await refreshMembers();
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
      const dashboardTeams = dashData.teams as DashboardTeam[];
      setTeams(await hydrateDashboardMissionContent(dashboardTeams));
    } catch {
      // ignore
    }
  }

  async function hydrateDashboardMissionContent(
    dashboardTeams: DashboardTeam[]
  ): Promise<DashboardTeam[]> {
    const detailRequests = dashboardTeams.flatMap((team) =>
      team.missions
        .filter((mission) => mission.status !== "not_started")
        .map(async (mission) => {
          try {
            const res = await fetch(
              `/api/sections/${team.sectionId}/missions/${mission.stepNumber}`
            );
            if (!res.ok) return null;
            const data = await res.json();
            return {
              key: `${team.sectionId}-${mission.stepNumber}`,
              mission: data.mission as MissionDTO,
            };
          } catch {
            return null;
          }
        })
    );

    const detailMap = new Map<string, MissionDTO>();
    for (const detail of await Promise.all(detailRequests)) {
      if (detail) detailMap.set(detail.key, detail.mission);
    }

    return dashboardTeams.map((team) => ({
      ...team,
      missions: team.missions.map((mission) => {
        const detail = detailMap.get(`${team.sectionId}-${mission.stepNumber}`);
        if (!detail) return mission;
        return {
          ...mission,
          id: detail.id,
          sectionId: detail.sectionId,
          content: detail.content,
          approvedBy: detail.approvedBy,
          teacherFeedback: detail.teacherFeedback,
          version: detail.version,
        };
      }),
    }));
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
        const errorCode = typeof data.error === "string" ? data.error : "";
        alert(TEAM_CREATE_ERROR_MESSAGES[errorCode] ?? "팀을 만들지 못했어요. 잠시 후 다시 해 주세요.");
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
    if (isTeacher && isPreviewBlank(mission.content)) {
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
    const names = teamMembers.map((m) => m.studentName);
    if (names.length <= 2) return `팀 ${names.join(" ")}`;
    return `팀 ${names[0]} ${names[1]} 외 ${names.length - 2}명`;
  }

  function getCardsForStep(step: number): CardItem[] {
    const cards: CardItem[] = [];
    if (isTeacher) {
      for (const team of teams) {
        const m = team.missions.find((x) => x.stepNumber === step);
        if (!m) continue;
        const missionDto: MissionDTO = {
          id: m.id ?? `${team.sectionId}-${step}`,
          sectionId: m.sectionId ?? team.sectionId,
          stepNumber: step,
          status: m.status,
          content: m.content ?? {},
          submittedAt: m.submittedAt,
          approvedAt: m.approvedAt,
          approvedBy: m.approvedBy ?? null,
          teacherFeedback: m.teacherFeedback ?? null,
          version: m.version ?? 1,
        };
        cards.push({
          id: `${team.sectionId}-${step}`,
          title: team.teamName,
          color: statusColor(m.status),
          sectionId: team.sectionId,
          teamName: team.teamName,
          mission: missionDto,
          previewRows: [
            { label: "팀원", value: `${team.memberCount}명` },
            ...buildMissionPreviewRows(missionDto),
          ].slice(0, 4),
        });
      }
    } else {
      for (const m of missions) {
        if (m.stepNumber !== step) continue;
        const name = getStudentTeamName();
        cards.push({
          id: m.id,
          title: MISSION_TITLES[m.stepNumber],
          color: statusColor(m.status),
          sectionId: sectionId ?? m.sectionId,
          teamName: name,
          mission: m,
          previewRows: buildMissionPreviewRows(m),
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

  const modal = modalMission && modalSectionId && (
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
  );

  if (isTeacher) {
    return (
      <div className="statistics-board statistics-teacher-dashboard">
        <StatisticsTeacherDashboard
          teams={teams}
          actioning={actioning}
          onApprove={approve}
          onReject={reject}
          onOpenMission={openMissionModal}
        />
        {modal}
      </div>
    );
  }

  return (
    <div className="statistics-board columns-board">
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
                    className="column-card statistics-mission-card is-clickable"
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
                    <div className="mission-card-header">
                      <span className="mission-card-status">
                        {statusLabel(card.mission.status)}
                      </span>
                      {isTeacher && (
                        <span className="mission-card-team">
                          {card.teamName}
                        </span>
                      )}
                    </div>
                    {card.previewRows.length > 0 ? (
                      <dl className="mission-card-preview">
                        {card.previewRows.map((row) => (
                          <div key={row.label} className="mission-card-row">
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mission-card-empty">
                        아직 적은 내용이 없어요. 눌러서 채워 보세요.
                      </p>
                    )}
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

      {modal}
    </div>
  );
}
