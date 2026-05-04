"use client";

import { useState, useCallback } from "react";
import type { MissionDTO } from "./StatisticsBoardClient";
import { MISSION_TITLES } from "./missionTitles";
import { QuestionLadderAccordion } from "./QuestionLadderAccordion";
import { MissionActionBar } from "./MissionActionBar";
import { Mission1TopicCard } from "./missions/Mission1TopicCard";
import { Mission3QuestionSorter } from "./missions/Mission3QuestionSorter";
import { Mission3SurveyBuilder } from "./missions/Mission3SurveyBuilder";
import { Mission4InvestigationPlan } from "./missions/Mission4InvestigationPlan";
import { Mission5DataCollection } from "./missions/Mission5DataCollection";
import { Mission6GraphPlanner } from "./missions/Mission6GraphPlanner";
import { Mission7ResultInterpreter } from "./missions/Mission7ResultInterpreter";
import { Mission8ConclusionWriter } from "./missions/Mission8ConclusionWriter";
import { Mission9PosterRequest } from "./missions/Mission9PosterRequest";
import { Mission10PosterReview } from "./missions/Mission10PosterReview";
import { Mission11PresentationPrep } from "./missions/Mission11PresentationPrep";

export function MissionPanel({
  boardId,
  sectionId,
  mission,
  isTeacher,
  onUpdate,
  isSaving,
  setIsSaving,
  relatedMissions = [],
}: {
  boardId: string;
  sectionId: string;
  mission: MissionDTO;
  isTeacher: boolean;
  onUpdate: () => void;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  relatedMissions?: MissionDTO[];
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    () => (mission.content as Record<string, unknown>) ?? {}
  );
  const [error, setError] = useState<string | null>(null);

  const canEdit =
    mission.status !== "teacher_working" && mission.status !== "completed";

  const canSubmit = !isTeacher && canEdit && mission.status !== "pending_approval";

  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/missions/${mission.stepNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, expectedVersion: mission.version }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error === "VERSION_CONFLICT") {
          setError("다른 팀원이 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.");
        } else {
          setError(data.error || "저장에 실패했습니다.");
        }
        return;
      }
      onUpdate();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [draft, mission.version, mission.stepNumber, sectionId, onUpdate, setIsSaving]);

  const submit = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sections/${sectionId}/missions/${mission.stepNumber}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: mission.version }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "승인 요청에 실패했습니다.");
        return;
      }
      onUpdate();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [mission.version, mission.stepNumber, sectionId, onUpdate, setIsSaving]);

  return (
    <div className="mission-panel">
      <div className="mission-panel-banner">
        지금 우리 팀은 <strong>미션 {mission.stepNumber}</strong>를 하고 있어요
      </div>

      <h3 className="mission-panel-title">
        미션 {mission.stepNumber}. {MISSION_TITLES[mission.stepNumber]}
      </h3>
      <p className="mission-panel-subtitle">
        {mission.stepNumber === 1
          ? "의견이 갈리거나, 불편함이 있거나, 이유가 궁금한 생활 문제를 찾아봅시다."
          : mission.stepNumber === 2
            ? "찬성과 반대는 마지막에 생각해요. 지금은 좋은 질문을 모을 차례예요."
            : mission.stepNumber === 3
              ? "만든 질문을 설문으로 물을 것과 직접 조사할 것으로 나눠 봅시다."
              : "팀원들과 이야기하며 빈칸을 하나씩 채워 보세요."}
      </p>

      {mission.stepNumber === 1 && (
        <Mission1TopicCard value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 2 && (
        <QuestionLadderAccordion
          value={draft}
          onChange={setDraft}
          disabled={!canEdit}
          sectionId={sectionId}
          stepNumber={mission.stepNumber}
        />
      )}
      {mission.stepNumber === 3 && (
        <Mission3QuestionSorter
          value={draft}
          onChange={setDraft}
          disabled={!canEdit}
          sourceContent={relatedMissions.find((item) => item.stepNumber === 2)?.content}
        />
      )}
      {mission.stepNumber === 4 && (
        <Mission3SurveyBuilder
          value={draft}
          onChange={setDraft}
          disabled={!canEdit}
          sourceContent={relatedMissions.find((item) => item.stepNumber === 3)?.content}
        />
      )}
      {mission.stepNumber === 5 && (
        <Mission4InvestigationPlan
          value={draft}
          onChange={setDraft}
          disabled={!canEdit}
          sourceContent={relatedMissions.find((item) => item.stepNumber === 3)?.content}
        />
      )}
      {mission.stepNumber === 6 && (
        <Mission5DataCollection value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 7 && (
        <Mission6GraphPlanner value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 8 && (
        <Mission7ResultInterpreter value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 9 && (
        <Mission8ConclusionWriter value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 10 && (
        <Mission9PosterRequest value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 11 && (
        <Mission10PosterReview value={draft} onChange={setDraft} disabled={!canEdit} />
      )}
      {mission.stepNumber === 12 && (
        <Mission11PresentationPrep value={draft} onChange={setDraft} disabled={!canEdit} />
      )}

      {error && <div className="mission-panel-error">{error}</div>}

      <MissionActionBar
        canEdit={canEdit}
        canSubmit={canSubmit}
        isSaving={isSaving}
        status={mission.status}
        onSave={save}
        onSubmit={submit}
      />
    </div>
  );
}
