import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  dashboard,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import { AppHeader } from "../../components/ui";
import { ShowcaseCardGrid } from "../../components/ShowcaseCardGrid";
import type {
  MeResponse,
  ShowcaseEntryDTO,
} from "../../lib/types";

export default function StudentShowcaseScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<ShowcaseEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return true;
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const me = await apiFetch<MeResponse>("/api/student/me");
        const classroomId = me.student.classroom?.id;
        if (!classroomId) {
          setEntries([]);
          return;
        }
        const res = await apiFetch<{ entries: ShowcaseEntryDTO[] }>(
          `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${dashboard.showcaseFeedLimit}`,
        );
        setEntries(res.entries);
        setError(null);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("자랑해요를 불러올 수 없어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handleAuthError]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="우리 학급 자랑해요" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>불러오는 중이에요.</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ShowcaseCardGrid
            entries={entries}
            emptyText="아직 자랑해요 작품이 없어요."
            onOpen={(entry) =>
              router.push(
                {
                  pathname: "/(student)/portfolio",
                  params: { studentId: entry.studentId },
                } as unknown as Href,
              )
            }
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: { padding: spacing.xxl },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
