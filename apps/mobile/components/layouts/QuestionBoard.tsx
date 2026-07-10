import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  borders,
  assignment,
  colors,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, EmptyState, SurfaceCard, TextField } from "../ui";

type QuestionResponse = {
  id: string;
  text: string;
  createdAt: string;
  studentId: string | null;
  userId: string | null;
  authorName: string;
};

type Snapshot = {
  question: {
    prompt: string | null;
    vizMode: string;
    responses: QuestionResponse[];
  } | null;
};

export function QuestionBoard({ data }: { data: BoardDetailResponse }) {
  const [question, setQuestion] = useState<Snapshot["question"]>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" | "silent" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    if (mode === "initial") setLoading(true);
    try {
      const snapshot = await apiFetch<Snapshot>(
        `/api/boards/${encodeURIComponent(data.board.id)}/snapshot`,
      );
      setQuestion(snapshot.question);
      setError(null);
    } catch {
      setError("질문 보드를 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data.board.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load("silent"), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  async function submit() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/boards/${encodeURIComponent(data.board.id)}/responses`, {
        method: "POST",
        json: { text },
      });
      setDraft("");
      await load("silent");
    } catch {
      setError("응답을 전송하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center} accessibilityLabel="질문 보드 불러오는 중">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>질문을 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={question?.responses ?? []}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <SurfaceCard style={styles.promptCard}>
            <Text style={styles.eyebrow}>오늘의 질문</Text>
            <Text style={styles.prompt} selectable>
              {question?.prompt || "주제가 아직 설정되지 않았어요."}
            </Text>
          </SurfaceCard>
          <SurfaceCard style={styles.composer}>
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder="내 생각을 입력하세요"
              maxLength={500}
              multiline
              accessibilityLabel="질문 응답"
              style={styles.input}
            />
            <AppButton
              onPress={() => void submit()}
              loading={submitting}
              disabled={!draft.trim()}
              accessibilityLabel="응답 보내기"
            >
              응답 보내기
            </AppButton>
          </SurfaceCard>
          {error ? (
            <View style={styles.error} accessibilityRole="alert">
              <Text style={styles.errorText} selectable>{error}</Text>
              <AppButton variant="secondary" onPress={() => void load("refresh")}>
                다시 시도
              </AppButton>
            </View>
          ) : null}
          <Text style={styles.count}>응답 {question?.responses.length ?? 0}개</Text>
        </View>
      }
      renderItem={({ item }) => (
        <SurfaceCard style={styles.responseCard}>
          <Text style={styles.responseText} selectable>{item.text}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.author}>{item.authorName}</Text>
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </SurfaceCard>
      )}
      ListEmptyComponent={
        <EmptyState
          title="아직 응답이 없어요"
          description="첫 번째 생각을 남겨 보세요."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { ...typography.body, color: colors.textMuted },
  header: { gap: spacing.md, marginBottom: spacing.md },
  promptCard: { padding: spacing.xl, gap: spacing.sm },
  eyebrow: { ...typography.badge, color: colors.accent },
  prompt: { ...typography.title, color: colors.text },
  composer: { padding: spacing.md, gap: spacing.md },
  input: { minHeight: assignment.contentInputMinHeight, textAlignVertical: "top" },
  count: { ...typography.section, color: colors.text },
  responseCard: { padding: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  responseText: { ...typography.body, color: colors.text },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  author: { ...typography.badge, color: colors.textMuted, flex: 1 },
  date: { ...typography.micro, color: colors.textFaint },
  error: {
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.danger,
    borderRadius: radii.control,
    gap: spacing.sm,
  },
  errorText: { ...typography.body, color: colors.danger },
});
