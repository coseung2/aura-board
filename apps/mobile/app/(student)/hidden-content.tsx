import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  SectionHeader,
} from "../../components/ui";
import { ApiError } from "../../lib/api";
import {
  loadHiddenContent,
  unhideAuthor,
  unhideContent,
  type HiddenContentSummary,
} from "../../lib/content-safety";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import {
  borders,
  colors,
  layout,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

// "숨긴 항목" — undo screen for the per-student hides created from the report /
// hide sheet (App Store guideline 1.2). Item hides and author hides are grouped
// into one screen so students only learn a single concept.

export default function StudentHiddenContentScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<HiddenContentSummary>({ items: [], authors: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (!(nextError instanceof ApiError) || nextError.status !== 401) return false;
      await clearSessionToken();
      router.replace(getUnifiedLoginRoute("student"));
      return true;
    },
    [router],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        setSummary(await loadHiddenContent());
        setError(null);
      } catch (nextError) {
        if (await handleAuthError(nextError)) return;
        setError("숨긴 항목을 불러오지 못했어요.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleAuthError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function restoreItem(targetKind: "card" | "comment", targetId: string) {
    try {
      await unhideContent({ targetKind, targetId });
      setSummary((current) => ({
        ...current,
        items: current.items.filter(
          (item) => !(item.targetKind === targetKind && item.targetId === targetId),
        ),
      }));
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("다시 보이게 하지 못했어요.");
    }
  }

  async function restoreAuthor(studentId: string) {
    try {
      await unhideAuthor(studentId);
      setSummary((current) => ({
        ...current,
        authors: current.authors.filter((author) => author.studentId !== studentId),
      }));
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      setError("다시 보이게 하지 못했어요.");
    }
  }

  const isEmpty = summary.items.length === 0 && summary.authors.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="숨긴 항목" onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
            />
          }
        >
          {error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
              <AppButton variant="quiet" onPress={() => void load()}>
                다시 시도
              </AppButton>
            </View>
          ) : null}

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>숨김 관리</Text>
            <Text style={styles.bannerText}>
              숨긴 게시글과 댓글은 내 화면에서만 사라져요. 다시 보기를 누르면 피드에 돌아옵니다.
            </Text>
          </View>

          {isEmpty ? (
            <EmptyState
              title="숨긴 항목이 없어요"
              description="게시글이나 댓글을 숨기면 여기에서 다시 볼 수 있어요."
            />
          ) : null}

          {summary.authors.length ? (
            <View style={styles.section}>
              <SectionHeader title="숨긴 친구" />
              {summary.authors.map((author) => (
                <View key={author.studentId} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {author.name}
                  </Text>
                  <ControlPressable
                    style={styles.rowAction}
                    onPress={() => void restoreAuthor(author.studentId)}
                    accessibilityLabel={`${author.name} 다시 보기`}
                  >
                    <Text style={styles.rowActionLabel}>다시 보기</Text>
                  </ControlPressable>
                </View>
              ))}
            </View>
          ) : null}

          {summary.items.length ? (
            <View style={styles.section}>
              <SectionHeader title="숨긴 글과 댓글" />
              {summary.items.map((item) => (
                <View key={`${item.targetKind}:${item.targetId}`} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.targetKind === "comment" ? "댓글" : "게시글"}
                    {item.viaReport ? " · 신고함" : ""}
                  </Text>
                  <ControlPressable
                    style={styles.rowAction}
                    onPress={() => void restoreItem(item.targetKind, item.targetId)}
                    accessibilityLabel={`숨긴 ${
                      item.targetKind === "comment" ? "댓글" : "게시글"
                    } 다시 보기`}
                  >
                    <Text style={styles.rowActionLabel}>다시 보기</Text>
                  </ControlPressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    maxWidth: layout.readableMaxWidth,
    width: "100%",
    alignSelf: "center",
  },
  section: {
    gap: spacing.none,
  },
  banner: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.accentTintedBg,
  },
  bannerTitle: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  bannerText: {
    ...typography.body,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: tapMin,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  rowAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  rowActionLabel: {
    ...typography.label,
    color: colors.accent,
  },
  errorBlock: {
    gap: spacing.xs,
  },
  errorText: {
    ...typography.label,
    color: colors.danger,
  },
});
