import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type {
  MeResponse,
  PortfolioCardDTO,
  ShowcaseEntryDTO,
} from "../../lib/types";

const SHOWCASE_LIMIT = 50;

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
          `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${SHOWCASE_LIMIT}`,
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>우리 학급 자랑해요</Text>
      </View>

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
          {entries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>아직 자랑해요 작품이 없어요.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {entries.map((entry) => (
                <Pressable
                  key={`${entry.cardId}:${entry.studentId}`}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() =>
                    router.push(
                      {
                        pathname: "/(student)/portfolio",
                        params: { studentId: entry.studentId },
                      } as unknown as Href,
                    )
                  }
                >
                  <ShowcasePreview entry={entry} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ShowcasePreview({ entry }: { entry: ShowcaseEntryDTO }) {
  const card = entry.card;
  const image = getCardPreviewImage(card);
  return (
    <>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>🌟</Text>
      </View>
      <View style={styles.preview}>
        {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : null}
        {card.videoUrl ? (
          <View style={styles.play}>
            <Text style={styles.playText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {card.title || "제목 없음"}
        </Text>
        {card.content ? (
          <Text style={styles.cardContent} numberOfLines={3}>
            {card.content}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.author} numberOfLines={1}>
            {entry.studentName}
          </Text>
          <Text style={styles.date}>{formatShortDate(card.createdAt)}</Text>
        </View>
      </View>
    </>
  );
}

function getCardPreviewImage(card: PortfolioCardDTO): string | null {
  if (card.thumbUrl) return card.thumbUrl;
  if (card.imageUrl) return card.imageUrl;
  if (card.linkImage) return card.linkImage;
  const imageAttachment = card.attachments?.find(
    (a) => a.kind === "image" && (a.previewUrl || a.url),
  );
  return imageAttachment?.previewUrl ?? imageAttachment?.url ?? null;
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  backText: { fontSize: 24, color: colors.text },
  title: { ...typography.title, color: colors.text },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: { padding: spacing.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  card: {
    width: 310,
    minHeight: 282,
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
    ...shadows.card,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  badge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12 },
  preview: {
    height: 150,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewImage: { width: "100%", height: "100%" },
  play: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  playText: { color: colors.text, fontSize: 18, marginLeft: 2 },
  body: { padding: spacing.lg, gap: spacing.sm },
  cardTitle: { ...typography.section, color: colors.text },
  cardContent: { ...typography.body, color: colors.textMuted },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  author: {
    ...typography.badge,
    color: colors.accent,
    backgroundColor: colors.accentTintedBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    maxWidth: 120,
  },
  date: { ...typography.micro, color: colors.textMuted },
  emptyBox: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
