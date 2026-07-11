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
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  ControlPressable,
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
              <View style={styles.formIntro}>
                <Text style={styles.eyebrow}>오늘의 독서</Text>
                <Text style={styles.title}>읽은 책의 감상을 기록해 보세요.</Text>
                <Text style={styles.description}>
                  책을 고르고, 기억에 남는 장면을 짧게 남겨 보세요.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>책 종류</Text>
                <View style={styles.typeRow}>
                  <ControlPressable
                    style={[styles.typeOption, bookType === "story" && styles.typeOptionActive]}
                    onPress={() => setBookType("story")}
                    accessibilityLabel="이야기책"
                    accessibilityState={{ selected: bookType === "story" }}
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        bookType === "story" && styles.typeOptionTextActive,
                      ]}
                    >
                      이야기책
                    </Text>
                  </ControlPressable>
                  <ControlPressable
                    style={[styles.typeOption, bookType === "comic" && styles.typeOptionActive]}
                    onPress={() => setBookType("comic")}
                    accessibilityLabel="만화책"
                    accessibilityState={{ selected: bookType === "comic" }}
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        bookType === "comic" && styles.typeOptionTextActive,
                      ]}
                    >
                      만화책
                    </Text>
                  </ControlPressable>
                </View>
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
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>내 독서 기록</Text>
              {!loading && entries.length > 0 ? (
                <Text style={styles.entryCount}>{entries.length}개</Text>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>독서 기록을 불러오는 중이에요.</Text>
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>아직 기록이 없어요.</Text>
                <Text style={styles.emptyDescription}>
                  오늘 읽은 책을 첫 번째 기록으로 남겨 보세요.
                </Text>
              </View>
            ) : (
              entries.map((entry) => (
                <SurfaceCard key={entry.id} style={styles.entry}>
                  <View style={styles.entryTopline}>
                    <Pill tone="accent">
                      {entry.bookType === "comic" ? "만화책" : "이야기책"}
                    </Pill>
                    <Text style={styles.entryDate}>
                      {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                    </Text>
                  </View>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  <Text style={styles.meta}>{entry.author}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.body}>{entry.reflection}</Text>
                  {entry.aiFeedback ? (
                    <View style={styles.feedbackBox}>
                      <Text style={styles.feedbackScore}>{entry.aiScore ?? 0}점</Text>
                      <Text style={styles.feedback}>{entry.aiFeedback}</Text>
                    </View>
                  ) : null}
                </SurfaceCard>
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
  eyebrow: { ...typography.label, color: colors.accent },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeOption: {
    flex: 1,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  typeOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  typeOptionText: { ...typography.label, color: colors.textMuted },
  typeOptionTextActive: { color: colors.accentTintedText },
  reflectionInput: { minHeight: composer.contentMinHeight, textAlignVertical: "top" },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.statusReviewedText },
  statusStack: { gap: spacing.xs },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  entryCount: { ...typography.micro, color: colors.textMuted },
  loadingState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted },
  emptyState: {
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  emptyTitle: { ...typography.section, color: colors.text },
  emptyDescription: { ...typography.body, color: colors.textMuted },
  entry: { gap: spacing.sm, padding: spacing.lg },
  entryTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  entryDate: { ...typography.micro, color: colors.textMuted },
  entryTitle: { ...typography.section, color: colors.text },
  meta: { ...typography.micro, color: colors.textMuted },
  divider: { borderTopWidth: borders.hairline, borderTopColor: colors.border },
  body: { ...typography.body, color: colors.text },
  feedbackBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.accentTintedBg,
  },
  feedbackScore: { ...typography.label, color: colors.accentTintedText },
  feedback: { ...typography.body, color: colors.accentTintedText, flex: 1 },
});
