"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MissionDTO } from "./StatisticsBoardClient";
import { MissionActionBar } from "./MissionActionBar";
import { QuestionLadderAccordion } from "./QuestionLadderAccordion";
import { MISSION_TITLES } from "./missionTitles";
import { Mission10PosterReview } from "./missions/Mission10PosterReview";
import { Mission11PresentationPrep } from "./missions/Mission11PresentationPrep";
import { Mission1TopicCard } from "./missions/Mission1TopicCard";
import { Mission3QuestionSorter } from "./missions/Mission3QuestionSorter";
import { Mission3SurveyBuilder } from "./missions/Mission3SurveyBuilder";
import { Mission4InvestigationPlan } from "./missions/Mission4InvestigationPlan";
import { Mission5DataCollection } from "./missions/Mission5DataCollection";
import { Mission6GraphPlanner } from "./missions/Mission6GraphPlanner";
import { Mission7ResultInterpreter } from "./missions/Mission7ResultInterpreter";
import { Mission8ConclusionWriter } from "./missions/Mission8ConclusionWriter";
import { Mission9PosterRequest } from "./missions/Mission9PosterRequest";

const AUTOSAVE_DELAY_MS = 800;

function normalizeDraft(content: unknown): Record<string, unknown> {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return {};
  }
  return content as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export function MissionPanel({
  sectionId,
  mission,
  isTeacher,
  onUpdate,
  isSaving,
  setIsSaving,
  relatedMissions = [],
}: {
  sectionId: string;
  mission: MissionDTO;
  isTeacher: boolean;
  onUpdate: () => void;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  relatedMissions?: MissionDTO[];
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    normalizeDraft(mission.content)
  );
  const [currentVersion, setCurrentVersion] = useState(mission.version);
  const [currentStatus, setCurrentStatus] = useState<MissionDTO["status"]>(mission.status);
  const [error, setError] = useState<string | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);

  const lastSavedDraftRef = useRef(stableStringify(normalizeDraft(mission.content)));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftRef = useRef(draft);
  const latestVersionRef = useRef(currentVersion);
  const latestStatusRef = useRef(currentStatus);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    latestVersionRef.current = currentVersion;
  }, [currentVersion]);

  useEffect(() => {
    latestStatusRef.current = currentStatus;
  }, [currentStatus]);

  const canEdit =
    currentStatus !== "teacher_working" && currentStatus !== "completed";
  const canSubmit =
    !isTeacher && canEdit && currentStatus !== "pending_approval";
  const currentDraftKey = useMemo(() => stableStringify(draft), [draft]);

  useEffect(() => {
    const incomingDraft = normalizeDraft(mission.content);
    const incomingKey = stableStringify(incomingDraft);
    const localSavedKey = lastSavedDraftRef.current;
    const localCurrentKey = stableStringify(latestDraftRef.current);

    setCurrentVersion(mission.version);
    setCurrentStatus(mission.status);

    if (localCurrentKey === localSavedKey || mission.version > latestVersionRef.current) {
      setDraft(incomingDraft);
      latestDraftRef.current = incomingDraft;
      lastSavedDraftRef.current = incomingKey;
    }
  }, [mission.id, mission.version, mission.status, mission.content]);

  const persistDraft = useCallback(
    async ({
      force = false,
      keepalive = false,
    }: {
      force?: boolean;
      keepalive?: boolean;
    } = {}) => {
      const nextDraft = latestDraftRef.current;
      const nextDraftKey = stableStringify(nextDraft);

      if (!force && nextDraftKey === lastSavedDraftRef.current) return true;
      if (!force && saveInFlightRef.current) return false;
      if (!canEdit) return true;

      saveInFlightRef.current = true;
      setIsSaving(true);
      setIsAutosaving(true);
      setError(null);

      try {
        const res = await fetch(`/api/sections/${sectionId}/missions/${mission.stepNumber}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: nextDraft,
            expectedVersion: latestVersionRef.current,
          }),
          keepalive,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.error === "VERSION_CONFLICT") {
            setError("다른 팀원이 먼저 수정했어요. 최신 내용으로 다시 불러왔습니다.");
            onUpdate();
          } else {
            setError(data.error || "저장에 실패했어요.");
          }
          return false;
        }

        if (data.mission) {
          const savedMission = data.mission as MissionDTO;
          setCurrentVersion(savedMission.version);
          setCurrentStatus(savedMission.status);
          latestVersionRef.current = savedMission.version;
          latestStatusRef.current = savedMission.status;
          const savedDraft = normalizeDraft(savedMission.content);
          latestDraftRef.current = savedDraft;
          setDraft(savedDraft);
          lastSavedDraftRef.current = stableStringify(savedDraft);
        } else {
          lastSavedDraftRef.current = nextDraftKey;
        }

        onUpdate();
        return true;
      } catch {
        setError("네트워크 오류가 발생했어요.");
        return false;
      } finally {
        saveInFlightRef.current = false;
        setIsSaving(false);
        setIsAutosaving(false);
      }
    },
    [canEdit, mission.stepNumber, onUpdate, sectionId, setIsSaving]
  );

  useEffect(() => {
    if (!canEdit) return;
    if (currentDraftKey === lastSavedDraftRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [canEdit, currentDraftKey, persistDraft]);

  useEffect(() => {
    return () => {
      if (
        canEdit &&
        stableStringify(latestDraftRef.current) !== lastSavedDraftRef.current
      ) {
        void persistDraft({ force: true, keepalive: true });
      }
    };
  }, [canEdit, persistDraft]);

  const save = useCallback(async () => {
    await persistDraft({ force: true });
  }, [persistDraft]);

  const submit = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await persistDraft({ force: true });
      if (!saved) return;

      const res = await fetch(
        `/api/sections/${sectionId}/missions/${mission.stepNumber}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: latestVersionRef.current }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "제출에 실패했어요.");
        return;
      }

      setCurrentVersion((version) => version + 1);
      setCurrentStatus("pending_approval");
      latestStatusRef.current = "pending_approval";
      onUpdate();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setIsSaving(false);
    }
  }, [mission.stepNumber, onUpdate, persistDraft, sectionId, setIsSaving]);

  return (
    <div className="mission-panel">
      <div className="mission-panel-banner">
        지금 우리 팀은 <strong>미션 {mission.stepNumber}</strong>을 진행 중이에요.
      </div>

      <h3 className="mission-panel-title">
        미션 {mission.stepNumber}. {MISSION_TITLES[mission.stepNumber]}
      </h3>
      <p className="mission-panel-subtitle">
        {mission.stepNumber === 1
          ? "생활 속에서 궁금하거나 불편했던 문제를 통계 탐구 주제로 정리해 봐요."
          : mission.stepNumber === 2
            ? "좋은 질문을 여러 방향으로 넓혀 보면서 조사 질문을 다듬어 봐요."
            : mission.stepNumber === 3
              ? "만든 질문을 설문으로 물을지 직접 조사할지 나눠 봐요."
              : "팀원들과 함께 빈칸을 하나씩 채워 보세요."}
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
      {isAutosaving && !error && (
        <div className="mission-panel-subtitle">입력한 내용을 자동 저장하는 중이에요...</div>
      )}

      <MissionActionBar
        canEdit={canEdit}
        canSubmit={canSubmit}
        isSaving={isSaving}
        status={currentStatus}
        onSave={save}
        onSubmit={submit}
      />
    </div>
  );
}
