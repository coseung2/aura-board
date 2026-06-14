import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../../theme/tokens";
import { layoutEmoji, layoutLabel } from "../../../theme/layout-meta";
import type { ChildBoardSummary } from "../../../lib/types";

// 학부모 — 자녀 상세. 자녀의 보드 목록 표시.
// TODO: /api/parent/child/:id/boards 연동. 현재는 mock 데이터.

const MOCK_BOARDS: ChildBoardSummary[] = [
  {
    id: "board_001",
    slug: "math-quiz-1",
    title: "수학 퀴즈 1단원",
    layout: "quiz",
    cardCount: 12,
    lastActivity: "오늘",
  },
  {
    id: "board_002",
    slug: "science-observation",
    title: "과학 관찰 일지",
    layout: "plant-roadmap",
    cardCount: 8,
    lastActivity: "어제",
  },
  {
    id: "board_003",
    slug: "creative-writing",
    title: "글쓰기 교실",
    layout: "columns",
    cardCount: 15,
    lastActivity: "3일 전",
  },
  {
    id: "board_004",
    slug: "coding-project",
    title: "코딩 프로젝트",
    layout: "vibe-arcade",
    cardCount: 6,
    lastActivity: "일주일 전",
  },
];

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [childName, setChildName] = useState("자녀");
  const [boards] = useState<ChildBoardSummary[]>(MOCK_BOARDS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: /api/parent/child/:id 호출해서 childName 세팅.
    // mock: id에서 이름 유추
    setChildName(id === "student_001" ? "김민준" : "김서연");
    setLoading(false);
  }, [id]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={handleBack}
        >
          <Text style={styles.backText}>← 돌아가기</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.childEmoji}>👦</Text>
          <View>
            <Text style={styles.childName}>{childName}</Text>
            <Text style={styles.childSub}>참여 보드 {boards.length}개</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={boards}
        keyExtractor={(b) => b.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.boardCard,
              pressed && styles.boardCardPressed,
            ]}
            onPress={() => {
              // TODO: 학부모 보드 뷰어 라우트 연결.
              // 지금은 학생 보드로 이동 (추후 분리).
            }}
          >
            <View style={styles.boardEmojiWrap}>
              <Text style={styles.boardEmoji}>
                {layoutEmoji(item.layout)}
              </Text>
            </View>
            <Text style={styles.boardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.boardLayout}>
              {layoutLabel(item.layout)}
            </Text>
            <Text style={styles.boardMeta}>
              카드 {item.cardCount}개
              {item.lastActivity ? ` · ${item.lastActivity}` : ""}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>참여한 보드가 없어요</Text>
          </View>
        }
      />
    </SafeAreaView>
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
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtnPressed: { backgroundColor: colors.surfaceAlt },
  backText: { ...typography.label, color: colors.textMuted },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  childEmoji: { fontSize: 40 },
  childName: { ...typography.display, color: colors.text },
  childSub: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  gridContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  gridRow: { gap: spacing.lg },
  boardCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  boardCardPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.98 }],
  },
  boardEmojiWrap: { marginBottom: spacing.md },
  boardEmoji: { fontSize: 48 },
  boardTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  boardLayout: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.xs,
  },
  boardMeta: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...typography.title, color: colors.text },
});
