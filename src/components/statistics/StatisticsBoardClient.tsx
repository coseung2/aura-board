"use client";

import { useState, useEffect } from "react";
import { MissionStepper } from "./MissionStepper";
import { MissionPanel } from "./MissionPanel";
import { TeacherDashboard } from "./TeacherDashboard";
import { MobileTabBar } from "./MobileTabBar";
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

export type StatisticsBoardClientProps = {
  boardId: string;
  isTeacher: boolean;
};

export function StatisticsBoardClient({
  boardId,
  isTeacher,
}: StatisticsBoardClientProps) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionDTO[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentMission = missions.find((m) => m.stepNumber === currentStep);

  // On mount, resolve the student's section or pick the first one
  useEffect(() => {
    async function init() {
      try {
        // For teachers: list all sections and pick first
        // For students: API returns their accessible sections
        const sectionsRes = await fetch(`/api/boards/${boardId}/sections`);
        if (sectionsRes.ok) {
          const sectionsData = await sectionsRes.json();
          const sections = sectionsData.sections as { id: string; title: string }[];
          const sid = sections[0]?.id ?? null;
          if (sid) {
            setSectionId(sid);
            const missionsRes = await fetch(`/api/sections/${sid}/missions`);
            if (missionsRes.ok) {
              const data = await missionsRes.json();
              const list = data.missions as MissionDTO[];
              setMissions(list);
              const firstIncomplete = list.find(
                (m) => m.status !== "approved" && m.status !== "completed"
              );
              setCurrentStep(firstIncomplete?.stepNumber ?? 1);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [boardId]);

  async function refreshMissions() {
    if (!sectionId) return;
    const res = await fetch(`/api/sections/${sectionId}/missions`);
    if (res.ok) {
      const data = await res.json();
      setMissions(data.missions as MissionDTO[]);
    }
  }

  useMissionsSSE(boardId, refreshMissions);

  if (loading) {
    return <div className="statistics-loading">미션을 불러오는 중...</div>;
  }

  if (isTeacher) {
    return <TeacherDashboard boardId={boardId} />;
  }

  if (!sectionId) {
    return <div className="statistics-empty">아직 팀이 구성되지 않았습니다.</div>;
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
