import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { spacing } from "../../theme/tokens";
import { TextField } from "../../components/ui";
import { claimStudentAttendanceReward } from "../../lib/student-attendance";
import { claimTitle, type TitleProgress } from "../../lib/titles";
import {
  fetchWalkingSnapshot,
  type ClassroomRankReward,
  type WalkingMonthlyAttendanceReward,
  type WalkingRepresentativeSlime,
} from "../../lib/walking-health";
import { studentRewardNumberFormatter as numberFormatter } from "./student-reward-format";
import {
  EMPTY_READING_COMPOSER_DRAFT,
  nextReadingComposerInstanceId,
  presentReadingComposerDraft,
  type ReadingComposerBookType,
  type ReadingComposerField,
} from "../../lib/reading-composer-draft";

type BookType = ReadingComposerBookType;
type ReadingTab = "records" | "missions" | "titles";
type ComposerField = ReadingComposerField;
type ReadingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklyCount: number;
  isCurrent: boolean;
  rewardAmount: number;
};
type ReadingSummary = {
  weeklyCount: number;
  totalCount: number;
  averageScore: number | null;
};
export type ReadingMissionKey =
  | "weekly_books"
  | "consecutive_days"
  | "reflection_chars";
export type ReadingMissionStep = {
  unit: number;
  target: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
  claimable: boolean;
};
export type ReadingMission = {
  key: ReadingMissionKey;
  title: string;
  description: string;
  target: number;
  progress: number;
  unit: string;
  completed: boolean;
  amount: number;
  claimed: boolean;
  claimable: boolean;
  steps?: ReadingMissionStep[];
  achievedStepCount?: number;
  claimedStepCount?: number;
  claimableStepCount?: number;
  claimedAmount?: number;
  claimableAmount?: number;
};
export type ReadingWeeklyMissionReward = {
  weekStart: string;
  weekEnd: string;
  amount: number;
  completedCount: number;
  totalCount: number;
  achieved: boolean;
  claimed: boolean;
  claimable: boolean;
  totalStepCount?: number;
  achievedStepCount?: number;
  claimedStepCount?: number;
  claimableStepCount?: number;
  achievedAmount?: number;
  claimedAmount?: number;
  claimableAmount?: number;
  missions: ReadingMission[];
};
type ReadingFeedbackStatus = "pending" | "processing" | "generated" | "failed";
type ReadingEvaluationFields = {
  aiScore: number | null;
  aiFeedback: string | null;
  aiFeedbackStatus: ReadingFeedbackStatus;
  aiFeedbackModel: string | null;
  aiFeedbackError: string | null;
  evaluatedAt: string | null;
};
type ReadingEntry = ReadingEvaluationFields & {
  id: string;
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
  createdAt: string;
};
type ReadingFeedbackResponse = { evaluation: ReadingEvaluationFields };

const FEEDBACK_POLL_INTERVAL_MS = 3_000;
const FEEDBACK_STATUS_TIMEOUT_MS = 10_000;
const FEEDBACK_POLL_WINDOW_MS = 2 * 60_000;
const FEEDBACK_RESUME_WINDOW_MS = 10 * 60_000;
const RETRYABLE_FEEDBACK_STATUSES = new Set([408, 409, 429]);

export function useStudentReadingScreenModel() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const requestedView = Array.isArray(params.view)
    ? params.view[0]
    : params.view;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [bookType, setBookType] = useState<BookType>("story");
  const [activeTab, setActiveTab] = useState<ReadingTab>(
    requestedView === "missions" ? "missions" : "records",
  );
  const [composerVisible, setComposerVisible] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [composerInstanceId, setComposerInstanceId] = useState(0);
  const [title, setTitle] = useState(EMPTY_READING_COMPOSER_DRAFT.title);
  const [author, setAuthor] = useState(EMPTY_READING_COMPOSER_DRAFT.author);
  const [reflection, setReflection] = useState(
    EMPTY_READING_COMPOSER_DRAFT.reflection,
  );
  const composerScrollRef = useRef<ScrollView>(null);
  const composerFieldOffsets = useRef<Record<ComposerField, number>>({
    title: 0,
    author: 0,
    reflection: 0,
  });
  const titleInputRef = useRef<ElementRef<typeof TextField>>(null);
  const authorInputRef = useRef<ElementRef<typeof TextField>>(null);
  const reflectionInputRef = useRef<ElementRef<typeof TextField>>(null);
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [historyBookType, setHistoryBookType] = useState<BookType>("story");
  const [summary, setSummary] = useState<ReadingSummary | null>(null);
  const [missions, setMissions] = useState<ReadingMission[]>([]);
  const [weeklyMissionReward, setWeeklyMissionReward] =
    useState<ReadingWeeklyMissionReward | null>(null);
  const [representativeSlime, setRepresentativeSlime] =
    useState<WalkingRepresentativeSlime | null>(null);
  const [claimingMissionReward, setClaimingMissionReward] = useState(false);
  const [missionClaimError, setMissionClaimError] = useState<string | null>(
    null,
  );
  const [classroomTopFive, setClassroomTopFive] = useState<ReadingRank[]>([]);
  const [classroomRankRewards, setClassroomRankRewards] = useState<
    ClassroomRankReward[]
  >([]);
  const [rankResetAt, setRankResetAt] = useState<string | null>(null);
  const [rankRewardPending, setRankRewardPending] = useState(false);
  const [titles, setTitles] = useState<TitleProgress[]>([]);
  const [attendanceReward, setAttendanceReward] =
    useState<WalkingMonthlyAttendanceReward | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [claimingTitleKey, setClaimingTitleKey] = useState<string | null>(null);
  const feedbackRequestsRef = useRef(new Set<string>());
  const feedbackPollersRef = useRef(new Set<string>());
  const feedbackResumeAttemptedRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);
  const readingCounts = useMemo(
    () => ({
      story: entries.filter((entry) => entry.bookType === "story").length,
      comic: entries.filter((entry) => entry.bookType === "comic").length,
    }),
    [entries],
  );

  useEffect(() => {
    if (
      requestedView === "records" ||
      requestedView === "missions" ||
      requestedView === "titles"
    ) {
      setActiveTab(requestedView);
    }
  }, [requestedView]);
  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.bookType === historyBookType),
    [entries, historyBookType],
  );

  const handleError = useCallback(
    async (nextError: unknown) => {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return true;
      }
      return false;
    },
    [router],
  );

  const load = useCallback(
    async (force = false) => {
      try {
        const payload = await apiFetch<{
          entries: ReadingEntry[];
          summary?: ReadingSummary;
          classroomTopFive?: ReadingRank[];
          classroomRankRewards?: ClassroomRankReward[];
          classroomRankNextResetAt?: string | null;
          titles?: TitleProgress[];
          missions?: ReadingMission[];
          weeklyMissionReward?: ReadingWeeklyMissionReward | null;
          representativeSlime?: WalkingRepresentativeSlime | null;
        }>("/api/student/reading", {
          cacheTtlMs: 5 * 60_000,
          forceRefresh: force,
        });
        setEntries(
          payload.entries.map((entry) =>
            entry.aiFeedbackError
              ? { ...entry, aiFeedbackError: "피드백을 만들지 못했어요." }
              : entry,
          ),
        );
        setSummary(payload.summary ?? null);
        setClassroomTopFive(payload.classroomTopFive ?? []);
        setClassroomRankRewards(payload.classroomRankRewards ?? []);
        setRankResetAt(payload.classroomRankNextResetAt ?? null);
        setTitles(payload.titles ?? []);
        setMissions(
          payload.missions ?? payload.weeklyMissionReward?.missions ?? [],
        );
        setWeeklyMissionReward(payload.weeklyMissionReward ?? null);
        setRepresentativeSlime(payload.representativeSlime ?? null);
        setMissionClaimError(null);
        if (
          !payload.entries.some((entry) => entry.bookType === "story") &&
          payload.entries.some((entry) => entry.bookType === "comic")
        ) {
          setHistoryBookType("comic");
        }
      } catch (nextError) {
        if (!(await handleError(nextError)))
          setError("독서 기록을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const claimReadingTitle = useCallback(
    async (titleKey: string) => {
      setClaimingTitleKey(titleKey);
      setError(null);
      try {
        const payload = await claimTitle(titleKey);
        setTitles(payload.titles);
        setNotice("칭호를 받았어요. 펫 꾸미기에서 붙일 수 있어요.");
      } catch (nextError) {
        if (!(await handleError(nextError))) setError("칭호를 받지 못했어요.");
      } finally {
        setClaimingTitleKey(null);
      }
    },
    [handleError],
  );

  const claimClassroomRankReward = useCallback(
    async (weekStart: string) => {
      if (rankRewardPending) return;
      setRankRewardPending(true);
      setError(null);
      setNotice(null);
      try {
        const payload = await apiFetch<{
          classroomRankReward: {
            weekStart: string;
            rank: number;
            amount: number;
            claimed: true;
          };
        }>("/api/student/reading/rewards/claim", {
          method: "POST",
          json: { kind: "classroom_rank", weekStart },
        });
        setClassroomRankRewards((currentRewards) =>
          currentRewards.filter(
            (reward) =>
              reward.weekStart !== payload.classroomRankReward.weekStart,
          ),
        );
        setNotice(`${payload.classroomRankReward.rank}등 보상을 받았어요.`);
      } catch (nextError) {
        if (!(await handleError(nextError))) {
          setError(
            "순위 보상을 받지 못했어요. 순위를 새로고침한 뒤 다시 시도해 주세요.",
          );
        }
      } finally {
        setRankRewardPending(false);
      }
    },
    [handleError, rankRewardPending],
  );

  const claimAttendance = useCallback(
    async (day: string) => {
      setAttendanceBusy(true);
      setMissionError(null);
      try {
        const payload = await claimStudentAttendanceReward(day);
        setAttendanceReward(payload.attendance);
      } catch (nextError) {
        if (!(await handleError(nextError))) {
          setMissionError("출석 보상을 받지 못했어요.");
        }
      } finally {
        setAttendanceBusy(false);
      }
    },
    [handleError],
  );

  const claimWeeklyMissionReward = useCallback(
    async (missionKey: ReadingMissionKey, unit: number) => {
      if (claimingMissionReward) return;
      const mission = weeklyMissionReward?.missions.find(
        (item) => item.key === missionKey,
      );
      const step = mission?.steps?.find((item) => item.unit === unit);
      if (!mission || !step?.claimable) return;
      setClaimingMissionReward(true);
      setMissionClaimError(null);
      try {
        const payload = await apiFetch<{
          weeklyMissionReward: ReadingWeeklyMissionReward;
          rewardAmount: number;
          missionKey: ReadingMissionKey;
          unit: number;
          step: ReadingMissionStep;
          idempotent: boolean;
        }>("/api/student/reading/rewards/claim", {
          method: "POST",
          json: { missionKey, unit },
        });
        setWeeklyMissionReward(payload.weeklyMissionReward);
        setMissions(payload.weeklyMissionReward.missions);
        setNotice(
          `${mission.title} ${payload.step.target}${mission.unit} 보상 ${numberFormatter.format(payload.rewardAmount)}원을 받았어요.`,
        );
      } catch (nextError) {
        if (!(await handleError(nextError))) {
          setMissionClaimError(
            "보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
        }
      } finally {
        setClaimingMissionReward(false);
      }
    },
    [claimingMissionReward, handleError, weeklyMissionReward],
  );

  const loadMission = useCallback(async () => {
    setMissionLoading(true);
    setMissionError(null);
    try {
      const snapshot = await fetchWalkingSnapshot();
      setAttendanceReward(snapshot.monthlyAttendanceReward);
    } catch (nextError) {
      if (!(await handleError(nextError))) {
        setMissionError("출석 미션을 불러오지 못했어요.");
      }
    } finally {
      setMissionLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      feedbackRequestsRef.current.clear();
      feedbackPollersRef.current.clear();
      feedbackResumeAttemptedRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (
      activeTab === "missions" &&
      attendanceReward === null &&
      !missionLoading
    ) {
      void loadMission();
    }
  }, [activeTab, attendanceReward, loadMission, missionLoading]);

  const requestFeedback = useCallback(
    async (
      readingLogId: string,
      options?: { forceReevaluation?: boolean; reflection?: string },
    ) => {
      if (
        feedbackRequestsRef.current.has(readingLogId) ||
        feedbackPollersRef.current.has(readingLogId)
      ) {
        return;
      }
      feedbackRequestsRef.current.add(readingLogId);

      setEntries((current) =>
        current.map((entry) =>
          entry.id === readingLogId
            ? {
                ...entry,
                aiFeedbackStatus: "processing",
                aiFeedbackError: null,
              }
            : entry,
        ),
      );

      const updateEvaluation = (evaluation: ReadingEvaluationFields) => {
        if (!isMountedRef.current) return;
        const safeEvaluation =
          evaluation.aiFeedbackStatus === "failed"
            ? {
                ...evaluation,
                aiFeedbackError: "피드백을 만들지 못했어요.",
              }
            : evaluation;
        setEntries((current) =>
          current.map((entry) =>
            entry.id === readingLogId
              ? { ...entry, ...safeEvaluation }
              : entry,
          ),
        );
      };

      const pollFeedback = async () => {
        feedbackPollersRef.current.add(readingLogId);
        const deadline = Date.now() + FEEDBACK_POLL_WINDOW_MS;
        try {
          while (
            isMountedRef.current &&
            Date.now() < deadline
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, FEEDBACK_POLL_INTERVAL_MS),
            );
            if (!isMountedRef.current) return;

            try {
              const nextPayload = await apiFetch<ReadingFeedbackResponse>(
                `/api/student/reading/${encodeURIComponent(readingLogId)}/feedback`,
                { timeoutMs: FEEDBACK_STATUS_TIMEOUT_MS },
              );
              const evaluation = nextPayload.evaluation;
              if (
                evaluation.aiFeedbackStatus === "generated" ||
                evaluation.aiFeedbackStatus === "failed"
              ) {
                updateEvaluation(evaluation);
                if (evaluation.aiFeedbackStatus === "generated") {
                  setNotice("피드백이 완성되었어요.");
                  void load(true);
                }
                return;
              }
            } catch (pollError) {
              if (await handleError(pollError)) return;
              const retryable =
                pollError instanceof ApiError &&
                (pollError.status === 0 ||
                  RETRYABLE_FEEDBACK_STATUSES.has(pollError.status) ||
                  pollError.status >= 500);
              if (!retryable) {
                updateEvaluation({
                  aiScore: null,
                  aiFeedback: null,
                  aiFeedbackStatus: "failed",
                  aiFeedbackModel: null,
                  aiFeedbackError: "피드백을 만들지 못했어요.",
                  evaluatedAt: null,
                });
                return;
              }
            }
          }
        } finally {
          feedbackPollersRef.current.delete(readingLogId);
        }
      };

      try {
        const payload = await apiFetch<{ evaluation: ReadingEvaluationFields }>(
          `/api/student/reading/${encodeURIComponent(readingLogId)}/feedback`,
          {
            method: "POST",
            json: options,
            // Gemma 독서 평가는 서버에서 최대 60초까지 걸릴 수 있어 기본
            // 12초 타임아웃으로는 항상 실패로 보인다. (2026-08-15)
            timeoutMs: 65_000,
          },
        );
        updateEvaluation(payload.evaluation);
        if (payload.evaluation.aiFeedbackStatus === "generated") {
          setNotice("피드백이 완성되었어요.");
          void load(true);
        } else if (payload.evaluation.aiFeedbackStatus !== "failed") {
          await pollFeedback();
        }
      } catch (nextError) {
        if (await handleError(nextError)) return;
        const retryable =
          nextError instanceof ApiError &&
          (nextError.status === 0 ||
            RETRYABLE_FEEDBACK_STATUSES.has(nextError.status) ||
            nextError.status >= 500);
        if (!retryable) {
          setEntries((current) =>
            current.map((entry) =>
              entry.id === readingLogId
                ? {
                    ...entry,
                    aiFeedbackStatus: "failed",
                    aiFeedbackError: "피드백을 만들지 못했어요.",
                  }
                : entry,
            ),
          );
        } else {
          await pollFeedback();
        }
      } finally {
        feedbackRequestsRef.current.delete(readingLogId);
      }
    },
    [handleError, load],
  );

  useEffect(() => {
    if (loading) return;
    const cutoff = Date.now() - FEEDBACK_RESUME_WINDOW_MS;
    for (const entry of entries) {
      const recentPending =
        entry.aiFeedbackStatus === "pending" &&
        new Date(entry.createdAt).getTime() >= cutoff;
      if (
        (entry.aiFeedbackStatus === "processing" || recentPending) &&
        !feedbackResumeAttemptedRef.current.has(entry.id)
      ) {
        feedbackResumeAttemptedRef.current.add(entry.id);
        void requestFeedback(entry.id);
      }
    }
  }, [entries, loading, requestFeedback]);

  async function save() {
    if (!title.trim() || !author.trim() || !reflection.trim()) {
      setError("책 제목, 지은이, 독서 감상을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await apiFetch<{ entry: ReadingEntry }>(
        editingEntryId
          ? `/api/student/reading/${encodeURIComponent(editingEntryId)}`
          : "/api/student/reading",
        {
          method: editingEntryId ? "PATCH" : "POST",
          json: {
            bookType,
            title: title.trim(),
            author: author.trim(),
            reflection: reflection.trim(),
          },
        },
      );
      setEntries((current) =>
        editingEntryId
          ? current.map((entry) =>
              entry.id === editingEntryId ? payload.entry : entry,
            )
          : [payload.entry, ...current],
      );
      setHistoryBookType(payload.entry.bookType);
      setTitle(EMPTY_READING_COMPOSER_DRAFT.title);
      setAuthor(EMPTY_READING_COMPOSER_DRAFT.author);
      setReflection(EMPTY_READING_COMPOSER_DRAFT.reflection);
      setComposerInstanceId((current) => nextReadingComposerInstanceId(current));
      const wasEditing = editingEntryId !== null;
      setEditingEntryId(null);
      setNotice(
        wasEditing
          ? "수정했어요. 피드백을 기다리는 중..."
          : "저장했어요. 피드백을 기다리는 중...",
      );
      setComposerVisible(false);
      feedbackResumeAttemptedRef.current.add(payload.entry.id);
      void requestFeedback(
        payload.entry.id,
        wasEditing
          ? { forceReevaluation: true, reflection: payload.entry.reflection }
          : undefined,
      );
    } catch (nextError) {
      if (!(await handleError(nextError)))
        setError("독서 기록을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  function focusComposerField(field: ComposerField) {
    const scrollToField = () => {
      const y = Math.max(0, composerFieldOffsets.current[field] - spacing.sm);
      composerScrollRef.current?.scrollTo({ y, animated: true });
    };

    // Android resizes the modal after focus. Scroll once immediately and once
    // after that resize so every field remains above the keyboard.
    requestAnimationFrame(scrollToField);
    setTimeout(scrollToField, 120);
  }

  function focusNextComposerField(field: ComposerField) {
    if (field === "title") authorInputRef.current?.focus();
    if (field === "author") reflectionInputRef.current?.focus();
  }

  function openComposer() {
    setError(null);
    setNotice(null);
    setEditingEntryId(null);
    // Remount TextInputs on every open so controlled draft values always win
    // over any native TextInput cache left from a previous close/clear.
    setComposerInstanceId((current) => nextReadingComposerInstanceId(current));
    setComposerVisible(true);
  }

  function openEditor(entry: ReadingEntry) {
    setError(null);
    setNotice(null);
    setEditingEntryId(entry.id);
    setBookType(entry.bookType);
    setTitle(entry.title);
    setAuthor(entry.author);
    setReflection(entry.reflection);
    setComposerInstanceId((current) => nextReadingComposerInstanceId(current));
    setComposerVisible(true);
  }

  const composerFieldKeys = presentReadingComposerDraft(
    {
      bookType,
      title,
      author,
      reflection,
    },
    composerInstanceId,
  ).fieldKeys;

  return {
    title,
    activeTab,
    setActiveTab,
    isLandscape,
    summary,
    entries,
    notice,
    openComposer,
    openEditor,
    loading,
    historyBookType,
    setHistoryBookType,
    readingCounts,
    visibleEntries,
    expandedEntryId,
    bookType,
    setExpandedEntryId,
    author,
    reflection,
    requestFeedback,
    classroomTopFive,
    classroomRankRewards,
    rankResetAt,
    rankRewardPending,
    claimClassroomRankReward,
    missionLoading,
    missionError,
    attendanceReward,
    error,
    loadMission,
    attendanceBusy,
    claimAttendance,
    weeklyMissionReward,
    missions,
    load,
    representativeSlime,
    claimingMissionReward,
    missionClaimError,
    claimWeeklyMissionReward,
    titles,
    claimingTitleKey,
    claimReadingTitle,
    composerVisible,
    editingEntryId,
    setComposerVisible,
    composerScrollRef,
    setBookType,
    composerFieldOffsets,
    composerFieldKeys,
    titleInputRef,
    setTitle,
    focusComposerField,
    focusNextComposerField,
    authorInputRef,
    setAuthor,
    reflectionInputRef,
    setReflection,
    saving,
    save,
  } as const;
}

export type StudentReadingScreenViewModel = ReturnType<
  typeof useStudentReadingScreenModel
>;
