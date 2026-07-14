import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, LogOut } from "lucide-react-native";
import {
  borders,
  colors,
  dashboard,
  iconSizes,
  media,
  pageChrome,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  readBoardCache,
  revalidateBoardCache,
  writeBoardCache,
} from "../../lib/board-cache";
import { roleEmoji, studentDutyTarget } from "../../lib/student-navigation";
import { isAssignmentReminderVisible } from "../../lib/student-notifications";
import type {
  MeResponse,
  StudentAssignmentTodo,
  StudentDuty,
  WalletSummary,
} from "../../lib/types";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  Pill,
  SectionHeader,
  SemanticNav,
  SemanticNavItem,
} from "../../components/ui";
import { StudentNotificationButton } from "../../components/StudentNotificationButton";

// 학생 대시보드. 웹과 같은 /api/student/me 계약을 사용한다.

export default function StudentHome() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const initialHomeCache = readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, {
    kind: "boards",
  });
  const [me, setMe] = useState<MeResponse | null>(
    () => initialHomeCache?.data ?? null,
  );
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initialHomeCache);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);

  const isLandscapeLayout = width > height && width >= dashboard.columns.one;

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
      const cached = readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, {
        kind: "boards",
      });
      if (cached) {
        setMe(cached.data);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        if (isRefresh) setRefreshing(true);
        const res = await revalidateBoardCache<MeResponse>(
          STUDENT_HOME_CACHE_KEY,
          async () => {
            const response = await apiFetch<MeResponse>("/api/student/me");
            writeBoardCache(BOARD_LIST_CACHE_KEY, response.boards, {
              kind: "boards",
            });
            return response;
          },
          { force: isRefresh, kind: "boards" },
        );
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

  const handleLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      await apiFetch("/api/student/logout", { method: "POST" }).catch(
        () => undefined,
      );
      await clearSessionToken();
      router.replace("/(student)/login");
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="홈" />
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
        <AppHeader title="홈" />
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

  const duties = me?.duties ?? [];
  const assignments = me?.assignments ?? [];
  const studentName = me?.student.name ?? "학생";
  const overviewLandscape = isLandscapeLayout && assignments.length > 0;
  const walletCard = (
    <WalletCardCompact
      wallet={wallet}
      loading={walletLoading}
      onDetail={() => router.push("/(student)/wallet" as Href)}
      duties={duties}
      onOpen={(path) => router.push(path as Href)}
    />
  );
  const assignmentPanel = <AssignmentPanel assignments={assignments} />;
  const headerActions = (
    <View style={styles.accountActions}>
      <StudentNotificationButton />
      <ControlPressable
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loggingOut}
        accessibilityLabel={loggingOut ? "로그아웃 중" : "로그아웃"}
        accessibilityState={{ disabled: loggingOut }}
      >
        <LogOut
          size={iconSizes.md}
          color={colors.textMuted}
          strokeWidth={2}
          accessible={false}
        />
      </ControlPressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="홈"
        titleAccessory={
          <Text style={styles.headerStudentName} numberOfLines={1}>
            {studentName}
          </Text>
        }
        right={headerActions}
      />
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
        <View
          style={
            overviewLandscape ? styles.landscapeOverview : styles.overviewStack
          }
        >
          <View
            style={[
              styles.overviewItem,
              overviewLandscape && styles.landscapeOverviewItem,
            ]}
          >
            {walletCard}
          </View>
          {assignments.length > 0 ? (
            <View
              style={[
                styles.overviewItem,
                overviewLandscape && styles.landscapeOverviewItem,
              ]}
            >
              {assignmentPanel}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  const [showAll, setShowAll] = useState(false);

  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = showAll
    ? filtered
    : filtered.slice(0, ASSIGNMENT_VISIBLE_LIMIT);
  const hiddenCount = Math.max(filtered.length - visibleItems.length, 0);

  const emptyMessage =
    filter === "missing" ? "미제출 과제가 없어요" : "완료한 과제가 없어요";

  return (
    <View style={styles.assignmentPanel}>
      <SectionHeader
        title="과제 목록"
        right={
          <SemanticNav
            style={styles.sectionSemanticNav}
            accessibilityLabel="과제 필터"
          >
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
          </SemanticNav>
        }
      />

      <View style={styles.assignmentList}>
        <View style={styles.assignmentRows}>
          {filtered.length === 0 ? (
            <Text style={styles.assignmentEmpty}>{emptyMessage}</Text>
          ) : (
            visibleItems.map((item) => {
              const target = assignmentTarget(item);
              return (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  onPress={
                    target ? () => router.push(target as Href) : undefined
                  }
                />
              );
            })
          )}
        </View>
        {filtered.length > ASSIGNMENT_VISIBLE_LIMIT ? (
          <ControlPressable
            style={styles.assignmentExpand}
            onPress={() => setShowAll((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
          >
            <Text style={styles.assignmentExpandText}>
              {showAll
                ? "접기 ↑"
                : `${filter === "missing" ? "미제출" : "완료"} 과제 ${hiddenCount}개 더 보기 ↓`}
            </Text>
          </ControlPressable>
        ) : null}
      </View>
    </View>
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
    <SemanticNavItem selected={active} tone={tone} onPress={onPress}>
      {children}
    </SemanticNavItem>
  );
}

function AssignmentRow({
  item,
  onPress,
}: {
  item: StudentAssignmentTodo;
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
      <ControlPressable style={styles.assignmentRow} onPress={onPress}>
        {content}
      </ControlPressable>
    );
  }

  return (
    <View style={[styles.assignmentRow, styles.assignmentRowStatic]}>
      {content}
    </View>
  );
}

function WalletCardCompact({
  wallet,
  loading,
  onDetail,
  duties,
  onOpen,
}: {
  wallet: WalletSummary | null;
  loading: boolean;
  onDetail: () => void;
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const [panel, setPanel] = useState<"wallet" | "duties">("wallet");
  const hasDuties = duties.some((duty) => studentDutyTarget(duty) !== null);
  const showDuties = hasDuties && panel === "duties";

  return (
    <View style={styles.walletCardCompact}>
      <SectionHeader
        title={showDuties ? "내 역할" : "은행"}
        titleAccessory={
          !showDuties ? (
            <ControlPressable
              style={styles.walletDetailLink}
              onPress={onDetail}
              hitSlop={8}
              accessibilityLabel="통장 자세히 보기"
            >
              <Text style={styles.walletDetailLinkText} numberOfLines={1}>
                자세히
              </Text>
              <ChevronRight
                size={iconSizes.sm}
                color={colors.textMuted}
                strokeWidth={2}
                accessible={false}
              />
            </ControlPressable>
          ) : undefined
        }
        right={
          hasDuties ? (
            <SemanticNav
              style={styles.sectionSemanticNav}
              accessibilityLabel="은행 보기"
            >
              <SemanticNavItem
                selected={!showDuties}
                onPress={() => setPanel("wallet")}
              >
                통장
              </SemanticNavItem>
              <SemanticNavItem
                selected={showDuties}
                onPress={() => setPanel("duties")}
              >
                내 역할
              </SemanticNavItem>
            </SemanticNav>
          ) : undefined
        }
      />

      {showDuties ? (
        <DutySectionCompact duties={duties} onOpen={onOpen} />
      ) : loading || !wallet ? (
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
    </View>
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
    .filter(
      (
        item,
      ): item is {
        duty: StudentDuty;
        target: NonNullable<ReturnType<typeof studentDutyTarget>>;
      } => item.target !== null,
    );
  if (visible.length === 0) return null;

  return (
    <View style={styles.dutyList}>
      {visible.map(({ duty, target }, index) => (
        <ControlPressable
          key={`${duty.classroomId}-${duty.roleKey}`}
          style={[
            styles.dutyRow,
            index === visible.length - 1 && styles.dutyRowLast,
          ]}
          onPress={() => onOpen(target.href as Href)}
          accessibilityLabel={`${duty.classroomName} ${duty.roleLabel} 시작`}
        >
          <Text style={styles.dutyRowEmoji} accessible={false}>
            {duty.emoji ?? roleEmoji(duty.roleKey)}
          </Text>
          <View style={styles.dutyRowCopy}>
            <Text
              style={styles.dutyRowRole}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.roleLabel}
            </Text>
            <Text
              style={styles.dutyRowClassroom}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.classroomName}
            </Text>
          </View>
          <Text style={styles.dutyRowCta} accessible={false}>
            시작
          </Text>
        </ControlPressable>
      ))}
    </View>
  );
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
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  landscapeOverview: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.lg,
  },
  overviewStack: {
    gap: spacing.none,
  },
  overviewItem: {
    minWidth: 0,
  },
  landscapeOverviewItem: {
    flex: 1,
    minWidth: 0,
  },

  headerStudentName: {
    ...typography.label,
    color: colors.textMuted,
    flexShrink: 1,
    alignSelf: "flex-end",
  },
  accountActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  logoutButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  showcaseBand: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.showcaseBand,
    gap: spacing.sm,
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
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  showcaseChip: {
    width: dashboard.compactCardSize,
    minHeight: dashboard.compactCardSize,
    overflow: "hidden",
    position: "relative",
  },
  showcaseChipSkeleton: {
    width: dashboard.compactCardSize,
    height: dashboard.compactCardSize,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  showcaseChipBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: dashboard.badgeSize,
    height: dashboard.badgeSize,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseChipBadgeText: { ...typography.badge },
  showcasePreview: {
    aspectRatio: media.previewAspectRatio,
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
    width: spacing.xxl,
    height: spacing.xxl,
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
  showcaseChipBody: { gap: spacing.xs, padding: spacing.sm },
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
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sectionSemanticNav: {
    paddingTop: spacing.xs,
  },
  walletTitleCompact: { ...typography.subtitle, color: colors.text },
  walletDetailLink: {
    minHeight: tapMin,
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 1,
  },
  walletDetailLinkText: {
    ...typography.badge,
    color: colors.textMuted,
  },
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
    ...typography.subtitle,
    color: colors.text,
    paddingBottom: spacing.xxs,
  },
  walletFdPillText: {
    ...typography.badge,
    color: colors.accent,
  },
  walletEmptyCompact: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },

  dutyList: {
    overflow: "hidden",
  },
  dutyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.transparent,
  },
  dutyRowLast: {
    borderBottomWidth: borders.none,
  },
  dutyRowEmoji: { fontSize: iconSizes.md },
  dutyRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  dutyRowRole: {
    ...typography.label,
    color: colors.text,
  },
  dutyRowClassroom: {
    ...typography.micro,
    color: colors.textMuted,
  },
  dutyRowCta: {
    ...typography.badge,
    color: colors.accent,
  },

  sectionSub: {
    ...typography.section,
    color: colors.text,
  },
  boardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  boardGrid: { marginTop: spacing.xxs },
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
    paddingVertical: spacing.md,
    gap: spacing.none,
  },
  assignmentTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  assignmentList: {
    paddingBottom: spacing.xs,
  },
  assignmentRows: {
    overflow: "hidden",
  },
  assignmentExpand: {
    minHeight: tapMin,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  assignmentExpandText: {
    ...typography.badge,
    color: colors.accent,
  },
  assignmentEmpty: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  assignmentRow: {
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
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
