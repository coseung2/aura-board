import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  AppModal,
  ControlPressable,
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
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";
import { TitleCollection, type TitleProgress } from "../../components/TitleCollection";
import { claimStudentAttendanceReward } from "../../lib/student-attendance";
import { claimTitle } from "../../lib/titles";
import {
  fetchWalkingSnapshot,
  type WalkingMonthlyAttendanceReward,
} from "../../lib/walking-health";

type BookType = "comic" | "story";
type ReadingTab = "records" | "missions" | "titles";
type ReadingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklyCount: number;
  isCurrent: boolean;
};
type ReadingSummary = {
  weeklyCount: number;
  totalCount: number;
  averageScore: number | null;
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

const READING_MISSION_PREVIEWS = [
  {
    title: "주간 독서 권수",
    description: "이번 주에 읽은 책 권수를 함께 쌓아요.",
  },
  {
    title: "연속 독서일",
    description: "매일 읽는 습관을 이어 가요.",
  },
  {
    title: "감상문 작성량",
    description: "느낀 점을 더 풍성하게 남겨 봐요.",
  },
  {
    title: "장르 탐험",
    description: "새로운 종류의 책을 만나 봐요.",
  },
] as const;

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
  const [classroomTopFive, setClassroomTopFive] = useState<ReadingRank[]>([]);
  const [rankResetAt, setRankResetAt] = useState<string | null>(null);
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
        classroomRankNextResetAt?: string | null;
        titles?: TitleProgress[];
      }>("/api/student/reading");
      setEntries(payload.entries);
      setSummary(payload.summary ?? null);
      setClassroomTopFive(payload.classroomTopFive ?? []);
      setRankResetAt(payload.classroomRankNextResetAt ?? null);
      setTitles(payload.titles ?? []);
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

              {classroomTopFive.length > 0 ? (
                <View style={styles.topFiveSection} accessibilityRole="summary">
                  <SectionHeader
                    title="우리 반 Top 5"
                    right={
                      <Text style={styles.topFivePeriod}>
                        {formatRankResetAt(rankResetAt)} 랭킹 초기화
                      </Text>
                    }
                  />
                  <View accessibilityRole="list">
                    {classroomTopFive.map((rank, index) => (
                      <View
                        key={rank.studentId}
                        style={[
                          styles.topFiveRow,
                          rank.isCurrent && styles.topFiveCurrentRow,
                        ]}
                        accessibilityRole="summary"
                        accessibilityLabel={`${index + 1}위 ${rank.studentName}, ${rank.weeklyCount}권${
                          rank.isCurrent ? ", 나" : ""
                        }`}
                      >
                        <Text style={styles.topFiveRank}>{index + 1}</Text>
                        <Text style={styles.topFiveName} numberOfLines={1}>
                          {rank.studentName}
                        </Text>
                        <Text style={styles.topFiveCount}>{rank.weeklyCount}권</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : activeTab === "missions" ? (
            <View style={styles.missionScreen}>
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

              <View style={styles.missionSection}>
                <SectionHeader
                  title="독서 미션"
                  right={<Text style={styles.pendingLabel}>준비 중</Text>}
                />
                <View style={styles.missionPreviewList}>
                  {READING_MISSION_PREVIEWS.map((mission) => (
                    <View key={mission.title} style={styles.missionPreview}>
                      <View style={styles.missionPreviewText}>
                        <Text style={styles.missionPreviewTitle}>{mission.title}</Text>
                        <Text style={styles.missionPreviewDescription}>{mission.description}</Text>
                      </View>
                      <Text style={styles.pendingLabel}>준비 중</Text>
                    </View>
                  ))}
                </View>
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
            <Text style={styles.composerTitle}>독서 기록 작성</Text>
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

function formatRankResetAt(value: string | null) {
  if (!value) return "일 00:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "일 00:00";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday =
    { Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토" }[
      values.weekday ?? ""
    ] ?? "일";
  return `${values.month}/${values.day}(${weekday}) ${values.hour}:00`;
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
  topFiveSection: { gap: spacing.sm },
  topFivePeriod: { ...typography.label, color: colors.textMuted },
  topFiveRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  topFiveCurrentRow: { backgroundColor: colors.accentTintedBg },
  topFiveRank: {
    width: spacing.xl,
    ...typography.section,
    color: colors.accentTintedText,
    textAlign: "center",
  },
  topFiveName: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
  topFiveCount: { ...typography.label, color: colors.textMuted },
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  composerTitle: { ...typography.title, color: colors.text, flex: 1, minWidth: 0 },
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
  pendingLabel: { ...typography.badge, color: colors.textFaint },
  missionError: { gap: spacing.sm, paddingVertical: spacing.md },
  missionPreviewList: {
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  missionPreview: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  missionPreviewText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  missionPreviewTitle: { ...typography.section, color: colors.text },
  missionPreviewDescription: { ...typography.body, color: colors.textMuted },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  reflectionInput: {
    minHeight: controls.multilineInputMinHeight,
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
