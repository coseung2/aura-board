import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  borders,
  colors,
  dashboard,
  iconSizes,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutLabel, layoutThumbnail } from "../../theme/layout-meta";
import { apiFetch, ApiError, getApiUrl } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import { roleEmoji, studentDutyTarget } from "../../lib/student-navigation";
import { isAssignmentReminderVisible } from "../../lib/student-notifications";
import type {
  BoardMeta,
  MeResponse,
  StudentAssignmentTodo,
  StudentDuty,
  WalletSummary,
} from "../../lib/types";
import {
  AppButton,
  ControlPressable,
  Pill,
  SurfaceCard,
  SurfacePressable,
} from "../../components/ui";

// 학생 대시보드. 웹과 같은 /api/student/me 계약을 사용한다.

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

export default function StudentHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"LESSON" | "PLAY">("LESSON");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const columnCount =
    width < dashboard.columns.one
      ? 1
      : width < dashboard.columns.two
        ? 2
        : width < dashboard.columns.three
          ? 3
          : 4;
  const gridGap = spacing.lg;

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await apiFetch<WalletSummary>("/api/my/wallet");
      setWallet(res);
    } catch {
      setWallet(null);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        const res = await apiFetch<MeResponse>("/api/student/me");
        setMe(res);
        setError(null);

        loadWallet();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await clearSessionToken();
          router.replace("/(student)/login");
          return;
        }
        setError(e instanceof Error ? e.message : "불러올 수 없어요");
      } finally {
        setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [router, loadWallet],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>😵</Text>
          <Text style={styles.errorTitle}>연결할 수 없어요</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <AppButton
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            다시 시도
          </AppButton>
        </View>
      </SafeAreaView>
    );
  }

  const boards = me?.boards ?? [];
  const duties = me?.duties ?? [];
  const assignments = me?.assignments ?? [];
  const classroomName = me?.student.classroom?.name ?? "학급 미배정";
  const hasLessonBoards = boards.some(
    (board) => (board.category ?? "LESSON") === "LESSON",
  );
  const hasPlayBoards = boards.some((board) => board.category === "PLAY");
  const visibleCategory =
    activeCategory === "LESSON" && !hasLessonBoards && hasPlayBoards
      ? "PLAY"
      : activeCategory === "PLAY" && !hasPlayBoards && hasLessonBoards
        ? "LESSON"
        : activeCategory;
  const visibleBoards = boards.filter(
    (board) => (board.category ?? "LESSON") === visibleCategory,
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.greetingRow}>
          <View style={styles.greetingCluster}>
            <Text style={styles.greeting}>
              {me?.student.name}님, 안녕하세요
            </Text>
            <Pill tone="accent">{classroomName}</Pill>
          </View>
        </View>

        <WalletCardCompact
          wallet={wallet}
          loading={walletLoading}
          onDetail={() => router.push("/(student)/wallet" as Href)}
        />

        <DutySectionCompact
          duties={duties}
          onOpen={(path) => router.push(path as Href)}
        />

        <AssignmentPanel assignments={assignments} />

        {boards.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>아직 보드가 없어요</Text>
            <Text style={styles.emptyMsg}>
              선생님이 새 보드를 만들면 여기에 나타나요.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.boardSectionHeader}>
              <Text style={styles.sectionSub}>
                {visibleCategory === "LESSON" ? "학습 보드" : "놀이 보드"}
              </Text>
              <View style={styles.categoryTabs}>
                <ControlPressable
                  style={[
                    styles.categoryTab,
                    visibleCategory === "LESSON" && styles.categoryTabActive,
                  ]}
                  onPress={() => setActiveCategory("LESSON")}
                  disabled={!hasLessonBoards}
                  accessibilityState={{
                    selected: visibleCategory === "LESSON",
                    disabled: !hasLessonBoards,
                  }}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      visibleCategory === "LESSON" && styles.categoryTabTextActive,
                    ]}
                  >
                    학습 {boards.filter((board) => (board.category ?? "LESSON") === "LESSON").length}
                  </Text>
                </ControlPressable>
                <ControlPressable
                  style={[
                    styles.categoryTab,
                    visibleCategory === "PLAY" && styles.categoryTabActive,
                  ]}
                  onPress={() => setActiveCategory("PLAY")}
                  disabled={!hasPlayBoards}
                  accessibilityState={{
                    selected: visibleCategory === "PLAY",
                    disabled: !hasPlayBoards,
                  }}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      visibleCategory === "PLAY" && styles.categoryTabTextActive,
                    ]}
                  >
                    놀이 {boards.filter((board) => board.category === "PLAY").length}
                  </Text>
                </ControlPressable>
              </View>
            </View>
            <View style={styles.boardGrid}>
              {chunk(visibleBoards, columnCount).map((row, rowIdx) => (
                <View
                  key={rowIdx}
                  style={[
                    styles.gridRow,
                    { gap: gridGap, marginBottom: gridGap },
                  ]}
                >
                  {row.map((board) => (
                    <View key={board.id} style={styles.gridCell}>
                      <BoardCard board={board} />
                    </View>
                  ))}
                  {row.length < columnCount
                    ? Array.from({ length: columnCount - row.length }).map(
                        (_, idx) => (
                          <View
                            key={`placeholder-${idx}`}
                            style={styles.gridCell}
                            pointerEvents="none"
                          />
                        ),
                      )
                    : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

const ASSIGNMENT_VISIBLE_LIMIT = 4;

function assignmentTarget(item: StudentAssignmentTodo): string | null {
  if (!item.href) return null;
  if (item.href.includes("/check") || item.href.startsWith("/classroom/")) {
    return `/(student)/check?classroomId=${encodeURIComponent(item.boardSlug)}`;
  }
  return `/(student)/board/${encodeURIComponent(item.boardSlug)}`;
}

function formatAssignmentDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function AssignmentPanel({
  assignments,
}: {
  assignments: StudentAssignmentTodo[];
}) {
  const router = useRouter();
  const missingCount = assignments.filter((item) => !item.submitted).length;
  const completedCount = assignments.length - missingCount;
  const [filter, setFilter] = useState<"missing" | "completed">(
    missingCount > 0 ? "missing" : "completed",
  );

  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = filtered.slice(0, ASSIGNMENT_VISIBLE_LIMIT);

  const emptyMessage =
    filter === "missing"
      ? "미제출 과제가 없어요"
      : "완료한 과제가 없어요";

  return (
    <SurfaceCard style={styles.assignmentPanel}>
      <View style={styles.assignmentHeader}>
        <View>
          <Text style={styles.assignmentEyebrow}>과제 목록</Text>
          <Text style={styles.assignmentTitle}>해야 할 과제</Text>
        </View>
        <View style={styles.assignmentFilter}>
          <FilterChip
            active={filter === "missing"}
            onPress={() => setFilter("missing")}
            tone="danger"
          >
            미제출 {missingCount}
          </FilterChip>
          <FilterChip
            active={filter === "completed"}
            onPress={() => setFilter("completed")}
            tone="neutral"
          >
            완료 {completedCount}
          </FilterChip>
        </View>
      </View>

      <View style={styles.assignmentList}>
        {filtered.length === 0 ? (
          <Text style={styles.assignmentEmpty}>{emptyMessage}</Text>
        ) : (
          visibleItems.map((item, index) => {
            const target = assignmentTarget(item);
            return (
              <AssignmentRow
                key={item.id}
                item={item}
                isLast={index === visibleItems.length - 1}
                onPress={target ? () => router.push(target as Href) : undefined}
              />
            );
          })
        )}
      </View>
    </SurfaceCard>
  );
}

function FilterChip({
  active,
  tone,
  onPress,
  children,
}: {
  active: boolean;
  tone: "danger" | "neutral";
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <ControlPressable
      onPress={onPress}
      style={[
        styles.filterChip,
        active && styles.filterChipActive,
        tone === "danger" && active && styles.filterChipDangerActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
          tone === "danger" && active && styles.filterChipTextDangerActive,
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </ControlPressable>
  );
}

function AssignmentRow({
  item,
  isLast,
  onPress,
}: {
  item: StudentAssignmentTodo;
  isLast: boolean;
  onPress?: () => void;
}) {
  const submitted = item.submitted;
  const reminded = isAssignmentReminderVisible(item);

  const dateText = submitted
    ? item.submittedAt
      ? `제출 ${formatAssignmentDate(item.submittedAt)}`
      : "제출 완료"
    : reminded
      ? `알림 ${formatAssignmentDate(item.reminderSentAt)}`
      : item.assignedAt
        ? `배부 ${formatAssignmentDate(item.assignedAt)}`
        : "과제 배부됨";

  const content = (
    <View style={styles.assignmentRowInner}>
      <View style={styles.assignmentMain}>
        <Text style={styles.assignmentTitleText} numberOfLines={1}>
          {item.sectionTitle}
        </Text>
        <Text style={styles.assignmentSubtitleText} numberOfLines={1}>
          {item.boardTitle}
        </Text>
      </View>
      <View style={styles.assignmentMeta}>
        <Text
          style={[
            styles.assignmentStatus,
            submitted
              ? styles.assignmentStatusSubmitted
              : styles.assignmentStatusMissing,
          ]}
          numberOfLines={1}
        >
          {submitted ? "제출 완료" : "미제출"}
        </Text>
        <Text style={styles.assignmentDate} numberOfLines={1}>
          {dateText}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <ControlPressable
        style={[styles.assignmentRow, isLast && styles.assignmentRowLast]}
        onPress={onPress}
      >
        {content}
      </ControlPressable>
    );
  }

  return (
    <View
      style={[
        styles.assignmentRow,
        styles.assignmentRowStatic,
        isLast && styles.assignmentRowLast,
      ]}
    >
      {content}
    </View>
  );
}

function WalletCardCompact({
  wallet,
  loading,
  onDetail,
}: {
  wallet: WalletSummary | null;
  loading: boolean;
  onDetail: () => void;
}) {
  return (
    <SurfaceCard style={styles.walletCardCompact}>
      <View style={styles.walletHeaderCompact}>
        <View>
          <Text style={styles.walletEyebrowCompact}>개인 금융</Text>
          <Text style={styles.walletTitleCompact}>내 통장과 적금</Text>
        </View>
        <AppButton
          variant="secondary"
          onPress={onDetail}
          hitSlop={8}
          textStyle={styles.walletDetailBtnText}
        >
          자세히
        </AppButton>
      </View>

      {loading || !wallet ? (
        <Text style={styles.walletEmptyCompact}>
          통장 정보를 불러오는 중이에요.
        </Text>
      ) : (
        <>
          <View style={styles.walletBalanceRowCompact}>
            <Text style={styles.walletBalanceLabelCompact}>현재 잔고</Text>
            <Text style={styles.walletBalanceValueCompact}>
              {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
            </Text>
          </View>
          {wallet.activeFDs.length > 0 && (
            <Pill tone="accent" textStyle={styles.walletFdPillText}>
              적금 {wallet.activeFDs.length}개
            </Pill>
          )}
        </>
      )}
    </SurfaceCard>
  );
}

function DutySectionCompact({
  duties,
  onOpen,
}: {
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const visible = duties
    .map((duty) => ({ duty, target: studentDutyTarget(duty) }))
    .filter((item): item is { duty: StudentDuty; target: NonNullable<ReturnType<typeof studentDutyTarget>> } =>
      item.target !== null,
    );
  if (visible.length === 0) return null;

  return (
    <View style={styles.dutyStrip}>
      {visible.map(({ duty, target }) => (
        <SurfacePressable
          key={`${duty.classroomId}-${duty.roleKey}`}
          style={styles.dutyChip}
          onPress={() => onOpen(target.href as Href)}
        >
          <Text style={styles.dutyChipEmoji}>
            {duty.emoji ?? roleEmoji(duty.roleKey)}
          </Text>
          <Text style={styles.dutyChipRole}>{duty.roleLabel}</Text>
          <Text style={styles.dutyChipCta}>시작</Text>
        </SurfacePressable>
      ))}
    </View>
  );
}

function BoardCard({ board }: { board: BoardMeta }) {
  const router = useRouter();
  return (
    <SurfacePressable
      style={styles.boardCard}
      onPress={() =>
        router.push(`/(student)/board/${board.slug}?layout=${board.layout}`)
      }
    >
      <View style={styles.boardThumb}>
        <Image
          source={{ uri: boardThumbUri(board) }}
          style={styles.boardThumbImage}
          resizeMode="cover"
        />
      </View>
      <View style={styles.boardCardBody}>
        <Text style={styles.boardCardTitle} numberOfLines={2}>
          {board.title}
        </Text>
        <Text style={styles.boardCardMeta}>{boardStatusLabel(board)}</Text>
      </View>
    </SurfacePressable>
  );
}

function boardStatusLabel(board: BoardMeta): string {
  if (board.breakout) {
    return board.breakout.selectedSectionId ? "모둠 참여 중" : "모둠 선택 필요";
  }
  if (board.layout === "quiz") {
    const status = board.quizzes?.[0]?.status;
    return status === "active" || status === "running" ? "진행 중" : "시작 대기";
  }
  if (board.layout === "kordle") {
    return board.kordleStatus === "LIVE" ? "진행 중" : "시작 대기";
  }
  if (board.layout === "speed-game") {
    return board.speedGameStatus === "running"
      ? "진행 중"
      : board.speedGameStatus === "finished"
        ? "종료"
        : "시작 대기";
  }
  if (board.layout === "shadow-alliance") {
    return board.shadowAllianceStatus === "active"
      ? "진행 중"
      : board.shadowAllianceStatus === "ended"
        ? "종료"
        : "시작 대기";
  }
  return layoutLabel(board.layout);
}

function boardThumbUri(board: BoardMeta): string {
  const thumb =
    board.thumbnailMode === "custom" && board.thumbnailUrl
      ? board.thumbnailUrl
      : (layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL);
  return thumb.startsWith("http") ? thumb : getApiUrl(thumb);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textMuted },

  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  greetingCluster: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  greeting: { ...typography.display, color: colors.text },
  showcaseBand: {
    marginHorizontal: -spacing.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.showcaseBand,
    gap: spacing.md,
  },
  showcaseHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  showcaseTitle: {
    ...typography.section,
    color: colors.text,
  },
  showcaseTitleIcon: { fontSize: iconSizes.md },
  showcaseMore: {
    ...typography.label,
    color: colors.accent,
  },
  showcaseRowContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xs,
  },
  showcaseChip: {
    width: dashboard.showcaseCardWidth,
    minHeight: dashboard.showcaseCardMinHeight,
    overflow: "hidden",
    position: "relative",
  },
  showcaseChipSkeleton: {
    width: dashboard.showcaseCardWidth,
    height: dashboard.showcaseSkeletonHeight,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  showcaseChipBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: dashboard.badgeSize,
    height: dashboard.badgeSize,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseChipBadgeText: { ...typography.badge },
  showcasePreview: {
    height: dashboard.showcasePreviewHeight,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  showcasePreviewImage: {
    width: "100%",
    height: "100%",
  },
  showcasePlay: {
    position: "absolute",
    width: dashboard.playSize,
    height: dashboard.playSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  showcasePlayText: {
    color: colors.text,
    fontSize: iconSizes.md,
    marginLeft: spacing.xs,
  },
  showcaseChipBody: { gap: spacing.xs, padding: spacing.lg },
  showcaseChipTitle: { ...typography.section, color: colors.text },
  showcaseChipContent: {
    ...typography.body,
    color: colors.textMuted,
  },
  showcaseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  showcaseAuthor: {
    maxWidth: dashboard.authorMaxWidth,
  },
  showcaseAuthorText: {
    ...typography.badge,
    color: colors.accent,
  },
  showcaseDate: { ...typography.micro, color: colors.textMuted },

  portfolioCtaCompact: {
    paddingVertical: spacing.md,
  },
  walletCardCompact: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  walletHeaderCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  walletEyebrowCompact: {
    ...typography.badge,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  walletTitleCompact: { ...typography.subtitle, color: colors.text },
  walletDetailBtnText: { ...typography.label },
  walletBalanceRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  walletBalanceLabelCompact: {
    ...typography.body,
    color: colors.textMuted,
  },
  walletBalanceValueCompact: {
    ...typography.title,
    color: colors.text,
  },
  walletFdPillText: {
    ...typography.badge,
    color: colors.accent,
  },
  walletEmptyCompact: {
    ...typography.body,
    color: colors.textMuted,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radii.btn,
  },

  dutyStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dutyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.pill,
  },
  dutyChipEmoji: { fontSize: iconSizes.md },
  dutyChipRole: { ...typography.label, color: colors.accentTintedText },
  dutyChipCta: {
    ...typography.badge,
    color: colors.accentTintedText,
    opacity: dashboard.dutyCtaOpacity,
  },

  sectionSub: {
    ...typography.section,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: -spacing.xs,
  },
  boardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  categoryTabs: { flexDirection: "row", gap: spacing.xs },
  categoryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  categoryTabActive: { backgroundColor: colors.accentTintedBg },
  categoryTabText: { ...typography.label, color: colors.textMuted },
  categoryTabTextActive: { color: colors.accentTintedText },
  boardGrid: { marginTop: spacing.xs },
  gridRow: { flexDirection: "row" },
  gridCell: { flex: 1 },
  boardCard: {
    flex: 1,
    minHeight: dashboard.boardMinHeight,
    padding: 0,
    overflow: "hidden",
  },
  boardThumb: {
    aspectRatio: dashboard.boardThumbAspectRatio,
    backgroundColor: colors.bgAlt,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  boardThumbImage: {
    width: "100%",
    height: "100%",
  },
  boardCardBody: {
    padding: spacing.md,
    gap: spacing.xs,
    flex: 1,
  },
  boardCardTitle: { ...typography.section, color: colors.text },
  boardCardMeta: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: "auto",
  },

  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.empty },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  assignmentPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  assignmentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  assignmentEyebrow: {
    ...typography.badge,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  assignmentTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  assignmentFilter: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.transparent,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderHover,
  },
  filterChipDangerActive: {
    backgroundColor: colors.statusReturnedBg,
    borderColor: colors.borderHover,
  },
  filterChipText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.text,
  },
  filterChipTextDangerActive: {
    color: colors.statusReturnedText,
  },
  assignmentList: {
    overflow: "hidden",
  },
  assignmentEmpty: {
    ...typography.body,
    color: colors.textMuted,
    padding: spacing.lg,
    textAlign: "center",
  },
  assignmentRow: {
    minHeight: dashboard.dutyMinHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: borders.none,
    borderRadius: radii.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.transparent,
  },
  assignmentRowLast: {
    borderBottomWidth: borders.none,
  },
  assignmentRowStatic: {
    backgroundColor: colors.transparent,
  },
  assignmentRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  assignmentMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  assignmentTitleText: {
    ...typography.label,
    color: colors.text,
  },
  assignmentSubtitleText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  assignmentMeta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
  assignmentStatus: {
    ...typography.badge,
  },
  assignmentStatusMissing: {
    color: colors.danger,
  },
  assignmentStatusSubmitted: {
    color: colors.accent,
  },
  assignmentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
});
