"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { StudentPlantDTO } from "@/types/plant";
import { RoadmapView } from "./RoadmapView";

interface Props {
  initial: StudentPlantDTO;
  boardId: string;
  studentName: string;
}

/**
 * Teacher-mode wrapper around RoadmapView. Used by the owner-only
 * /board/[id]/student/[studentId] route. Always renders canEdit and
 * allows composing observations on any stage (editAnyStage).
 */
export function TeacherStudentPlantView({
  initial,
  boardId,
  studentName,
}: Props) {
  const [plant, setPlant] = useState<StudentPlantDTO>(initial);

  const handlePlantUpdated = useCallback((next: StudentPlantDTO) => {
    setPlant(next);
  }, []);

  return (
    <div className="plant-teacher-mode">
      <div className="plant-teacher-banner" role="status">
        <span aria-hidden>👩‍🏫</span>
        <span className="plant-teacher-banner-text">
          교사 모드 - <b>{studentName}</b>의 관찰일지
        </span>
        <Link href={`/board/${boardId}`} className="plant-teacher-banner-back">
          ← 요약으로 돌아가기
        </Link>
      </div>
      <RoadmapView
        plant={plant}
        canEdit
        editAnyStage
        onPlantUpdated={handlePlantUpdated}
      />
    </div>
  );
}
