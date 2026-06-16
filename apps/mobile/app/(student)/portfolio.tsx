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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutLabel } from "../../theme/layout-meta";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type {
  MeResponse,
  PortfolioCardDTO,
  PortfolioRosterDTO,
  PortfolioStudentDTO,
} from "../../lib/types";

export default function StudentPortfolioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ studentId?: string }>();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [roster, setRoster] = useState<PortfolioRosterDTO | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioStudentDTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
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

  const loadPortfolio = useCallback(
    async (studentId: string) => {
      setPortfolioLoading(true);
      try {
        const res = await apiFetch<PortfolioStudentDTO>(
          `/api/student-portfolio/${encodeURIComponent(studentId)}`,
        );
        setPortfolio(res);
        setError(null);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("포트폴리오를 불러올 수 없어요.");
      } finally {
        setPortfolioLoading(false);
      }
    },
    [handleAuthError],
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const meRes = await apiFetch<MeResponse>("/api/student/me");
        const classroomId = meRes.student.classroom?.id;
        if (!classroomId) {
          setMe(meRes);
          setRoster(null);
          setPortfolio(null);
          setSelectedId(null);
          setError("학급 정보가 없어 포트폴리오를 불러올 수 없어요.");
          return;
        }
        const rosterRes = await apiFetch<PortfolioRosterDTO>(
          `/api/student-portfolio/roster?classroomId=${encodeURIComponent(classroomId)}`,
        );
        setMe(meRes);
        setRoster(rosterRes);
        const initialId =
          firstParam(params.studentId) ??
          meRes.student.id ??
          rosterRes.students[0]?.id ??
          null;
        setSelectedId(initialId);
        if (initialId) await loadPortfolio(initialId);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("학급 포트폴리오를 불러올 수 없어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handleAuthError, loadPortfolio, params.studentId]);

  function selectStudent(studentId: string) {
    setSelectedId(studentId);
    loadPortfolio(studentId);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>우리 학급 포트폴리오</Text>
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
          <Text style={styles.classroom}>{roster?.classroom.name}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rosterRow}
          >
            {roster?.students.map((student) => {
              const selected = student.id === selectedId;
              const self = student.id === me?.student.id;
              return (
                <Pressable
                  key={student.id}
                  style={[styles.studentChip, selected && styles.studentChipOn]}
                  onPress={() => selectStudent(student.id)}
                >
                  <Text
                    style={[
                      styles.studentName,
                      selected && styles.studentNameOn,
                    ]}
                    numberOfLines={1}
                  >
                    {student.number ? `${student.number}번 ` : ""}
                    {student.name}
                    {self ? " · 나" : ""}
                  </Text>
                  <Text
                    style={[
                      styles.studentMeta,
                      selected && styles.studentMetaOn,
                    ]}
                  >
                    작품 {student.cardCount}개 · 자랑 {student.showcaseCount}개
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {portfolio?.student.name ?? "학생"}의 작품
            </Text>
          </View>

          {portfolioLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : portfolio?.cards.length ? (
            <View style={styles.cardGrid}>
              {portfolio.cards.map((card) => (
                <PortfolioCard key={card.id} card={card} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>아직 포트폴리오 작품이 없어요.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PortfolioCard({ card }: { card: PortfolioCardDTO }) {
  const image = getCardPreviewImage(card);
  return (
    <View style={styles.card}>
      <View style={styles.preview}>
        {image ? (
          <Image source={{ uri: image }} style={styles.previewImage} />
        ) : null}
        {card.videoUrl ? (
          <View style={styles.play}>
            <Text style={styles.playText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {card.title || "제목 없음"}
        </Text>
        {card.content ? (
          <Text style={styles.cardContent} numberOfLines={3}>
            {card.content}
          </Text>
        ) : null}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {layoutLabel(card.sourceBoard.layout)} · {card.sourceBoard.title}
        </Text>
      </View>
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  content: {
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  classroom: { ...typography.section, color: colors.text },
  rosterRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  studentChip: {
    width: 176,
    minHeight: 74,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  studentChipOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  studentName: { ...typography.label, color: colors.text },
  studentNameOn: { color: colors.accentTintedText },
  studentMeta: { ...typography.micro, color: colors.textMuted },
  studentMetaOn: { color: colors.accentTintedText },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...typography.section, color: colors.text },
  inlineLoading: { paddingVertical: spacing.xl },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  card: {
    width: 300,
    minHeight: 300,
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
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
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  cardTitle: { ...typography.section, color: colors.text },
  cardContent: { ...typography.body, color: colors.textMuted },
  cardMeta: { ...typography.micro, color: colors.textMuted, marginTop: "auto" },
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
