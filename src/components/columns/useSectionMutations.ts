"use client";

import { useMemo } from "react";
import { sortSections } from "@/lib/sort-sections";
import {
  type SubjectOrder,
  normalizeSubjectOrder,
} from "@/lib/subject-order";

type SectionData = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
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
  setCards: React.Dispatch<React.SetStateAction<any[]>>;
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
  classroomId,
  sections,
  setSections,
  setCards,
  boardSubjectOrder,
}: UseSectionMutationsOptions): UseSectionMutationsReturn {
  const sortedSections = useMemo(
    () => [...sections].sort(sortSections),
    [sections]
  );
  const sectionOptions = sortedSections.map((s) => ({
    id: s.id,
    title: s.title,
  }));

  async function handleAddSection() {
    const title = window.prompt("새 섹션 이름:");
    if (!title?.trim()) return;
    try {
      const res = await fetch(`/api/sections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, title: title.trim() }),
      });
      if (res.ok) {
        const { section } = await res.json();
        setSections((prev) => [...prev, section].sort(sortSections));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSectionPin(sectionId: string, pinned: boolean) {
    if (!canEdit) return;
    const prev = sections;
    const current = sections.find((s) => s.id === sectionId);
    if (!current) return;

    const nextOrder = pinned
      ? Math.max(-1, ...sections.filter((s) => s.pinned).map((s) => s.order)) + 1
      : current.order;

    setSections((list) =>
      list
        .map((s) =>
          s.id === sectionId ? { ...s, pinned, order: nextOrder } : s
        )
        .sort(sortSections)
    );

    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          pinned ? { pinned, order: nextOrder } : { pinned }
        ),
      });
      if (!res.ok) {
        setSections(prev);
        alert(`고정 상태 변경 실패: ${await res.text().catch(() => "")}`);
      }
    } catch (err) {
      console.error(err);
      setSections(prev);
    }
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
        }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        alert(typeof msg === "string" ? msg : "칼럼 추가 실패");
        return;
      }
      const { sections: created } = (await res.json()) as {
        sections: SectionData[];
        subjectOrder?: SubjectOrder;
      };
      setSections((prev) => [...prev, ...created].sort(sortSections));
      return created;
    } finally {
      setSeedingStudents(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s))
    );
  }

  function handleSectionDeleted(sectionId: string) {
    setSections((list) => list.filter((s) => s.id !== sectionId));
    setCards((list) => list.filter((c: any) => c.sectionId !== sectionId));
  }

  async function moveSectionTo(
    sectionId: string,
    targetSectionId: string
  ) {
    if (sectionId === targetSectionId) return;
    const visualSections = [...sections].sort(sortSections);
    const fromIdx = visualSections.findIndex((s) => s.id === sectionId);
    const toIdx = visualSections.findIndex((s) => s.id === targetSectionId);
    if (fromIdx === -1 || toIdx === -1) return;

    const prev = sections;
    const next = [...visualSections];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);

    const pinned = next.filter((s) => s.pinned);
    const unpinned = next.filter((s) => !s.pinned);
    const orderById = new Map<string, number>();
    pinned.forEach((s, i) => orderById.set(s.id, i));
    unpinned.forEach((s, i) => orderById.set(s.id, unpinned.length - 1 - i));

    const normalised = next.map((s) => ({
      ...s,
      order: orderById.get(s.id) ?? s.order,
    }));
    setSections(normalised);

    const prevById = new Map(prev.map((s) => [s.id, s] as const));
    const changed = normalised.filter((s) => prevById.get(s.id)?.order !== s.order);
    try {
      const responses = await Promise.all(
        changed.map((s) =>
          fetch(`/api/sections/${s.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order: s.order }),
          })
        )
      );
      if (responses.some((r) => !r.ok)) {
        console.error("섹션 순서 변경 실패");
        setSections(prev);
      }
    } catch (err) {
      console.error(err);
      setSections(prev);
    }
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
