import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { CircleAlert } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  boardThemes,
  colors,
  iconSizes,
  normalizeBoardTheme,
  spacing,
  typography,
} from "../../../theme/tokens";
import { BoardHeader } from "../../../components/BoardShell";
import { DailyBanner } from "../../../components/DailyBanner";
import { apiFetch, ApiError } from "../../../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  boardDetailCacheKey,
  invalidateBoardCache,
  readBoardCache,
  removeBoardCache,
  revalidateBoardCache,
} from "../../../lib/board-cache";
import {
  clearSessionToken,
  getUnifiedLoginRoute,
} from "../../../lib/session";
import type { BoardDetailResponse } from "../../../lib/types";
import { CardsBoard } from "../../../components/layouts/CardsBoard";
import { ColumnsBoard } from "../../../components/layouts/ColumnsBoard";
import { VibeArcadeBoard } from "../../../components/layouts/VibeArcadeBoard";
import { QuizBoard } from "../../../components/layouts/QuizBoard";
import { AssignmentBoard } from "../../../components/layouts/AssignmentBoard";
import { PlantRoadmapBoard } from "../../../components/layouts/PlantRoadmapBoard";
import { DJQueueBoard } from "../../../components/layouts/DJQueueBoard";
import { ReadOnlyCardsBoard } from "../../../components/layouts/ReadOnlyCardsBoard";
import { QuestionBoard } from "../../../components/layouts/QuestionBoard";
import { AssessmentBoard } from "../../../components/layouts/AssessmentBoard";
import { KordleBoard } from "../../../components/layouts/KordleBoard";
import { VibeGalleryBoard } from "../../../components/layouts/VibeGalleryBoard";
import { SpeedGameBoard } from "../../../components/layouts/SpeedGameBoard";
import { EventSignupBoard } from "../../../components/layouts/EventSignupBoard";
import { BreakoutBoard } from "../../../components/layouts/BreakoutBoard";
import { ShadowAllianceBoard } from "../../../components/layouts/ShadowAllianceBoard";
import { OmokBoard } from "../../../components/layouts/OmokBoard";
import { SongGuessBoard } from "../../../components/layouts/SongGuessBoard";
import { AppButton } from "../../../components/ui";
import { GameAreaShell } from "../../../components/game-platform/GameAreaShell";
import {
  isMobileOfficialGameKind,
  MOBILE_GAME_CATALOG,
} from "../../../lib/game-platform-contract";

// 학생 앱 보드 상세 dispatcher. /api/student/board/:slug 한 번 fetch 후
// board.layout 에 따라 맞는 레이아웃 컴포넌트 렌더.

export default function BoardDetail() {
  const { slug: rawSlug, section: rawSection } = useLocalSearchParams<{
    slug?: string | string[];
    section?: string | string[];
  }>();
  const slug = Array.isArray(rawSlug) ? rawSlug[0] ?? "" : rawSlug ?? "";
  const selectedColumnSectionKey = Array.isArray(rawSection)
    ? rawSection[0] ?? null
    : rawSection ?? null;
  const router = useRouter();
  const cacheKey = boardDetailCacheKey(slug);
  const initialCache = readBoardCache<BoardDetailResponse>(cacheKey, {
    kind: "detail",
  });
  const [data, setData] = useState<BoardDetailResponse | null>(
    () => initialCache?.data ?? null,
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionTitle, setActiveSectionTitle] = useState<string | null>(
    null,
  );
  const sequenceRef = useRef(0);
  const retryInFlightRef = useRef(false);
  const previousCacheKeyRef = useRef(cacheKey);

  useEffect(() => {
    if (previousCacheKeyRef.current === cacheKey) return;
    previousCacheKeyRef.current = cacheKey;
    sequenceRef.current += 1;
    const cached = readBoardCache<BoardDetailResponse>(cacheKey, {
      kind: "detail",
    });
    setData(cached?.data ?? null);
    setLoading(!cached);
    setError(null);
    setActiveSectionTitle(null);
  }, [cacheKey]);

  const load = useCallback(
    async (force = false) => {
      const sequence = ++sequenceRef.current;
      const cached = readBoardCache<BoardDetailResponse>(cacheKey, {
        kind: "detail",
      });
      if (cached) {
        setData(cached.data);
        setLoading(false);
      } else if (!force) {
        setLoading(true);
      }

      if (!slug) {
        setError("보드 링크가 올바르지 않아요.");
        setLoading(false);
        return;
      }

      try {
        const nextData = await revalidateBoardCache<BoardDetailResponse>(
          cacheKey,
          () =>
            apiFetch<BoardDetailResponse>(
              `/api/student/board/${encodeURIComponent(slug)}`,
            ),
          { force, kind: "detail" },
        );
        if (sequence !== sequenceRef.current) return;
        setData(nextData);
        setError(null);
        // A detail mutation/realtime refresh can change the card count and
        // status shown in the hub list. Mark that summary stale; the next hub
        // focus will perform one deduped revalidation.
        if (force) {
          invalidateBoardCache(BOARD_LIST_CACHE_KEY);
          invalidateBoardCache(STUDENT_HOME_CACHE_KEY);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        if (sequence !== sequenceRef.current) return;
        if (e instanceof ApiError && e.status === 404) {
          // A stale detail snapshot must not remain visible after the server
          // revokes access or the board is disconnected from the classroom.
          removeBoardCache(cacheKey);
          setData(null);
          setError("이 보드에 접근할 수 없어요.");
        } else if (!cached) {
          setError(e instanceof Error ? e.message : "불러올 수 없어요");
        }
      } finally {
        if (sequence === sequenceRef.current) setLoading(false);
      }
    },
    [cacheKey, router, slug],
  );

  const handleRetry = useCallback(async () => {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    setRetrying(true);
    try {
      await load(true);
    } finally {
      retryInFlightRef.current = false;
      setRetrying(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        // Invalidate a response that belongs to a previous slug/focus. The
        // cache itself remains useful for the next visit.
        sequenceRef.current += 1;
      };
    }, [load]),
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (selectedColumnSectionKey === null) return false;
        router.setParams({ section: undefined });
        return true;
      },
    );
    return () => subscription.remove();
  }, [router, selectedColumnSectionKey]);

  const handleBoardBack = useCallback(() => {
    if (selectedColumnSectionKey !== null) {
      router.setParams({ section: undefined });
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(student)/boards?filter=play" as Href);
    }
  }, [router, selectedColumnSectionKey]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드 열기…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <CircleAlert
            size={iconSizes.xl}
            color={colors.danger}
            strokeWidth={2}
            accessibilityLabel="오류"
          />
          <Text style={styles.errorTitle}>{error ?? "알 수 없는 오류"}</Text>
          <AppButton
            loading={retrying}
            disabled={retrying}
            onPress={() => void handleRetry()}
          >
            다시 시도
          </AppButton>
          <AppButton
            variant="secondary"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(student)/boards");
              }
            }}
          >
            돌아가기
          </AppButton>
        </View>
      </SafeAreaView>
    );
  }

  const { board } = data;
  const boardTheme = boardThemes[normalizeBoardTheme(board.boardTheme)];
  if (isMobileOfficialGameKind(board.layout)) {
    return (
      <GameAreaShell
        title={board.title}
        rulesLabel={MOBILE_GAME_CATALOG[board.layout].displayName}
        connection="online"
        onExit={handleBoardBack}
        exitLabel="게임 목록"
        scrollEnabled={false}
      >
        {renderOfficialGameLayout(data)}
      </GameAreaShell>
    );
  }

  const usesCardStream =
    board.layout === "freeform" ||
    board.layout === "grid" ||
    board.layout === "stream";
  const boardBackground = usesCardStream ? colors.bg : boardTheme.background;
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: boardBackground }]}
      edges={["top"]}
    >
      <BoardHeader
        title={activeSectionTitle ?? board.title}
        layout={board.layout}
        onBack={handleBoardBack}
      />
      <DailyBanner role="student" />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {renderLayout(
          data,
          () => load(true),
          setActiveSectionTitle,
          selectedColumnSectionKey,
          (key) => router.setParams({ section: key ?? undefined }),
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function renderOfficialGameLayout(data: BoardDetailResponse) {
  switch (data.board.layout) {
    case "kordle":
      return <KordleBoard data={data} />;
    case "speed-game":
      return <SpeedGameBoard data={data} />;
    case "shadow-alliance":
      return <ShadowAllianceBoard data={data} />;
    case "omok":
      return <OmokBoard data={data} />;
    case "song-guess":
      return <SongGuessBoard data={data} />;
    default:
      return null;
  }
}

function renderLayout(
  data: BoardDetailResponse,
  reload: () => void,
  onSectionTitleChange: (title: string | null) => void,
  selectedColumnSectionKey: string | null,
  onSelectedColumnSectionKeyChange: (key: string | null) => void,
) {
  switch (data.board.layout) {
    case "columns":
      return (
        <ColumnsBoard
          data={data}
          onMutate={reload}
          onSectionTitleChange={onSectionTitleChange}
          selectedSectionKey={selectedColumnSectionKey}
          onSelectedSectionKeyChange={onSelectedColumnSectionKeyChange}
        />
      );
    case "vibe-arcade":
      return <VibeArcadeBoard data={data} />;
    case "quiz":
      return <QuizBoard data={data} onMutate={reload} />;
    case "assignment":
      return <AssignmentBoard data={data} onMutate={reload} />;
    case "plant-roadmap":
      return <PlantRoadmapBoard data={data} onMutate={reload} />;
    case "dj-queue":
      return <DJQueueBoard data={data} onMutate={reload} />;
    case "question-board":
      return <QuestionBoard data={data} />;
    case "assessment":
      return <AssessmentBoard data={data} />;
    case "kordle":
      return <KordleBoard data={data} />;
    case "vibe-gallery":
      return <VibeGalleryBoard data={data} />;
    case "speed-game":
      return <SpeedGameBoard data={data} />;
    case "event-signup":
      return <EventSignupBoard data={data} />;
    case "breakout":
      return <BreakoutBoard data={data} onMutate={reload} />;
    case "shadow-alliance":
      return <ShadowAllianceBoard data={data} />;
    case "omok":
      return <OmokBoard data={data} />;
    case "song-guess":
      return <SongGuessBoard data={data} />;
    case "freeform":
    case "grid":
    case "stream":
      return <CardsBoard data={data} onMutate={reload} />;
    // 카드 기반 read-heavy 레이아웃들 — 작성은 제한하고 읽기 + 본인 카드 추가만.
    default:
      return <ReadOnlyCardsBoard data={data} />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorTitle: { ...typography.title, color: colors.text, textAlign: "center" },
});
