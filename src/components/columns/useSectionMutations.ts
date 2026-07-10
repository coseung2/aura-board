"use client";

import {
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import {
  applySectionReorder,
  buildSectionReorderPayload,
  reorderSectionForDrop,
  type SectionOrderUpdate,
} from "@/lib/section-reorder";
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
  setSections: Dispatch<SetStateAction<SectionData[]>>;
  setCards: Dispatch<SetStateAction<CardData[]>>;
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
    setSeedingStudents: Dispatch<SetStateAction<boolean>>,
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
  const router = useRouter();
  const sortedSections = useMemo(
    () => [...sections].sort(sortSections),
    [sections],
  );
  const sectionOptions = sortedSections.map((section) => ({
    id: section.id,
    title: section.title,
  }));

  async function handleAddSection() {
    if (!canEdit) return;

    let title: string | null = null;
    try {
      title = window.prompt("새 섹션 이름:");
    } catch (error) {
      console.warn("[useSectionMutations] window.prompt failed", error);
      return;
    }
    if (!title?.trim()) return;

    try {
      const response = await fetch("/api/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, title: title.trim() }),
      });
      if (!response.ok) {
        alert(await readErrorMessage(response, "섹션 추가에 실패했어요."));
        return;
      }

      const { section } = (await response.json()) as { section: SectionData };
      setSections((current) => [...current, section].sort(sortSections));
      router.refresh();
    } catch (error) {
      console.error("[useSectionMutations] add section failed", error);
      alert("섹션 추가 중 오류가 발생했어요.");
    }
  }

  async function handleSectionPin(sectionId: string, pinned: boolean) {
    if (!canEdit) return;

    const previous = sections.find((section) => section.id === sectionId);
    if (!previous) return;

    const nextOrder = pinned
      ? Math.max(
          -1,
          ...sections
            .filter((section) => section.pinned)
            .map((section) => section.order),
        ) + 1
      : previous.order;

    setSections((current) =>
      current
        .map((section) =>
          section.id === sectionId
            ? { ...section, pinned, order: nextOrder }
            : section,
        )
        .sort(sortSections),
    );

    try {
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          pinned ? { pinned, order: nextOrder } : { pinned },
        ),
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "핀 상태 변경에 실패했어요."),
        );
      }
      router.refresh();
    } catch (error) {
      console.error("[useSectionMutations] pin section failed", error);
      setSections((current) =>
        current
          .map((section) =>
            section.id === sectionId ? previous : section,
          )
          .sort(sortSections),
      );
      alert(error instanceof Error ? error.message : "핀 상태 변경에 실패했어요.");
    }
  }

  async function handleSeedFromStudents(
    seedingStudents: boolean,
    setSeedingStudents: Dispatch<SetStateAction<boolean>>,
    subjectOrder?: SubjectOrder,
  ) {
    if (seedingStudents || !canEdit || !classroomId) return;

    const order = normalizeSubjectOrder(
      subjectOrder ?? boardSubjectOrder ?? "asc",
    );
    setSeedingStudents(true);

    try {
      const response = await fetch(
        `/api/boards/${boardId}/sections/seed-students`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subjectOrder: order }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "학생 섹션 추가에 실패했어요."),
        );
      }

      const { sections: created } = (await response.json()) as {
        sections: SectionData[];
        subjectOrder?: SubjectOrder;
      };
      setSections((current) => [...current, ...created].sort(sortSections));
      router.refresh();
      return created;
    } finally {
      setSeedingStudents(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, title: newTitle } : section,
      ),
    );
  }

  function handleSectionDeleted(sectionId: string) {
    setSections((current) =>
      current.filter((section) => section.id !== sectionId),
    );
    setCards((current) =>
      current.filter((card) => card.sectionId !== sectionId),
    );
  }

  async function moveSectionTo(sectionId: string, targetSectionId: string) {
    if (!canEdit || sectionId === targetSectionId) return;

    const visualSections = [...sections].sort(sortSections);
    const nextVisualSections = reorderSectionForDrop(
      visualSections,
      sectionId,
      targetSectionId,
    );
    const changed = nextVisualSections.some(
      (section, index) => section.id !== visualSections[index]?.id,
    );
    if (!changed) return;

    const updates = buildSectionReorderPayload(nextVisualSections);
    const rollbackUpdates: SectionOrderUpdate[] = sections.map((section) => ({
      id: section.id,
      order: section.order,
      pinned: section.pinned,
    }));

    setSections(applySectionReorder(nextVisualSections, updates));

    try {
      const response = await fetch(
        `/api/boards/${boardId}/sections/reorder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sections: updates }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "섹션 순서 저장에 실패했어요."),
        );
      }

      const body = (await response.json().catch(() => null)) as {
        sections?: SectionOrderUpdate[];
      } | null;
      const persistedUpdates =
        body?.sections?.length === updates.length ? body.sections : updates;
      setSections((current) =>
        applySectionReorder(current, persistedUpdates),
      );
      router.refresh();
    } catch (error) {
      console.error("[useSectionMutations] move section failed", error);
      setSections((current) =>
        applySectionReorder(current, rollbackUpdates),
      );
      alert(error instanceof Error ? error.message : "섹션 순서 저장에 실패했어요.");
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

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return fallback;

  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Plain-text responses are returned below.
  }

  return text.trim() || fallback;
}
