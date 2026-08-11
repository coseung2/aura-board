"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { fetchCleaningDuties, fetchMorningSummary, saveShoeFindings, type CleaningDutyItem, type MorningSummary } from "@/lib/inspections-client";
import { todayDateString } from "@/lib/inspector-findings";
import { useClassroomMorningRealtime } from "@/hooks/useClassroomMorningRealtime";
import type { ClassroomMorningRealtimeEvent } from "@/lib/realtime";

export type ClassroomMorningDashboardProps = {
  classroomId: string;
  classroomName: string;
  showDevFeatures?: boolean;
  sections?: ReadonlyArray<"assignments" | "duties">;
  showToolbar?: boolean;
};

export type RoleTab = "cleaning" | "shoe";
const ROLE_TABS: readonly RoleTab[] = ["cleaning", "shoe"];
export const MORNING_ROSTER_COLUMNS = 4;

export function useClassroomMorningDashboard({
  classroomId, sections = ["assignments", "duties"],
}: ClassroomMorningDashboardProps) {
  const showAssignments = sections.includes("assignments");
  const showDuties = sections.includes("duties");
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  /**
   * Assignment rows expand independently: the list runs in two columns, so
   * collapsing a neighbour when opening another was disorienting.
   */
  const [expandedAssignments, setExpandedAssignments] = useState<
    Record<number, boolean>
  >({});
  const [selectedCleaning, setSelectedCleaning] = useState<
    MorningSummary["cleaningFindings"][number] | null
  >(null);
  const [selectedShoe, setSelectedShoe] = useState<
    MorningSummary["shoeFindings"][number] | null
  >(null);
  const [shoeSaving, setShoeSaving] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState<RoleTab>("cleaning");
  const roleTabRefs = useRef<Record<RoleTab, HTMLButtonElement | null>>({
    cleaning: null,
    shoe: null,
  });
  const [cleaningDuties, setCleaningDuties] = useState<CleaningDutyItem[]>([]);
  const [dutiesLoaded, setDutiesLoaded] = useState(false);
  const [dutiesError, setDutiesError] = useState<string | null>(null);
  const [inspDate, setInspDate] = useState(todayDateString());
  const [cleaningItems, setCleaningItems] = useState<
    MorningSummary["cleaningFindings"]
  >([]);
  const [shoeItems, setShoeItems] = useState<MorningSummary["shoeFindings"]>(
    [],
  );
  const [inspLoaded, setInspLoaded] = useState(false);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(
    {},
  );
  const bodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [overflowPanels, setOverflowPanels] = useState<Record<string, boolean>>(
    {},
  );
  const classroomIdRef = useRef(classroomId);
  classroomIdRef.current = classroomId;
  const summaryRequestsRef = useRef(
    new Map<string, Promise<MorningSummary>>(),
  );
  const summaryRequestRef = useRef(0);
  const inspDateRef = useRef(inspDate);
  inspDateRef.current = inspDate;
  const inspectionRequestRef = useRef(0);
  const dutiesRequestRef = useRef(0);

  const loadSummary = useCallback(
    (date: string): Promise<MorningSummary> => {
      const key = `${classroomId}:${date}`;
      const existing = summaryRequestsRef.current.get(key);
      if (existing) return existing;

      const request = fetchMorningSummary(classroomId, date);
      summaryRequestsRef.current.set(key, request);
      request.then(
        () => {
          if (summaryRequestsRef.current.get(key) === request) {
            summaryRequestsRef.current.delete(key);
          }
        },
        () => {
          if (summaryRequestsRef.current.get(key) === request) {
            summaryRequestsRef.current.delete(key);
          }
        },
      );
      return request;
    },
    [classroomId],
  );

  useEffect(() => {
    const checkOverflow = () => {
      const updates: Record<string, boolean> = {};
      for (const [key, element] of Object.entries(bodyRefs.current)) {
        if (element) updates[key] = element.scrollHeight > element.clientHeight;
      }
      setOverflowPanels((previous) => ({ ...previous, ...updates }));
    };
    checkOverflow();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(checkOverflow);
    for (const element of Object.values(bodyRefs.current)) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [summary, activeRoleTab]);

  const refresh = useCallback(async () => {
    const requestId = ++summaryRequestRef.current;
    const date = todayDateString();
    setError(null);
    try {
      const data = await loadSummary(date);
      if (
        requestId !== summaryRequestRef.current ||
        classroomIdRef.current !== classroomId
      ) {
        return;
      }
      setSummary(data);
      setLastUpdated(new Date());
      if (inspDateRef.current === date) {
        setCleaningItems(data.cleaningFindings);
        setShoeItems(data.shoeFindings);
        setInspLoaded(true);
      }
    } catch (reason) {
      if (
        requestId !== summaryRequestRef.current ||
        classroomIdRef.current !== classroomId
      ) {
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "아침 정보를 불러오지 못했습니다.",
      );
    } finally {
      if (
        requestId === summaryRequestRef.current &&
        classroomIdRef.current === classroomId
      ) {
        setLoaded(true);
      }
    }
  }, [classroomId, loadSummary]);

  const refreshInspections = useCallback(
    async (date: string) => {
      const requestId = ++inspectionRequestRef.current;
      try {
        const data = await loadSummary(date);
        if (
          requestId !== inspectionRequestRef.current ||
          classroomIdRef.current !== classroomId ||
          inspDateRef.current !== date
        ) {
          return;
        }
        setCleaningItems(data.cleaningFindings);
        setShoeItems(data.shoeFindings);
        if (date === todayDateString()) {
          setSummary(data);
          setLastUpdated(new Date());
        }
      } catch {
        if (
          requestId !== inspectionRequestRef.current ||
          classroomIdRef.current !== classroomId ||
          inspDateRef.current !== date
        ) {
          return;
        }
        setCleaningItems([]);
        setShoeItems([]);
      } finally {
        if (
          requestId === inspectionRequestRef.current &&
          classroomIdRef.current === classroomId &&
          inspDateRef.current === date
        ) {
          setInspLoaded(true);
        }
      }
    },
    [classroomId, loadSummary],
  );

  const refreshDuties = useCallback(async (date = todayDateString()) => {
    const requestId = ++dutiesRequestRef.current;
    setDutiesError(null);
    try {
      const data = await fetchCleaningDuties(classroomId, date);
      if (
        requestId !== dutiesRequestRef.current ||
        classroomIdRef.current !== classroomId
      ) {
        return;
      }
      setCleaningDuties(data.duties);
    } catch (reason) {
      if (
        requestId !== dutiesRequestRef.current ||
        classroomIdRef.current !== classroomId
      ) {
        return;
      }
      setDutiesError(
        reason instanceof Error
          ? reason.message
          : "청소 당번을 불러오지 못했습니다.",
      );
    } finally {
      if (
        requestId === dutiesRequestRef.current &&
        classroomIdRef.current === classroomId
      ) {
        setDutiesLoaded(true);
      }
    }
  }, [classroomId]);

  const refreshRealtimeData = useCallback(
    async (event?: ClassroomMorningRealtimeEvent) => {
      const today = todayDateString();
      if (event) {
        if (
          event.changeType === "cleaning_inspection" ||
          event.changeType === "shoe_inspection"
        ) {
          if (event.date === inspDateRef.current) {
            await refreshInspections(event.date);
          }
          return;
        }
        if (
          (event.changeType === "cleaning_duty" ||
            event.changeType === "yellow_card") &&
          event.date === today
        ) {
          await refreshDuties(event.date);
        }
        return;
      }

      const selectedDate = inspDateRef.current;
      await Promise.all([
        refresh(),
        selectedDate === today
          ? Promise.resolve()
          : refreshInspections(selectedDate),
        refreshDuties(),
      ]);
    },
    [refresh, refreshDuties, refreshInspections],
  );

  useClassroomMorningRealtime({
    classroomId,
    onRefresh: refreshRealtimeData,
  });

  useEffect(() => {
    setInspLoaded(false);
    void refreshInspections(inspDate);
  }, [inspDate, refreshInspections]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDutiesLoaded(false);
    void refreshDuties();
  }, [refreshDuties]);

  const assignmentSections = summary
    ? [
        ...summary.missingAssignments.reduce<
          Array<{
            id: string;
            title: string;
            dueDate: string | null;
            students: MorningSummary["missingAssignments"][number]["student"][];
          }>
        >((sections, item) => {
          for (const task of item.tasks) {
            let section = sections.find((candidate) => candidate.id === task.id);
            if (!section) {
              section = {
                id: task.id,
                title: task.title,
                dueDate: task.dueDate,
                students: [],
              };
              sections.push(section);
            }
            section.students.push(item.student);
          }
          return sections;
        }, []),
        ...summary.missingAssignmentBoards.reduce<
          Array<{
            id: string;
            title: string;
            dueDate: string | null;
            students: MorningSummary["missingAssignments"][number]["student"][];
          }>
        >((sections, item) => {
          for (const board of item.boards) {
            let section = sections.find((candidate) => candidate.id === board.id);
            if (!section) {
              section = {
                id: board.id,
                title: board.title,
                dueDate: board.dueDate,
                students: [],
              };
              sections.push(section);
            }
            section.students.push(item.student);
          }
          return sections;
        }, []),
      ]
    : [];
  const cleaningRows = Array.from(
    { length: Math.ceil(cleaningItems.length / MORNING_ROSTER_COLUMNS) },
    (_, rowIndex) =>
      cleaningItems.slice(
        rowIndex * MORNING_ROSTER_COLUMNS,
        rowIndex * MORNING_ROSTER_COLUMNS + MORNING_ROSTER_COLUMNS,
      ),
  );

  function handleRoleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const currentIndex = ROLE_TABS.indexOf(activeRoleTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % ROLE_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + ROLE_TABS.length) % ROLE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ROLE_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = ROLE_TABS[nextIndex];
    setActiveRoleTab(nextTab);
    roleTabRefs.current[nextTab]?.focus();
  }

  async function completeShoeFinding() {
    if (!selectedShoe || shoeSaving) return;
    const shoe = selectedShoe;
    setShoeSaving(true);
    setError(null);
    try {
      await saveShoeFindings(classroomId, [
        { studentId: shoe.student.id, notArranged: false },
      ]);
      setSummary((previous) =>
        previous
          ? {
              ...previous,
              kpis: {
                ...previous.kpis,
                shoeNotArrangedCount: Math.max(
                  0,
                  previous.kpis.shoeNotArrangedCount - 1,
                ),
              },
              shoeFindings: previous.shoeFindings.filter(
                (item) => item.student.id !== shoe.student.id,
              ),
            }
          : previous,
      );
      setSelectedShoe(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "실내화 정리 완료 처리에 실패했습니다.",
      );
    } finally {
      setShoeSaving(false);
    }
  }

  return {
    showAssignments,
    showDuties,
    summary,
    loaded,
    error,
    lastUpdated,
    expandedAssignments,
    setExpandedAssignments,
    selectedCleaning,
    setSelectedCleaning,
    selectedShoe,
    setSelectedShoe,
    shoeSaving,
    activeRoleTab,
    setActiveRoleTab,
    roleTabRefs,
    cleaningDuties,
    dutiesLoaded,
    dutiesError,
    inspDate,
    setInspDate,
    cleaningItems,
    shoeItems,
    inspLoaded,
    expandedPanels,
    setExpandedPanels,
    bodyRefs,
    overflowPanels,
    assignmentSections,
    cleaningRows,
    refresh,
    handleRoleTabKeyDown,
    completeShoeFinding,
  };
}
