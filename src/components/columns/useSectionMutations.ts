"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import {
  mergeSectionPositions,
  moveSectionToTarget,
  setSectionPinned,
  toSectionReorderPayload,
  type SectionPosition,
} from "@/lib/section-order";
import {
  BOARD_SECTIONS_UPDATED_EVENT,
  type BoardSectionsUpdatedDetail,
} from "@/lib/board-section-events";
import {
  type SubjectOrder,
  normalizeSubjectOrder,
} from "@/lib/subject-order";

type SectionData = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  accessToken?: string | null;
  sortMode?: string | null;
  assignmentPublishedAt?: string | null;
  assignmentReminderSentAt?: string | null;
};

type UseSectionMutationsOptions = {
  boardId: string;
  canEdit: boolean;
  classroomId?: string | null;
  sections: SectionData[];
  setSections: React.Dispatch<React.SetStateAction<SectionData[]>>;
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  /** 보드 기본 subjectOrder (Board.subjectOrder). */
  boardSubjectOrder?: SubjectOrder | null;
};

type UseSectionMutationsReturn = {
  sortedSections: SectionData[];
  sectionOptions: { id: string; title: string }[];
  handleAddSection: () => Promise<void>;
  handleSectionPin: (sectionId: string, pinned: boolean) => Promise<void>;
  handleSeedFromStudents: (
    seedingStudents: boolean,
    setSeedingStudents: React.Dispatch<React.SetStateAction<boolean>>,
    subjectOrder?: SubjectOrder,
  ) => Promise<SectionData[] | undefined>;
  handleSectionRenamed: (sectionId: string, newTitle: string) => void;
  handleSectionDeleted: (sectionId: string) => void;
  moveSectionTo: (sectionId: string, targetSectionId: string) => Promise<void>;
};

export function useSectionMutations({
  boardId,
  canEdit,
  sections,
  setSections,
  setCards,
  boardSubjectOrder,
}: UseSectionMutationsOptions): UseSectionMutationsReturn {
  const sortedSections = useMemo(
    () => [...sections].sort(sortSections),
    [sections],
  );
  const router = useRouter();
  const sectionOptions = sortedSections.map((section) => ({
    id: section.id,
    title: section.title,
  }));

  function publishSections(next: SectionData[]) {
    const detail: BoardSectionsUpdatedDetail = {
      boardId,
      sections: [...next].sort(sortSections).map((section) => ({
        id: section.id,
        title: section.title,
        accessToken: section.accessToken ?? null,
        order: section.order,
        pinned: section.pinned,
      })),
    };
    window.dispatchEvent(
      new CustomEvent<BoardSectionsUpdatedDetail>(
        BOARD_SECTIONS_UPDATED_EVENT,
        { detail },
      ),
    );
  }

  async function persistSectionPositions(
    previous: SectionData[],
    optimistic: SectionData[],
    failureMessage: string,
  ): Promise<boolean> {
    const payload = toSectionReorderPayload(optimistic);
    setSections((current) => mergeSectionPositions(current, payload));
    publishSections(optimistic);

    try {
      const res = await fetch(`/api/boards/${boardId}/sections/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections: payload }),
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => ""));
      }

      const body = (await res.json().catch(() => null)) as {
        sections?: SectionPosition[];
      } | null;
      const confirmedPositions = body?.sections ?? payload;
      setSections((current) =>
        mergeSectionPositions(current, confirmedPositions),
      );
      publishSections(
        mergeSectionPositions(optimistic, confirmedPositions),
      );
      return true;
    } catch (error) {
      console.error("[useSectionMutations] section order save failed", error);
      setSections((current) => mergeSectionPositions(current, previous));
      publishSections(previous);
      alert(failureMessage);
      return false;
    }
  }

  async function handleAddSection() {
    // 일부 인앱 브라우저/iframe 환경에서는 window.prompt가 throw 하거나
    // 차단될 수 있어 try/catch로 안전하게 감싼다.
    let title: string | null = null;
    try {
      title = window.prompt("새 섹션 이름:");
    } catch (err) {
      console.warn("[useSectionMutations] window.prompt failed", err);
      return;
    }
    if (!title?.trim()) return;
    try {
      const res = await fetch(`/api/sections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, title: title.trim() }),
      });
      if (!res.ok) {
        alert(`섹션 추가 실패: ${await res.text().catch(() => "")}`);
        return;
      }

      const { section } = (await res.json()) as { section: SectionData };
      const next = [
        ...sections.filter((current) => current.id !== section.id),
        section,
      ].sort(sortSections);
      setSections((current) =>
        [
          ...current.filter((existing) => existing.id !== section.id),
          section,
        ].sort(sortSections),
      );
      // 생성 응답 자체가 최신 상태이므로 즉시 표시한다. 여기서 router.refresh()
      // 를 호출하면 잠시 오래된 RSC payload가 방금 만든 섹션을 덮어쓸 수 있다.
      publishSections(next);
    } catch (err) {
      console.error(err);
      alert("섹션 추가 중 오류가 발생했어요.");
    }
  }

  async function handleSectionPin(sectionId: string, pinned: boolean) {
    if (!canEdit) return;
    const next = setSectionPinned(sections, sectionId, pinned);
    if (!next) return;

    await persistSectionPositions(
      sections,
      next,
      "고정 상태 변경에 실패했어요.",
    );
  }

  async function handleSeedFromStudents(
    seedingStudents: boolean,
    setSeedingStudents: React.Dispatch<React.SetStateAction<boolean>>,
    subjectOrder?: SubjectOrder,
  ) {
    if (seedingStudents) return;
    const order = normalizeSubjectOrder(
      subjectOrder ?? boardSubjectOrder ?? "asc",
    );
    setSeedingStudents(true);
    try {
      const res = await fetch(
        `/api/boards/${boardId}/sections/seed-students`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subjectOrder: order }),
        },
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        alert(typeof msg === "string" ? msg : "섹션 추가 실패");
        return;
      }
      const { sections: created } = (await res.json()) as {
        sections: SectionData[];
        subjectOrder?: SubjectOrder;
      };
      const next = [...sections, ...created].sort(sortSections);
      setSections((previous) =>
        [...previous, ...created].sort(sortSections),
      );
      publishSections(next);
      // subjectOrder 등 보드 단위 설정을 서버 props와 동기화한다.
      router.refresh();
      return created;
    } finally {
      setSeedingStudents(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    const next = sections.map((section) =>
      section.id === sectionId ? { ...section, title: newTitle } : section,
    );
    setSections((list) =>
      list.map((section) =>
        section.id === sectionId ? { ...section, title: newTitle } : section,
      ),
    );
    publishSections(next);
  }

  function handleSectionDeleted(sectionId: string) {
    const next = sections.filter((section) => section.id !== sectionId);
    setSections((list) =>
      list.filter((section) => section.id !== sectionId),
    );
    setCards((list) => list.filter((card) => card.sectionId !== sectionId));
    publishSections(next);
  }

  async function moveSectionTo(
    sectionId: string,
    targetSectionId: string,
  ) {
    const next = moveSectionToTarget(sections, sectionId, targetSectionId);
    if (!next) return;

    await persistSectionPositions(
      sections,
      next,
      "섹션 순서 변경에 실패했어요.",
    );
  }

  return {
    sortedSections,
    sectionOptions,
    handleAddSection,
    handleSectionPin,
    handleSeedFromStudents,
    handleSectionRenamed,
    handleSectionDeleted,
    moveSectionTo,
  };
}
