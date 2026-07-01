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
import type {
  BoardMeta,
  MeResponse,
  PortfolioCardDTO,
  ShowcaseEntryDTO,
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

// 학생 대시보드. /api/student/me 로 본인 + 학급 보드 로딩,
// /api/my/wallet, /api/showcase/classroom/:id 로 위젯 추가.
// 웹 StudentDashboard 시각/구조 1:1 포팅.

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

export default function StudentHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [showcaseEntries, setShowcaseEntries] = useState<
    ShowcaseEntryDTO[] | null
  >(null);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
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

  const loadShowcase = useCallback(async (classroomId: string) => {
    setShowcaseLoading(true);
    try {
      const res = await apiFetch<{ entries: ShowcaseEntryDTO[] }>(
        `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${dashboard.showcaseLimit}`,
      );
      setShowcaseEntries(res.entries);
    } catch {
      setShowcaseEntries([]);
    } finally {
      setShowcaseLoading(false);
    }
  }, []);

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

        // 위젯 데이터는 학생 정보 확인 후 병렬 로딩.
        const classroomId = res.student.classroom?.id;
        if (classroomId) {
          loadShowcase(classroomId);
        } else {
          setShowcaseEntries([]);
        }
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
    [router, loadShowcase, loadWallet],
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
  const classroomId = me?.student.classroom?.id;
  const classroomName = me?.student.classroom?.name ?? "학급 미배정";

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

        <ShowcaseBand
          classroomId={classroomId}
          entries={showcaseEntries}
          loading={showcaseLoading}
          onMore={() => router.push("/(student)/showcase" as Href)}
          onCardPress={(entry) =>
            router.push({
              pathname: "/(student)/portfolio",
              params: { studentId: entry.studentId },
            } as unknown as Href)
          }
        />

        <AppButton
          variant="secondary"
          style={styles.portfolioCtaCompact}
          onPress={() => router.push("/(student)/portfolio" as Href)}
        >
          🗂️ 우리 학급 포트폴리오 보기
        </AppButton>

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
            <Text style={styles.sectionSub}>오늘의 보드</Text>
            <View style={styles.boardGrid}>
              {chunk(boards, columnCount).map((row, rowIdx) => (
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
  const reminded =
    !submitted &&
    item.reminderSentAt !== null &&
    item.reminderSentAt !== undefined &&
    item.reminderSentAt !== item.assignedAt;

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

function ShowcaseBand({
  classroomId,
  entries,
  loading,
  onMore,
  onCardPress,
}: {
  classroomId: string | undefined;
  entries: ShowcaseEntryDTO[] | null;
  loading: boolean;
  onMore: () => void;
  onCardPress: (entry: ShowcaseEntryDTO) => void;
}) {
  if (!classroomId) return null;

  if (loading || entries === null) {
    return (
      <View style={styles.showcaseBand}>
        <View style={styles.showcaseHead}>
          <Text style={styles.showcaseTitle}>
            <Text style={styles.showcaseTitleIcon}>🌟</Text> 우리 학급 자랑해요
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.showcaseRowContent}
        >
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.showcaseChipSkeleton} />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (entries.length === 0) return null;

  return (
    <View style={styles.showcaseBand}>
      <View style={styles.showcaseHead}>
        <Text style={styles.showcaseTitle}>
          <Text style={styles.showcaseTitleIcon}>🌟</Text> 우리 학급 자랑해요
        </Text>
        <AppButton
          variant="quiet"
          textStyle={styles.showcaseMore}
          onPress={onMore}
          hitSlop={8}
        >
          더 보기 →
        </AppButton>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.showcaseRowContent}
      >
        {entries.map((e) => (
          <ShowcaseChip
            key={`${e.cardId}:${e.studentId}`}
            entry={e}
            onPress={() => onCardPress(e)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ShowcaseChip({
  entry,
  onPress,
}: {
  entry: ShowcaseEntryDTO;
  onPress: () => void;
}) {
  const card = entry.card;
  const previewImage = getCardPreviewImage(card);
  const hasVideo = hasCardVideo(card);
  const authorLabel = card.sourceBoard.anonymousAuthor
    ? "익명"
    : entry.studentName;

  return (
    <SurfacePressable style={styles.showcaseChip} onPress={onPress}>
      <View style={styles.showcaseChipBadge}>
        <Text style={styles.showcaseChipBadgeText}>🌟</Text>
      </View>
      <View style={styles.showcasePreview}>
        {previewImage ? (
          <Image
            source={{ uri: previewImage }}
            style={styles.showcasePreviewImage}
            resizeMode="cover"
          />
        ) : null}
        {hasVideo ? (
          <View style={styles.showcasePlay}>
            <Text style={styles.showcasePlayText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.showcaseChipBody}>
        <Text style={styles.showcaseChipTitle} numberOfLines={2}>
          {card.title || "제목 없음"}
        </Text>
        {card.content ? (
          <Text style={styles.showcaseChipContent} numberOfLines={3}>
            {card.content}
          </Text>
        ) : null}
        <View style={styles.showcaseMetaRow}>
          <Pill
            tone="accent"
            numberOfLines={1}
            style={styles.showcaseAuthor}
            textStyle={styles.showcaseAuthorText}
          >
            {authorLabel}
          </Pill>
          <Text style={styles.showcaseDate}>
            {formatShortDate(card.createdAt)}
          </Text>
        </View>
      </View>
    </SurfacePressable>
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
          onPress={() => onOpen(target.href)}
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

function getCardPreviewImage(card: PortfolioCardDTO): string | null {
  if (card.thumbUrl) return card.thumbUrl;
  if (card.imageUrl) return card.imageUrl;
  if (card.linkImage) return card.linkImage;
  const imageAttachment = card.attachments?.find(
    (a) => a.kind === "image" && (a.previewUrl || a.url),
  );
  return imageAttachment?.previewUrl ?? imageAttachment?.url ?? null;
}

function hasCardVideo(card: PortfolioCardDTO): boolean {
  return !!(card.videoUrl || card.attachments?.some((a) => a.kind === "video"));
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
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
        <Text style={styles.boardCardMeta}>{layoutLabel(board.layout)}</Text>
      </View>
    </SurfacePressable>
  );
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
