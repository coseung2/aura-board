import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { apiFetch, ApiError } from "../../../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  boardDetailCacheKey,
  invalidateBoardCache,
  readBoardCache,
  revalidateBoardCache,
} from "../../../lib/board-cache";
import { clearSessionToken } from "../../../lib/session";
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
import { DrawingBoard } from "../../../components/layouts/DrawingBoard";
import { ShadowAllianceBoard } from "../../../components/layouts/ShadowAllianceBoard";
import { AppButton } from "../../../components/ui";

// 학생 앱 보드 상세 dispatcher. /api/student/board/:slug 한 번 fetch 후
// board.layout 에 따라 맞는 레이아웃 컴포넌트 렌더.

export default function BoardDetail() {
  const { slug: rawSlug } = useLocalSearchParams<{
    slug?: string | string[];
  }>();
  const slug = Array.isArray(rawSlug) ? rawSlug[0] ?? "" : rawSlug ?? "";
  const router = useRouter();
  const cacheKey = boardDetailCacheKey(slug);
  const initialCache = readBoardCache<BoardDetailResponse>(cacheKey, {
    kind: "detail",
  });
  const [data, setData] = useState<BoardDetailResponse | null>(
    () => initialCache?.data ?? null,
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
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
      } else {
        setLoading(true);
      }

      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        setError(null);
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
          router.replace("/(student)/login");
          return;
        }
        if (sequence !== sequenceRef.current) return;
        if (e instanceof ApiError && e.status === 404) {
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
          <Text style={styles.errorEmoji}>🚫</Text>
          <Text style={styles.errorTitle}>{error ?? "알 수 없는 오류"}</Text>
          <AppButton onPress={() => router.back()}>돌아가기</AppButton>
        </View>
      </SafeAreaView>
    );
  }

  const { board } = data;
  const boardTheme = boardThemes[normalizeBoardTheme(board.boardTheme)];
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: boardTheme.background }]}
      edges={["top"]}
    >
      <BoardHeader title={board.title} layout={board.layout} />
      <View style={styles.body}>{renderLayout(data, () => load(true))}</View>
    </SafeAreaView>
  );
}

function renderLayout(data: BoardDetailResponse, reload: () => void) {
  switch (data.board.layout) {
    case "columns":
      return <ColumnsBoard data={data} onMutate={reload} />;
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
    case "drawing":
      return <DrawingBoard data={data} />;
    case "shadow-alliance":
      return <ShadowAllianceBoard data={data} />;
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
  errorEmoji: { fontSize: iconSizes.empty },
  errorTitle: { ...typography.title, color: colors.text, textAlign: "center" },
});
