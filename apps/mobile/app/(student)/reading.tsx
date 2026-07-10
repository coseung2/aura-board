import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import { colors, spacing, typography } from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  EmptyState,
  Pill,
  SurfaceCard,
  TextField,
} from "../../components/ui";

type BookType = "comic" | "story";
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

export default function StudentReadingScreen() {
  const router = useRouter();
  const [bookType, setBookType] = useState<BookType>("story");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [reflection, setReflection] = useState("");
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleError = useCallback(async (nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      await clearSessionToken();
      router.replace("/(student)/login");
      return true;
    }
    return false;
  }, [router]);

  const load = useCallback(async () => {
    try {
      const payload = await apiFetch<{ entries: ReadingEntry[] }>("/api/student/reading");
      setEntries(payload.entries);
    } catch (nextError) {
      if (!(await handleError(nextError))) setError("독서 기록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setTitle("");
      setAuthor("");
      setReflection("");
      setNotice("저장했어요.");
    } catch (nextError) {
      if (!(await handleError(nextError))) setError("독서 기록을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="독서" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SurfaceCard style={styles.formCard}>
          <Text style={styles.title}>오늘 읽은 책의 감상을 기록해 보세요.</Text>
          <View style={styles.typeRow}>
            <AppButton variant={bookType === "story" ? "primary" : "secondary"} onPress={() => setBookType("story")}>이야기책</AppButton>
            <AppButton variant={bookType === "comic" ? "primary" : "secondary"} onPress={() => setBookType("comic")}>만화책</AppButton>
          </View>
          <TextField value={title} onChangeText={setTitle} placeholder="책 제목" maxLength={80} />
          <TextField value={author} onChangeText={setAuthor} placeholder="지은이" maxLength={60} />
          <TextField value={reflection} onChangeText={setReflection} placeholder="재미있었던 점이나 느낀 점" multiline maxLength={600} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <AppButton loading={saving} onPress={() => void save()}>저장하기</AppButton>
        </SurfaceCard>
        <Text style={styles.sectionTitle}>내 독서 기록</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : entries.length === 0 ? (
          <EmptyState title="아직 기록이 없어요." />
        ) : entries.map((entry) => (
          <SurfaceCard key={entry.id} style={styles.entry}>
            <View style={styles.entryHead}>
              <Pill tone="accent">{entry.bookType === "comic" ? "만화책" : "이야기책"}</Pill>
              <Text style={styles.entryTitle}>{entry.title}</Text>
            </View>
            <Text style={styles.meta}>{entry.author} · {new Date(entry.createdAt).toLocaleDateString("ko-KR")}</Text>
            <Text style={styles.body}>{entry.reflection}</Text>
            {entry.aiFeedback ? <Text style={styles.feedback}>{entry.aiScore ?? 0}점 · {entry.aiFeedback}</Text> : null}
          </SurfaceCard>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  formCard: { gap: spacing.md, padding: spacing.xl },
  title: { ...typography.subtitle, color: colors.text },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.statusReviewedText },
  sectionTitle: { ...typography.title, color: colors.text },
  entry: { gap: spacing.sm, padding: spacing.lg },
  entryHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  entryTitle: { ...typography.section, color: colors.text, flex: 1 },
  meta: { ...typography.micro, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  feedback: { ...typography.label, color: colors.accentTintedText },
});
