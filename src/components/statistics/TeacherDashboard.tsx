"use client";

import { useState, useEffect, useCallback } from "react";
import type { MissionDTO } from "./StatisticsBoardClient";

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

export function TeacherDashboard({ boardId }: { boardId: string }) {
  const [teams, setTeams] = useState<DashboardTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}/missions/dashboard`);
      if (!res.ok) throw new Error("대시보드를 불러올 수 없습니다.");
      const data = await res.json();
      setTeams(data.teams as DashboardTeam[]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 3000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  async function approve(sectionId: string, step: number) {
    setActioning(`${sectionId}-${step}`);
    try {
      const res = await fetch(
        `/api/sections/${sectionId}/missions/${step}/approve`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );
      if (!res.ok) throw new Error("승인 실패");
      await fetchDashboard();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActioning(null);
    }
  }

  async function reject(sectionId: string, step: number, feedback: string) {
    setActioning(`${sectionId}-${step}`);
    try {
      const res = await fetch(
        `/api/sections/${sectionId}/missions/${step}/reject`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) }
      );
      if (!res.ok) throw new Error("반려 실패");
      await fetchDashboard();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActioning(null);
    }
  }

  const pendingMissions = teams.flatMap((team) =>
    team.missions
      .filter((m) => m.status === "pending_approval")
      .map((m) => ({ ...m, teamName: team.teamName, sectionId: team.sectionId }))
  );

  if (loading) {
    return <div className="statistics-loading">대시보드를 불러오는 중...</div>;
  }

  if (error) {
    return <div className="statistics-error">{error}</div>;
  }

  return (
    <div className="teacher-dashboard">
      <h2 className="teacher-dashboard-title">📊 통계활용대회 교사 대시보드</h2>

      <section className="teacher-dashboard-section">
        <h3>승인 대기 목록</h3>
        {pendingMissions.length === 0 ? (
          <p className="teacher-dashboard-empty">현재 승인 대기 중인 미션이 없습니다.</p>
        ) : (
          <ul className="approval-queue">
            {pendingMissions.map((m) => (
              <li key={`${m.sectionId}-${m.stepNumber}`} className="approval-item">
                <div className="approval-item-info">
                  <strong>{m.teamName}</strong>
                  <span>미션 {m.stepNumber}</span>
                  <span className="status-badge pending">승인 요청</span>
                </div>
                <div className="approval-item-actions">
                  <button
                    className="btn-primary"
                    onClick={() => approve(m.sectionId, m.stepNumber)}
                    disabled={actioning === `${m.sectionId}-${m.stepNumber}`}
                  >
                    승인
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const feedback = prompt("반려 사유를 입력해 주세요.");
                      if (feedback) reject(m.sectionId, m.stepNumber, feedback);
                    }}
                    disabled={actioning === `${m.sectionId}-${m.stepNumber}`}
                  >
                    반려
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="teacher-dashboard-section">
        <h3>팀별 진행 상황</h3>
        <div className="team-progress-table-wrapper">
          <table className="team-progress-table">
            <thead>
              <tr>
                <th>팀명</th>
                <th>인원</th>
                <th>현재 미션</th>
                <th>진행 상태</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const approvedCount = team.missions.filter(
                  (m) => m.status === "approved" || m.status === "completed"
                ).length;
                return (
                  <tr key={team.sectionId}>
                    <td>{team.teamName}</td>
                    <td>{team.memberCount}명</td>
                    <td>미션 {team.currentStep}</td>
                    <td>
                      {approvedCount}/11 완료
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${(approvedCount / 11) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
