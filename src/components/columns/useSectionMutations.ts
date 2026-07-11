"use client";

import { useEffect, useMemo, useRef } from "react";
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
  type BoardSectionsUpdatedMode,
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

  // React state commits are asynchronous. Keep the latest local snapshot
  // synchronously so overlapping section operations compose in invocation order
  // instead of calculating from a stale render closure.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const sectionMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sectionMutationVersionRef = useRef(0);
  const pendingReorderCountRef = useRef(0);
  const confirmedPositionsRef = useRef<SectionPosition[] | null>(null);
  if (confirmedPositionsRef.current === null) {
    confirmedPositionsRef.current = toSectionReorderPayload(sections);
  }
  useEffect(() => {
    // Settings/realtime updates can change positions outside this hook. Once
    // the local reorder queue is idle, treat that snapshot as the new rollback
    // baseline instead of restoring an older render's order.
    if (pendingReorderCountRef.current === 0) {
      confirmedPositionsRef.current = toSectionReorderPayload(sections);
    }
  }, [sections]);

  function setCurrentSections(next: SectionData[]) {
    const sorted = [...next].sort(sortSections);
    sectionsRef.current = sorted;
    setSections(sorted);
    return sorted;
  }

  function publishSections(mode: BoardSectionsUpdatedMode = "snapshot") {
    const detail: BoardSectionsUpdatedDetail = {
      boardId,
      mode,
      sections: [...sectionsRef.current].sort(sortSections).map((section) => ({
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
    optimistic: SectionData[],
    failureMessage: string,
  ): Promise<boolean> {
    const previousPositions =
      confirmedPositionsRef.current ??
      toSectionReorderPayload(sectionsRef.current);
    const payload = toSectionReorderPayload(optimistic);
    pendingReorderCountRef.current += 1;
    setCurrentSections(mergeSectionPositions(sectionsRef.current, payload));
    publishSections("positions");

    const version = ++sectionMutationVersionRef.current;
    const request = async () => {
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
        confirmedPositionsRef.current = mergeSectionPositions(
          sectionsRef.current,
          confirmedPositions,
        ).map(({ id, order, pinned }) => ({ id, order, pinned }));
        if (version !== sectionMutationVersionRef.current) return true;

        setCurrentSections(
          mergeSectionPositions(sectionsRef.current, confirmedPositions),
        );
        publishSections("positions");
        return true;
      } catch (error) {
        // A newer operation owns the optimistic state. Its request will either
        // confirm or roll it back, so an older failure must stay silent.
        if (version !== sectionMutationVersionRef.current) return false;

        console.error(
          "[useSectionMutations] section order save failed",
          error,
        );
        setCurrentSections(
          mergeSectionPositions(
            sectionsRef.current,
            confirmedPositionsRef.current ?? previousPositions,
          ),
        );
        publishSections("positions");
        alert(failureMessage);
        return false;
      } finally {
        pendingReorderCountRef.current -= 1;
      }
    };

    // The queue serializes writes on the server in invocation order. Keep the
    // queue alive even when an individual request fails.
    const queued = sectionMutationQueueRef.current.then(request, request);
    sectionMutationQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
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
        ...sectionsRef.current.filter((current) => current.id !== section.id),
        section,
      ];
      setCurrentSections(next);
      if (confirmedPositionsRef.current) {
        confirmedPositionsRef.current = [
          ...confirmedPositionsRef.current.filter(
            (position) => position.id !== section.id,
          ),
          { id: section.id, order: section.order, pinned: section.pinned },
        ];
      }
      // 생성 응답 자체가 최신 상태이므로 즉시 표시한다. 여기서 router.refresh()
      // 를 호출하면 잠시 오래된 RSC payload가 방금 만든 섹션을 덮어쓸 수 있다.
      publishSections();
    } catch (err) {
      console.error(err);
      alert("섹션 추가 중 오류가 발생했어요.");
    }
  }

  async function handleSectionPin(sectionId: string, pinned: boolean) {
    if (!canEdit) return;
    const current = sectionsRef.current;
    const next = setSectionPinned(current, sectionId, pinned);
    if (!next) return;

    await persistSectionPositions(next, "고정 상태 변경에 실패했어요.");
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
      setCurrentSections([...sectionsRef.current, ...created]);
      if (confirmedPositionsRef.current) {
        const createdIds = new Set(created.map((section) => section.id));
        confirmedPositionsRef.current = [
          ...confirmedPositionsRef.current.filter(
            (position) => !createdIds.has(position.id),
          ),
          ...created.map(({ id, order, pinned }) => ({ id, order, pinned })),
        ];
      }
      publishSections();
      // subjectOrder 등 보드 단위 설정을 서버 props와 동기화한다.
      router.refresh();
      return created;
    } finally {
      setSeedingStudents(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    setCurrentSections(
      sectionsRef.current.map((section) =>
        section.id === sectionId ? { ...section, title: newTitle } : section,
      ),
    );
    publishSections();
  }

  function handleSectionDeleted(sectionId: string) {
    setCurrentSections(
      sectionsRef.current.filter((section) => section.id !== sectionId),
    );
    if (confirmedPositionsRef.current) {
      confirmedPositionsRef.current = confirmedPositionsRef.current.filter(
        (position) => position.id !== sectionId,
      );
    }
    setCards((list) => list.filter((card) => card.sectionId !== sectionId));
    publishSections();
  }

  async function moveSectionTo(
    sectionId: string,
    targetSectionId: string,
  ) {
    const next = moveSectionToTarget(
      sectionsRef.current,
      sectionId,
      targetSectionId,
    );
    if (!next) return;

    await persistSectionPositions(next, "섹션 순서 변경에 실패했어요.");
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
