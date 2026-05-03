"use client";

import { useState, useCallback } from "react";
import { MissionDTO } from "./StatisticsBoardClient";
import { QuestionLadderAccordion } from "./QuestionLadderAccordion";
import { MissionActionBar } from "./MissionActionBar";
import { Mission1TopicCard } from "./missions/Mission1TopicCard";
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
}: {
  boardId: string;
  sectionId: string;
  mission: MissionDTO;
  isTeacher: boolean;
  onUpdate: () => void;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    () => (mission.content as Record<string, unknown>) ?? {}
  );
  const [error, setError] = useState<string | null>(null);

  const canEdit =
    !isTeacher &&
    (mission.status === "not_started" ||
      mission.status === "in_progress" ||
      mission.status === "approved");

  const canSubmit = canEdit && mission.status !== "pending_approval";

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
      <div className="mission-panel-card">
        <h3 className="mission-panel-title">
          미션 {mission.stepNumber}. {missionTitles[mission.stepNumber]}
        </h3>
        <p className="mission-panel-subtitle">
          {mission.stepNumber === 2
            ? "찬반은 마지막 보스! 지금은 단서를 모을 차례예요."
            : "팀원들과 함께 이 미션을 완료해 보세요."}
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
          <Mission3SurveyBuilder value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 4 && (
          <Mission4InvestigationPlan value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 5 && (
          <Mission5DataCollection value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 6 && (
          <Mission6GraphPlanner value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 7 && (
          <Mission7ResultInterpreter value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 8 && (
          <Mission8ConclusionWriter value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 9 && (
          <Mission9PosterRequest value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 10 && (
          <Mission10PosterReview value={draft} onChange={setDraft} disabled={!canEdit} />
        )}
        {mission.stepNumber === 11 && (
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
    </div>
  );
}

const missionTitles: Record<number, string> = {
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
