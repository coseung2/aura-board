import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { AppButton } from "../../../components/ui";

// 학생 앱 보드 상세 dispatcher. /api/student/board/:slug 한 번 fetch 후
// board.layout 에 따라 맞는 레이아웃 컴포넌트 렌더.

export default function BoardDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [data, setData] = useState<BoardDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<BoardDetailResponse>(
        `/api/student/board/${encodeURIComponent(slug!)}`,
      );
      setData(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return;
      }
      if (e instanceof ApiError && e.status === 404) {
        setError("이 보드에 접근할 수 없어요.");
      } else {
        setError(e instanceof Error ? e.message : "불러올 수 없어요");
      }
    } finally {
      setLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (error || !data) {
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
      <View style={styles.body}>{renderLayout(data, load)}</View>
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
    case "freeform":
    case "grid":
    case "stream":
      return <CardsBoard data={data} onMutate={reload} />;
    // 카드 기반 read-heavy 레이아웃들 — 작성은 제한하고 읽기 + 본인 카드 추가만.
    case "vibe-gallery":
    case "event-signup":
    case "breakout":
    case "assessment":
    case "drawing":
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
