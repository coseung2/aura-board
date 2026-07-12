import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  borders,
  colors,
  composer,
  layout,
  spacing,
  typography,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  SemanticNav,
  SemanticNavItem,
  SectionHeader,
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
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
      <AppHeader title="독서" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardWrap}
      >
        <ScrollView
          contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.formColumn, isLandscape && styles.landscapeFormColumn]}>
            <View style={styles.formSection}>
              <SectionHeader title="새 기록" />
              <View style={styles.formIntro}>
                <Text style={styles.description}>오늘 읽은 책의 감상을 기록해 보세요.</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>책 종류</Text>
                <SemanticNav style={styles.typeNav} accessibilityLabel="책 종류">
                  <SemanticNavItem
                    selected={bookType === "story"}
                    onPress={() => setBookType("story")}
                    accessibilityLabel="이야기책"
                  >
                    이야기책
                  </SemanticNavItem>
                  <SemanticNavItem
                    selected={bookType === "comic"}
                    onPress={() => setBookType("comic")}
                    accessibilityLabel="만화책"
                  >
                    만화책
                  </SemanticNavItem>
                </SemanticNav>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>책 제목</Text>
                <TextField
                  value={title}
                  onChangeText={setTitle}
                  placeholder="책 제목을 입력해 주세요"
                  accessibilityLabel="책 제목"
                  returnKeyType="next"
                  maxLength={80}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>지은이</Text>
                <TextField
                  value={author}
                  onChangeText={setAuthor}
                  placeholder="지은이를 입력해 주세요"
                  accessibilityLabel="지은이"
                  returnKeyType="next"
                  maxLength={60}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>독서 감상</Text>
                <TextField
                  style={styles.reflectionInput}
                  value={reflection}
                  onChangeText={setReflection}
                  placeholder="재미있었던 점이나 느낀 점"
                  accessibilityLabel="독서 감상"
                  multiline
                  maxLength={600}
                />
              </View>

              {error || notice ? (
                <View style={styles.statusStack}>
                  {error ? (
                    <Text style={styles.error} accessibilityRole="alert">
                      {error}
                    </Text>
                  ) : null}
                  {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                </View>
              ) : null}

              <AppButton loading={saving} onPress={() => void save()}>
                저장하기
              </AppButton>
            </View>
          </View>

          <View style={[styles.historyColumn, isLandscape && styles.landscapeHistoryColumn]}>
            <SectionHeader
              title="내 독서 기록"
              right={
                !loading && entries.length > 0 ? (
                  <Text style={styles.entryCount}>{entries.length}개</Text>
                ) : undefined
              }
            />

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>독서 기록을 불러오는 중이에요.</Text>
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.emptyState} accessible accessibilityRole="text">
                <Text style={styles.emptyTitle}>아직 기록이 없어요.</Text>
                <Text style={styles.emptyDescription}>
                  오늘 읽은 책을 첫 번째 기록으로 남겨 보세요.
                </Text>
              </View>
            ) : (
              entries.map((entry, index) => (
                <View
                  key={entry.id}
                  style={[styles.entry, index === entries.length - 1 && styles.entryLast]}
                >
                  <View style={styles.entryTopline}>
                    <Text style={styles.entryType}>
                      {entry.bookType === "comic" ? "만화책" : "이야기책"}
                    </Text>
                    <Text style={styles.entryDate}>
                      {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                    </Text>
                  </View>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  <Text style={styles.meta}>{entry.author}</Text>
                  <Text style={styles.body}>{entry.reflection}</Text>
                  {entry.aiFeedback ? (
                    <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackScore}>{entry.aiScore ?? 0}점</Text>
                      <Text style={styles.feedback}>{entry.aiFeedback}</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  keyboardWrap: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.lg,
  },
  contentLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxl,
  },
  formColumn: { minWidth: 0 },
  landscapeFormColumn: {
    flex: 1,
    maxWidth: layout.roleCardNarrowMaxWidth,
  },
  historyColumn: { gap: spacing.md, minWidth: 0 },
  landscapeHistoryColumn: { flex: 2, minWidth: 0 },
  formSection: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  formIntro: { gap: spacing.xs },
  description: { ...typography.body, color: colors.textMuted },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  typeNav: { alignSelf: "flex-start" },
  reflectionInput: { minHeight: composer.contentMinHeight, textAlignVertical: "top" },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.statusReviewedText },
  statusStack: { gap: spacing.xs },
  entryCount: { ...typography.micro, color: colors.textMuted },
  loadingState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted },
  emptyState: {
    paddingVertical: spacing.xl,
    gap: spacing.xs,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  emptyTitle: { ...typography.section, color: colors.text },
  emptyDescription: { ...typography.body, color: colors.textMuted },
  entry: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  entryLast: { borderBottomWidth: borders.none },
  entryTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  entryType: { ...typography.badge, color: colors.accentTintedText },
  entryDate: { ...typography.micro, color: colors.textMuted },
  entryTitle: { ...typography.section, color: colors.text },
  meta: { ...typography.micro, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  feedbackScore: { ...typography.label, color: colors.accentTintedText },
  feedback: { ...typography.body, color: colors.accentTintedText, flex: 1 },
});
