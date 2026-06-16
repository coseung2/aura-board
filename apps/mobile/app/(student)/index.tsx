import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
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
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutLabel } from "../../theme/layout-meta";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type {
  BoardMeta,
  MeResponse,
  PortfolioCardDTO,
  ShowcaseEntryDTO,
  StudentDuty,
  WalletSummary,
} from "../../lib/types";

// 학생 대시보드. /api/student/me 로 본인 + 학급 보드 로딩,
// /api/my/wallet, /api/showcase/classroom/:id 로 위젯 추가.
// 웹 StudentDashboard 시각/구조 1:1 포팅.

const SHOWCASE_LIMIT = 10;

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
  const [loggingOut, setLoggingOut] = useState(false);

  const columnCount = width < 560 ? 1 : width < 920 ? 2 : width < 1280 ? 3 : 4;
  const gridGap = spacing.lg;

  const loadShowcase = useCallback(async (classroomId: string) => {
    setShowcaseLoading(true);
    try {
      const res = await apiFetch<{ entries: ShowcaseEntryDTO[] }>(
        `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${SHOWCASE_LIMIT}`,
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

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await clearSessionToken();
    // Web-side POST /api/student/logout — best-effort. 실패해도 로컬 삭제가 우선.
    apiFetch("/api/student/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/(student)/login");
  }

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>😵</Text>
          <Text style={styles.errorTitle}>연결할 수 없어요</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.retryBtnPressed,
            ]}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const boards = me?.boards ?? [];
  const duties = me?.duties ?? [];
  const classroomId = me?.student.classroom?.id;
  const classroomName = me?.student.classroom?.name ?? "학급 미배정";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
            <View style={styles.classroomBadge}>
              <Text style={styles.classroomBadgeText}>{classroomName}</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && styles.logoutBtnPressed,
            ]}
            onPress={handleLogout}
            disabled={loggingOut}
            hitSlop={8}
          >
            <Text style={styles.logoutText}>
              {loggingOut ? "로그아웃 중…" : "로그아웃"}
            </Text>
          </Pressable>
        </View>

        <ShowcaseBand
          classroomId={classroomId}
          entries={showcaseEntries}
          loading={showcaseLoading}
          onMore={() => router.push("/(student)/showcase" as Href)}
          onCardPress={(entry) =>
            router.push(
              {
                pathname: "/(student)/portfolio",
                params: { studentId: entry.studentId },
              } as unknown as Href,
            )
          }
        />

        <Pressable
          style={({ pressed }) => [
            styles.portfolioCta,
            pressed && styles.portfolioCtaPressed,
          ]}
          onPress={() => router.push("/(student)/portfolio" as Href)}
        >
          <Text style={styles.portfolioCtaText}>
            우리 학급 포트폴리오 보기
          </Text>
        </Pressable>

        <WalletCard
          wallet={wallet}
          loading={walletLoading}
          onDetail={() => router.push("/(student)/wallet" as Href)}
        />

        <DutySection
          duties={duties}
          onOpen={(duty) => {
            const path = roleHref(duty);
            if (path) router.push(path as Href);
          }}
        />

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
                    <View key={board.id} style={{ flex: 1 }}>
                      <BoardCard board={board} />
                    </View>
                  ))}
                  {row.length < columnCount
                    ? Array.from({ length: columnCount - row.length }).map(
                        (_, idx) => (
                          <View
                            key={`placeholder-${idx}`}
                            style={{ flex: 1 }}
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
        <Pressable onPress={onMore} hitSlop={8}>
          <Text style={styles.showcaseMore}>더 보기 →</Text>
        </Pressable>
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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.showcaseChip,
        pressed && styles.showcaseChipPressed,
      ]}
      onPress={onPress}
    >
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
          <Text style={styles.showcaseAuthor} numberOfLines={1}>
            {entry.studentName}
          </Text>
          <Text style={styles.showcaseDate}>{formatShortDate(card.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function WalletCard({
  wallet,
  loading,
  onDetail,
}: {
  wallet: WalletSummary | null;
  loading: boolean;
  onDetail: () => void;
}) {
  return (
    <View style={styles.walletCard}>
      <View style={styles.walletHeader}>
        <View>
          <Text style={styles.walletEyebrow}>개인 금융</Text>
          <Text style={styles.walletTitle}>내 통장과 적금</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.walletDetailBtn,
            pressed && styles.walletDetailBtnPressed,
          ]}
          onPress={onDetail}
          hitSlop={8}
        >
          <Text style={styles.walletDetailText}>자세히 보기</Text>
        </Pressable>
      </View>

      {loading || !wallet ? (
        <Text style={styles.walletEmpty}>
          통장 정보를 불러오는 중이에요.
        </Text>
      ) : (
        <>
          <View style={styles.walletBalanceRow}>
            <Text style={styles.walletBalanceLabel}>현재 잔고</Text>
            <Text style={styles.walletBalanceValue}>
              {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
            </Text>
          </View>
          {wallet.activeFDs.length === 0 ? (
            <Text style={styles.walletEmpty}>
              아직 진행 중인 적금이 없어요.
            </Text>
          ) : (
            <Text style={styles.walletEmpty}>
              진행 중인 적금 {wallet.activeFDs.length}개
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function DutySection({
  duties,
  onOpen,
}: {
  duties: StudentDuty[];
  onOpen: (duty: StudentDuty) => void;
}) {
  const visible = duties.filter((duty) =>
    duty.roleKey === "banker" || duty.roleKey === "store-clerk"
  );
  if (visible.length === 0) return null;

  return (
    <View style={styles.dutySection}>
      <Text style={styles.sectionSub}>내 역할</Text>
      <View style={styles.dutyGrid}>
        {visible.map((duty) => (
          <Pressable
            key={`${duty.classroomId}-${duty.roleKey}`}
            style={({ pressed }) => [
              styles.dutyCard,
              pressed && styles.dutyCardPressed,
            ]}
            onPress={() => onOpen(duty)}
          >
            <Text style={styles.dutyEmoji}>{duty.emoji ?? roleEmoji(duty.roleKey)}</Text>
            <View style={styles.dutyBody}>
              <Text style={styles.dutyRole}>{duty.roleLabel}</Text>
              <Text style={styles.dutyClassroom} numberOfLines={1}>
                {duty.classroomName}
              </Text>
            </View>
            <Text style={styles.dutyCta}>시작</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function roleHref(duty: StudentDuty): string | null {
  const classroomId = encodeURIComponent(duty.classroomId);
  if (duty.roleKey === "banker") {
    return `/(student)/bank?classroomId=${classroomId}`;
  }
  if (duty.roleKey === "store-clerk") {
    return `/(student)/pay?classroomId=${classroomId}`;
  }
  return null;
}

function roleEmoji(roleKey: string): string {
  if (roleKey === "banker") return "🏦";
  if (roleKey === "store-clerk") return "🛒";
  return "•";
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
  return !!(
    card.videoUrl ||
    card.attachments?.some((a) => a.kind === "video")
  );
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function BoardCard({ board }: { board: BoardMeta }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.boardCard,
        pressed && styles.boardCardPressed,
      ]}
      onPress={() =>
        router.push(`/(student)/board/${board.slug}?layout=${board.layout}`)
      }
    >
      <Text style={styles.boardCardTitle} numberOfLines={2}>
        {board.title}
      </Text>
      <Text style={styles.boardCardMeta}>{layoutLabel(board.layout)}</Text>
    </Pressable>
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
  errorEmoji: { fontSize: 72 },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    ...shadows.accent,
  },
  retryBtnPressed: { backgroundColor: colors.accentActive },
  retryText: { ...typography.subtitle, color: "#fff" },

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
  classroomBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  classroomBadgeText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  logoutBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutBtnPressed: { backgroundColor: colors.surfaceAlt },
  logoutText: { ...typography.label, color: colors.textMuted },

  showcaseBand: {
    marginHorizontal: -spacing.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: "#eaf6ff",
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
  showcaseTitleIcon: { fontSize: 18 },
  showcaseMore: {
    ...typography.label,
    color: colors.accent,
  },
  showcaseRowContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xs,
  },
  showcaseChip: {
    width: 310,
    minHeight: 282,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: "hidden",
    ...shadows.card,
    position: "relative",
  },
  showcaseChipPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.98 }],
  },
  showcaseChipSkeleton: {
    width: 310,
    height: 282,
    borderRadius: radii.card,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  showcaseChipBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  showcaseChipBadgeText: { fontSize: 12 },
  showcasePreview: {
    height: 150,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  showcasePreviewImage: {
    width: "100%",
    height: "100%",
  },
  showcasePlay: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  showcasePlayText: {
    color: colors.text,
    fontSize: 18,
    marginLeft: 2,
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
    ...typography.badge,
    color: colors.accent,
    backgroundColor: colors.accentTintedBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    maxWidth: 120,
  },
  showcaseDate: { ...typography.micro, color: colors.textMuted },

  portfolioCta: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    alignItems: "center",
    ...shadows.accent,
  },
  portfolioCtaPressed: { backgroundColor: colors.accentActive },
  portfolioCtaText: { ...typography.subtitle, color: "#fff" },

  walletCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  walletEyebrow: {
    ...typography.badge,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  walletTitle: { ...typography.title, color: colors.text },
  walletDetailBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  walletDetailBtnPressed: { backgroundColor: colors.surfaceAlt },
  walletDetailText: { ...typography.label, color: colors.text },
  walletBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  walletBalanceLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  walletBalanceValue: {
    ...typography.display,
    color: colors.text,
  },
  walletEmpty: {
    ...typography.body,
    color: colors.textMuted,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radii.btn,
  },

  dutySection: {
    gap: spacing.md,
  },
  dutyGrid: {
    gap: spacing.sm,
  },
  dutyCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  dutyCardPressed: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderHover,
  },
  dutyEmoji: { fontSize: 28, width: 36, textAlign: "center" },
  dutyBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  dutyRole: { ...typography.section, color: colors.text },
  dutyClassroom: { ...typography.label, color: colors.textMuted },
  dutyCta: {
    ...typography.label,
    color: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },

  sectionSub: {
    ...typography.section,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: -spacing.xs,
  },
  boardGrid: { marginTop: spacing.xs },
  gridRow: { flexDirection: "row" },
  boardCard: {
    flex: 1,
    minHeight: 88,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boardCardPressed: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderHover,
  },
  boardCardTitle: { ...typography.section, color: colors.text },
  boardCardMeta: { ...typography.label, color: colors.textMuted, marginTop: "auto" },

  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
