"use client";

import { useCallback, useState } from "react";
import type { PlantJournalResponse, StudentPlantDTO } from "@/types/plant";
import { PlantSelectStep } from "./plant/PlantSelectStep";
import { RoadmapView } from "./plant/RoadmapView";
import { TeacherSummaryView } from "./plant/TeacherSummaryView";

interface Props {
  initial: PlantJournalResponse;
}

export function PlantRoadmapBoard({ initial }: Props) {
  const [state, setState] = useState<PlantJournalResponse | null>(initial);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!state) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/boards/${state.board.id}/plant-journal`);
      if (!res.ok) return;
      const j = (await res.json()) as PlantJournalResponse;
      setState(j);
    } finally {
      setLoading(false);
    }
  }, [state]);

  const handleStarted = useCallback((plant: StudentPlantDTO) => {
    setState((prev) => (prev ? { ...prev, myPlant: plant } : prev));
  }, []);

  const handlePlantUpdated = useCallback((next: StudentPlantDTO) => {
    setState((prev) => (prev ? { ...prev, myPlant: next } : prev));
  }, []);

  if (loading || !state) {
    return (
      <div className="plant-roadmap">
        <div className="plant-skeleton-head">
          <div className="plant-skeleton plant-skeleton-emoji" />
          <div className="plant-skeleton plant-skeleton-title" />
        </div>
        <div className="plant-skeleton plant-skeleton-stage" />
        <div className="plant-skeleton plant-skeleton-stage" />
        <div className="plant-skeleton plant-skeleton-stage" />
      </div>
    );
  }

  // Teacher (board owner) path — render summary view.
  if (state.role === "owner" && state.teacherSummary) {
    return (
      <TeacherSummaryView
        summary={state.teacherSummary}
        recentObservations={state.recentObservations ?? []}
        allSpecies={state.species}
        allowedSpecies={state.species}
        classroomId={state.teacherSummary.classroomId}
        boardId={state.board.id}
        boardTitle={state.board.title}
        onAllowListSaved={refetch}
      />
    );
  }

  // Teacher without summary (no classroom linked)
  if (state.role === "owner" || state.role === "editor") {
    return (
      <div className="plant-empty-state">
        <h2>학급 연결이 필요해요</h2>
        <p>이 보드를 학급(Classroom)에 연결해 주세요.</p>
      </div>
    );
  }

  // Student path — must run before generic viewer branch because
  // server marks student sessions as role="viewer" + viewer.kind="student".
  if (state.viewer.kind === "student") {
    if (state.myPlant) {
      return (
        <RoadmapView
          plant={state.myPlant}
          canEdit
          onPlantUpdated={handlePlantUpdated}
        />
      );
    }
    return (
      <PlantSelectStep
        boardId={state.board.id}
        species={state.species}
        onStart={handleStarted}
      />
    );
  }

  // Read-only viewer (NextAuth user with viewer role, not a student)
  if (state.role === "viewer") {
    return (
      <div className="plant-empty-state">
        <h2>읽기 전용 뷰어</h2>
        <p>식물 관찰일지는 담임 선생님과 학급 학생에게 공개돼요.</p>
      </div>
    );
  }

  return (
    <div className="plant-empty-state">
      <p>접근 권한이 없어요.</p>
    </div>
  );
}
