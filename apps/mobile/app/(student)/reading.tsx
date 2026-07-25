import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import {
  borders,
  colors,
  composer,
  controls,
  iconSizes,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
  walking,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  AppModal,
  ControlPressable,
  MediaPressable,
  SectionHeader,
  TextField,
} from "../../components/ui";
import {
  ContentTab,
  ContentTabs,
  SectionNav,
  SectionNavItem,
} from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import {
  ClassroomTopFive,
  type ClassroomRankReward,
} from "../../components/ClassroomTopFive";
import { MissionProgressTrack } from "../../components/MissionProgressTrack";
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";
import { TitleCollection, type TitleProgress } from "../../components/TitleCollection";
import { claimStudentAttendanceReward } from "../../lib/student-attendance";
import { claimTitle } from "../../lib/titles";
import {
  fetchWalkingSnapshot,
  type WalkingMonthlyAttendanceReward,
  type WalkingRepresentativeSlime,
} from "../../lib/walking-health";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button.png");
const DISABLED_REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button-disabled.png");
const REWARD_COIN_IMAGE = require("../../assets/walking/reward-coin.png");

type BookType = "comic" | "story";
type ReadingTab = "records" | "missions" | "titles";
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
type ReadingMissionKey = "weekly_books" | "consecutive_days" | "reflection_chars";
type ReadingMissionStep = {
  unit: number;
  target: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
  claimable: boolean;
};
type ReadingMission = {
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
type ReadingWeeklyMissionReward = {
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
type ReadingEntry = {
  id: string;
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
  aiScore: number | null;
  aiFeedback: string | null;
  createdAt: string;
};

export default function StudentReadingScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [bookType, setBookType] = useState<BookType>("story");
  const [activeTab, setActiveTab] = useState<ReadingTab>("records");
  const [composerVisible, setComposerVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [reflection, setReflection] = useState("");
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
  const [missionClaimError, setMissionClaimError] = useState<string | null>(null);
  const [classroomTopFive, setClassroomTopFive] = useState<ReadingRank[]>([]);
  const [classroomRankRewards, setClassroomRankRewards] =
    useState<ClassroomRankReward[]>([]);
  const [rankResetAt, setRankResetAt] = useState<string | null>(null);
  const [rankRewardPending, setRankRewardPending] = useState(false);
  const [titles, setTitles] = useState<TitleProgress[]>([]);
  const [attendanceReward, setAttendanceReward] =
    useState<WalkingMonthlyAttendanceReward | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [claimingTitleKey, setClaimingTitleKey] = useState<string | null>(null);
  const readingCounts = useMemo(
    () => ({
      story: entries.filter((entry) => entry.bookType === "story").length,
      comic: entries.filter((entry) => entry.bookType === "comic").length,
    }),
    [entries],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.bookType === historyBookType),
    [entries, historyBookType],
  );

  const handleError = useCallback(async (nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      await clearSessionToken();
      router.replace(getUnifiedLoginRoute("student"));
      return true;
    }
    return false;
  }, [router]);

  const load = useCallback(async () => {
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
      }>("/api/student/reading");
      setEntries(payload.entries);
      setSummary(payload.summary ?? null);
      setClassroomTopFive(payload.classroomTopFive ?? []);
      setClassroomRankRewards(payload.classroomRankRewards ?? []);
      setRankResetAt(payload.classroomRankNextResetAt ?? null);
      setTitles(payload.titles ?? []);
      setMissions(payload.missions ?? payload.weeklyMissionReward?.missions ?? []);
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
      if (!(await handleError(nextError))) setError("독서 기록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const claimReadingTitle = useCallback(async (titleKey: string) => {
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
  }, [handleError]);

  const claimClassroomRankReward = useCallback(async (weekStart: string) => {
    if (rankRewardPending) return;
    setRankRewardPending(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await apiFetch<{
        classroomRankReward: { weekStart: string; rank: number; amount: number; claimed: true };
      }>("/api/student/reading/rewards/claim", {
        method: "POST",
        json: { kind: "classroom_rank", weekStart },
      });
      setClassroomRankRewards((currentRewards) =>
        currentRewards.filter(
          (reward) => reward.weekStart !== payload.classroomRankReward.weekStart,
        ),
      );
      setNotice(`${payload.classroomRankReward.rank}등 보상을 받았어요.`);
    } catch (nextError) {
      if (!(await handleError(nextError))) {
        setError("순위 보상을 받지 못했어요. 순위를 새로고침한 뒤 다시 시도해 주세요.");
      }
    } finally {
      setRankRewardPending(false);
    }
  }, [handleError, rankRewardPending]);

  const claimAttendance = useCallback(async (day: string) => {
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
  }, [handleError]);


  const claimWeeklyMissionReward = useCallback(async (
    missionKey: ReadingMissionKey,
    unit: number,
  ) => {
    if (claimingMissionReward) return;
    const mission = weeklyMissionReward?.missions.find((item) => item.key === missionKey);
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
        setMissionClaimError("보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setClaimingMissionReward(false);
    }
  }, [claimingMissionReward, handleError, weeklyMissionReward]);

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
    if (activeTab === "missions" && attendanceReward === null && !missionLoading) {
      void loadMission();
    }
  }, [activeTab, attendanceReward, loadMission, missionLoading]);

  async function save() {
    if (!title.trim() || !author.trim() || !reflection.trim()) {
      setError("책 제목, 지은이, 독서 감상을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await apiFetch<{ entry: ReadingEntry }>("/api/student/reading", {
        method: "POST",
        json: { bookType, title: title.trim(), author: author.trim(), reflection: reflection.trim() },
      });
      setEntries((current) => [payload.entry, ...current]);
      setHistoryBookType(payload.entry.bookType);
      setTitle("");
      setAuthor("");
      setReflection("");
      setNotice("저장했어요.");
      setComposerVisible(false);
      // Summary and leaderboard totals are server-derived, so refresh them
      // instead of guessing the new counts locally.
      void load();
    } catch (nextError) {
      if (!(await handleError(nextError))) setError("독서 기록을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  function openComposer() {
    setError(null);
    setNotice(null);
    setComposerVisible(true);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="독서" right={<StudentHeaderActions />} />
      <ContentTabs accessibilityLabel="독서 보기" style={styles.pageTabs}>
        <ContentTab
          selected={activeTab === "records"}
          onPress={() => setActiveTab("records")}
          accessibilityLabel="독서 기록 보기"
        >
          기록
        </ContentTab>
        <ContentTab
          selected={activeTab === "missions"}
          onPress={() => setActiveTab("missions")}
          accessibilityLabel="독서 미션 보기"
        >
          미션
        </ContentTab>
        <ContentTab
          selected={activeTab === "titles"}
          onPress={() => setActiveTab("titles")}
          accessibilityLabel="독서 칭호 보기"
        >
          칭호
        </ContentTab>
      </ContentTabs>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: "height" })}
        style={styles.keyboardWrap}
      >
        <ScrollView
          contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.tabContent}>
            {activeTab === "records" ? (
              <>
              <View style={styles.summarySection} accessibilityRole="summary">
                <SectionHeader title="요약" />
                <View style={styles.summaryRows}>
                  <SummaryRow
                    label="이번 주"
                    value={`${summary?.weeklyCount ?? 0}권`}
                  />
                  <SummaryRow
                    label="전체"
                    value={`${summary?.totalCount ?? entries.length}권`}
                  />
                  <SummaryRow
                    label="평균 점수"
                    value={
                      summary?.averageScore === null || summary?.averageScore === undefined
                        ? "-"
                        : `${summary.averageScore}점`
                    }
                  />
                </View>
              </View>

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <AppButton onPress={openComposer}>독서 기록 작성</AppButton>

              <View style={[styles.historyColumn, isLandscape && styles.landscapeHistoryColumn]}>
                <SectionHeader
                  title="내 기록 목록"
              right={
                !loading && entries.length > 0 ? (
                  <SectionNav accessibilityLabel="독서 기록 종류">
                    <SectionNavItem
                      style={styles.historyTypeNavItem}
                      selected={historyBookType === "story"}
                      onPress={() => setHistoryBookType("story")}
                      accessibilityLabel={`이야기책 ${readingCounts.story}개`}
                    >
                      {`이야기책 ${readingCounts.story}`}
                    </SectionNavItem>
                    <SectionNavItem
                      style={styles.historyTypeNavItem}
                      selected={historyBookType === "comic"}
                      onPress={() => setHistoryBookType("comic")}
                      accessibilityLabel={`만화책 ${readingCounts.comic}개`}
                    >
                      {`만화책 ${readingCounts.comic}`}
                    </SectionNavItem>
                  </SectionNav>
                ) : undefined
              }
                />

                {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>독서 기록을 불러오는 중이에요.</Text>
              </View>
                ) : entries.length === 0 ? (
              <View style={styles.emptyState} accessible accessibilityRole="text">
                <Text style={styles.emptyTitle}>아직 기록이 없어요.</Text>
                <Text style={styles.emptyDescription}>
                  오늘 읽은 책을 첫 번째 기록으로 남겨 보세요.
                </Text>
              </View>
                ) : (
              visibleEntries.length === 0 ? (
                <Text style={styles.emptyTypeEntry}>
                  아직 {historyBookType === "story" ? "이야기책" : "만화책"} 기록이 없어요.
                </Text>
              ) : visibleEntries.map((entry) => {
                const expanded = expandedEntryId === entry.id;
                const typeLabel = entry.bookType === "comic" ? "만화책" : "이야기책";
                return (
                  <View key={entry.id} style={styles.entry}>
                    <View style={styles.entryIndex} accessible={false} />
                    <View
                      style={[
                        styles.entryContent,
                        expanded && styles.entryExpanded,
                      ]}
                    >
                      <ControlPressable
                        style={styles.entryToggle}
                        onPress={() =>
                          setExpandedEntryId((current) =>
                            current === entry.id ? null : entry.id,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${entry.title} ${expanded ? "접기" : "펼치기"}`}
                        accessibilityState={{ expanded }}
                      >
                        <Text style={styles.entryTitle} numberOfLines={1}>
                          {entry.title}
                        </Text>
                        {expanded ? (
                          <ChevronUp
                            size={16}
                            color={colors.textFaint}
                            strokeWidth={2}
                            accessible={false}
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                            color={colors.textFaint}
                            strokeWidth={2}
                            accessible={false}
                          />
                        )}
                      </ControlPressable>

                      {expanded ? (
                        <View style={styles.entryDetails}>
                          <View style={styles.entryTopline}>
                            <Text style={styles.entryType}>{typeLabel}</Text>
                            <Text style={styles.entryDate}>
                              {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                            </Text>
                          </View>
                          <Text style={styles.meta}>{entry.author}</Text>
                          <Text style={styles.body}>{entry.reflection}</Text>
                          {entry.aiFeedback ? (
                            <View style={styles.feedbackRow}>
                              <Text style={styles.feedbackScore}>{entry.aiScore ?? 0}점</Text>
                              <Text style={styles.feedback}>{entry.aiFeedback}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
                )}
              </View>

              {classroomTopFive.length > 0 || classroomRankRewards.length > 0 ? (
                <ClassroomTopFive
                  ranks={classroomTopFive.map((rank) => ({
                    studentId: rank.studentId,
                    studentName: rank.studentName,
                    metricValue: rank.weeklyCount,
                    isCurrent: rank.isCurrent,
                    rewardAmount: Math.max(0, Number(rank.rewardAmount) || 0),
                  }))}
                  rankRewards={classroomRankRewards}
                  nextResetAt={rankResetAt}
                  metricUnit="권"
                  rewardPending={rankRewardPending}
                  onClaimReward={(weekStart) => void claimClassroomRankReward(weekStart)}
                />
              ) : null}
              </>
            ) : activeTab === "missions" ? (
              <View style={styles.missionScreen}>
                {missionLoading || missionError || attendanceReward ? (
                  <View style={styles.missionSection}>
                {missionLoading ? (
                  <View style={styles.loadingState} accessibilityRole="progressbar">
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>출석 미션을 불러오는 중이에요.</Text>
                  </View>
                ) : missionError ? (
                  <View style={styles.missionError} accessibilityRole="alert">
                    <Text style={styles.error}>{missionError}</Text>
                    <AppButton variant="secondary" onPress={() => void loadMission()}>
                      다시 시도
                    </AppButton>
                  </View>
                ) : attendanceReward ? (
                  <WalkingAttendanceCalendar
                    reward={attendanceReward}
                    busy={attendanceBusy}
                    onDayPress={(day) => void claimAttendance(day)}
                  />
                ) : null}
                  </View>
                ) : null}

                <View style={styles.missionSection}>
                {loading && !weeklyMissionReward && missions.length === 0 ? (
                  <View style={styles.loadingState} accessibilityRole="progressbar">
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>독서 미션을 불러오는 중이에요.</Text>
                  </View>
                ) : error && !weeklyMissionReward && missions.length === 0 ? (
                  <View style={styles.missionError} accessibilityRole="alert">
                    <Text style={styles.error}>{error}</Text>
                    <AppButton variant="secondary" onPress={() => void load()}>
                      다시 시도
                    </AppButton>
                  </View>
                ) : (
                  <ReadingWeeklyMissionPanel
                    reward={
                      weeklyMissionReward ?? {
                        weekStart: "",
                        weekEnd: "",
                        amount: missions.reduce((sum, mission) => sum + (mission.amount || 0), 0) || 50,
                        completedCount: missions.filter((mission) => mission.completed).length,
                        totalCount: Math.max(1, missions.length || 3),
                        achieved: missions.length > 0 && missions.every((mission) => mission.completed),
                        claimed: missions.length > 0 && missions.every((mission) => mission.claimed),
                        claimable: missions.some((mission) => mission.claimable),
                        missions,
                      }
                    }
                    representativeSlime={representativeSlime}
                    claiming={claimingMissionReward}
                    claimError={missionClaimError}
                    onClaim={(missionKey, unit) => void claimWeeklyMissionReward(missionKey, unit)}
                  />
                )}
                </View>
              </View>
            ) : (
              <TitleCollection
                titles={titles}
                emptyHint="독서 기록을 쌓으면 칭호를 얻을 수 있어요."
                claimingKey={claimingTitleKey}
                onClaim={(titleKey) => void claimReadingTitle(titleKey)}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        keyboardAvoiding
        closeOnBackdropPress
        align="center"
        accessibilityLabel="독서 기록 작성"
        sheetStyle={styles.composerSheet}
      >
        <View style={styles.composerHeader}>
            <ControlPressable
              style={styles.composerClose}
              onPress={() => setComposerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="독서 기록 작성 닫기"
            >
              <X size={iconSizes.md} color={colors.textMuted} strokeWidth={2} accessible={false} />
            </ControlPressable>
        </View>

        <ScrollView
          style={styles.composerScroll}
          contentContainerStyle={styles.composerContent}
          keyboardShouldPersistTaps="handled"
        >
          <SectionNav accessibilityLabel="책 종류">
                <SectionNavItem
                  selected={bookType === "story"}
                  onPress={() => setBookType("story")}
                  accessibilityLabel="이야기책"
                >
                  이야기책
                </SectionNavItem>
                <SectionNavItem
                  selected={bookType === "comic"}
                  onPress={() => setBookType("comic")}
                  accessibilityLabel="만화책"
                >
                  만화책
                </SectionNavItem>
          </SectionNav>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>책 제목</Text>
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder="책 제목을 입력해 주세요"
              accessibilityLabel="책 제목"
              returnKeyType="next"
              maxLength={80}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>지은이</Text>
            <TextField
              value={author}
              onChangeText={setAuthor}
              placeholder="지은이를 입력해 주세요"
              accessibilityLabel="지은이"
              returnKeyType="next"
              maxLength={60}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>독서 감상</Text>
            <TextField
              style={styles.reflectionInput}
              value={reflection}
              onChangeText={setReflection}
              placeholder="재미있었던 점이나 느낀 점"
              accessibilityLabel="독서 감상"
              multiline
              maxLength={600}
            />
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.composerFooter}>
          <AppButton loading={saving} onPress={() => void save()}>
            저장하기
          </AppButton>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={styles.summaryRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label} ${value}`}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ReadingRewardClaimButton({
  disabled,
  muted = false,
  label,
  onPress,
}: {
  disabled: boolean;
  muted?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <MediaPressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.rewardClaimButton}
    >
      <Image
        source={muted ? DISABLED_REWARD_CLAIM_BUTTON_IMAGE : REWARD_CLAIM_BUTTON_IMAGE}
        resizeMode="contain"
        style={styles.rewardClaimButtonImage}
        accessible={false}
      />
    </MediaPressable>
  );
}

function ReadingRewardCoinAmount({ amount }: { amount: number }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${numberFormatter.format(amount)}원 보상`}
      style={styles.rewardCoinAmount}
    >
      <Image
        source={REWARD_COIN_IMAGE}
        resizeMode="contain"
        style={styles.rewardCoinImage}
        accessible={false}
      />
      <Text style={styles.rewardCoinText}>×{numberFormatter.format(amount)}</Text>
    </View>
  );
}

function readingMissionMarkerValues(mission: ReadingMission) {
  const target = Math.max(0, mission.target);
  if (target === 0) return [];

  const interval = mission.key === "reflection_chars" ? 200 : 1;
  const markers: number[] = [];
  for (let value = interval; value < target; value += interval) {
    markers.push(value);
  }
  markers.push(target);
  return markers;
}

function readingMissionSteps(mission: ReadingMission): ReadingMissionStep[] {
  if (mission.steps && mission.steps.length > 0) return mission.steps;
  return readingMissionMarkerValues(mission).map((target, index) => {
    const achieved = mission.progress >= target;
    return {
      unit: index + 1,
      target,
      amount: 10,
      achieved,
      claimed: mission.claimed,
      claimable: achieved && !mission.claimed,
    };
  });
}

function readingMissionBoundaryLabel(mission: ReadingMission, marker: number) {
  return `${numberFormatter.format(marker)}${mission.unit}`;
}

function ReadingWeeklyMissionPanel({
  reward,
  representativeSlime,
  claiming,
  claimError,
  onClaim,
}: {
  reward: ReadingWeeklyMissionReward;
  representativeSlime: WalkingRepresentativeSlime | null;
  claiming: boolean;
  claimError: string | null;
  onClaim: (missionKey: ReadingMissionKey, unit: number) => void;
}) {
  return (
    <View style={styles.missionBlock}>
      <View style={styles.missionPreviewList}>
        {reward.missions.map((mission) => {
          const steps = readingMissionSteps(mission);
          const markerValues = steps.map((step) => step.target);
          return (
            <View
              key={mission.key}
              style={styles.missionPreview}
              accessibilityRole="summary"
              accessibilityLabel={`${mission.title}, ${mission.progress}/${mission.target}${mission.unit}, 보상 ${mission.amount}원${
                mission.claimed ? ", 수령 완료" : mission.completed ? ", 수령 가능" : ""
              }`}
            >
              <View style={styles.missionPreviewText}>
                <View style={styles.missionTitleRow}>
                  <Text style={styles.missionPreviewTitle}>{mission.title}</Text>
                  <Text
                    style={[
                      styles.missionProgressLabel,
                      mission.claimed && styles.missionProgressComplete,
                    ]}
                  >
                    {mission.claimed
                      ? "수령 완료"
                      : mission.completed
                        ? "수령 가능"
                        : `${mission.progress}/${mission.target}${mission.unit}`}
                  </Text>
                </View>
                <Text style={styles.missionPreviewDescription}>{mission.description}</Text>
                <MissionProgressTrack
                  value={mission.progress}
                  max={mission.target}
                  markerValues={markerValues}
                  completedMarkerValues={steps
                    .filter((step) => step.claimed)
                    .map((step) => step.target)}
                  accessibilityLabel={`${mission.title} 진행도 ${mission.progress}/${mission.target}${mission.unit}`}
                  representativeSlime={representativeSlime}
                />
                <View style={styles.readingMilestones}>
                  {steps.map((step) => {
                    const canClaim = step.claimable && !claiming;
                    return (
                      <View key={step.unit} style={styles.readingMilestone}>
                        <Text
                          style={styles.readingMilestoneLabel}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                        >
                          {readingMissionBoundaryLabel(mission, step.target)}
                        </Text>
                        <ReadingRewardCoinAmount amount={step.amount} />
                        {step.claimed ? (
                          <Text style={styles.rewardClaimedLabel}>수령 완료</Text>
                        ) : (
                          <ReadingRewardClaimButton
                            disabled={!canClaim}
                            muted={!canClaim}
                            onPress={() => onClaim(mission.key, step.unit)}
                            label={`${mission.title} ${step.target}${mission.unit} 보상 ${numberFormatter.format(step.amount)}원${
                              canClaim ? " 수령" : " 아직 수령할 수 없음"
                            }`}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  keyboardWrap: { flex: 1 },
  pageTabs: { paddingHorizontal: pageChrome.horizontalPadding },
  content: {
    flexGrow: 1,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.lg,
  },
  contentLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxl,
  },
  tabContent: {
    width: "100%",
    minWidth: 0,
    gap: spacing.lg,
  },
  summarySection: { gap: spacing.sm },
  summaryRows: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  summaryRow: {
    flex: 1,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  summaryLabel: { ...typography.label, color: colors.textMuted, textAlign: "center" },
  summaryValue: { ...typography.section, color: colors.text, textAlign: "center" },
  composerSheet: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: composer.sheetMaxHeight,
  },
  composerContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  composerScroll: { flexShrink: 1 },
  composerFooter: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  composerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  composerClose: {
    width: controls.closeButton,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  historyColumn: { gap: spacing.md, minWidth: 0 },
  landscapeHistoryColumn: { flex: 2, minWidth: 0 },
  missionScreen: { gap: spacing.xxl },
  missionSection: { gap: spacing.md },
  missionBlock: { gap: spacing.md },
  rewardClaimButton: {
    width: "100%",
    maxWidth: walking.rewardClaimButtonWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  rewardClaimButtonImage: {
    width: "100%",
    height: tapMin,
  },
  rewardClaimedLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
    textAlign: "center",
  },
  missionError: { gap: spacing.sm, paddingVertical: spacing.md },
  missionPreviewList: {},
  missionPreview: {
    minHeight: tapMin,
    paddingVertical: spacing.md,
  },
  missionPreviewText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  missionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  missionPreviewTitle: { ...typography.section, color: colors.text },
  missionPreviewDescription: { ...typography.body, color: colors.textMuted },
  missionProgressLabel: { ...typography.badge, color: colors.accentTintedText },
  missionProgressComplete: { color: colors.statusReviewedText },
  readingMilestones: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxs,
  },
  readingMilestone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xxs,
  },
  readingMilestoneLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  rewardCoinAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  rewardCoinImage: {
    width: walking.rankRewardCoinSize,
    height: walking.rankRewardCoinSize,
  },
  rewardCoinText: {
    ...typography.micro,
    color: colors.text,
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  reflectionInput: {
    minHeight: Math.max(controls.multilineInputMinHeight * 2.4, 230),
    textAlignVertical: "top",
  },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.statusReviewedText },
  historyTypeNavItem: { minWidth: 84, alignItems: "center" },
  loadingState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted },
  emptyTypeEntry: { ...typography.body, color: colors.textFaint, paddingVertical: spacing.md },
  emptyState: {
    paddingVertical: spacing.xl,
    gap: spacing.xs,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  emptyTitle: { ...typography.section, color: colors.text },
  emptyDescription: { ...typography.body, color: colors.textMuted },
  entry: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  entryIndex: {
    width: borders.medium,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.btn,
  },
  entryExpanded: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  entryToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  entryTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  entryType: { ...typography.badge, color: colors.accentTintedText },
  entryDate: { ...typography.micro, color: colors.textMuted },
  entryTitle: { ...typography.section, color: colors.text, flex: 1 },
  entryDetails: { gap: spacing.sm },
  meta: { ...typography.micro, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  feedbackScore: { ...typography.label, color: colors.accentTintedText },
  feedback: { ...typography.body, color: colors.accentTintedText, flex: 1 },
});
