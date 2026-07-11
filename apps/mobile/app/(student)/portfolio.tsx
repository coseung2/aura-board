import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CardDetailModal } from "../../components/CardDetailModal";
import {
  borders,
  colors,
  dashboard,
  layout as layoutTokens,
  media,
  portfolio as portfolioTokens,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutLabel } from "../../theme/layout-meta";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  AppHeader,
  ControlPressable,
  SurfaceCard,
  SurfacePressable,
} from "../../components/ui";
import type {
  BoardCard,
  MeResponse,
  PortfolioCardDTO,
  PortfolioRosterDTO,
  PortfolioStudentDTO,
} from "../../lib/types";

export default function StudentPortfolioScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ studentId?: string }>();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [roster, setRoster] = useState<PortfolioRosterDTO | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioStudentDTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLandscapeLayout = width > height && width >= dashboard.columns.one;
  const horizontalPadding = isLandscapeLayout ? spacing.xxl : spacing.xl;
  const isWideGrid =
    width >= portfolioTokens.cardWidth * 2 + spacing.lg + horizontalPadding * 2;
  const modalCards = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.cards.map((card) => toBoardCard(card, portfolio.student));
  }, [portfolio]);

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
    setSelectedCard(null);
    loadPortfolio(studentId);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="포트폴리오" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>불러오는 중이에요.</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            isLandscapeLayout && styles.contentLandscape,
          ]}
        >
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
                <ControlPressable
                  key={student.id}
                  style={[styles.studentChip, selected && styles.studentChipOn]}
                  onPress={() => selectStudent(student.id)}
                  accessibilityLabel={`${student.number != null ? `${student.number}번 ` : ""}${student.name}${self ? ", 나" : ""}, 작품 ${student.cardCount}개`}
                  accessibilityState={{ selected }}
                  accessibilityHint="학생 포트폴리오를 열어요"
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
                    작품 {student.cardCount}개
                  </Text>
                </ControlPressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {portfolio?.student.name ?? "학생"}의 작품
            </Text>
            {portfolio ? (
              <Text style={styles.sectionCount}>{portfolio.cards.length}개</Text>
            ) : null}
          </View>

          {portfolioLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : portfolio?.cards.length ? (
            <View style={[styles.cardGrid, isWideGrid && styles.cardGridWide]}>
              {portfolio.cards.map((card, index) => (
                <PortfolioCard
                  key={card.id}
                  card={card}
                  student={portfolio.student}
                  isWide={isWideGrid}
                  onPress={() => setSelectedCard(modalCards[index] ?? null)}
                />
              ))}
            </View>
          ) : (
            <SurfaceCard style={styles.emptyBox}>
              <Text style={styles.muted}>아직 포트폴리오 작품이 없어요.</Text>
            </SurfaceCard>
          )}
        </ScrollView>
      )}
      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </SafeAreaView>
  );
}

function PortfolioCard({
  card,
  student,
  isWide,
  onPress,
}: {
  card: PortfolioCardDTO;
  student: PortfolioStudentDTO["student"];
  isWide: boolean;
  onPress: () => void;
}) {
  const image = getCardPreviewImage(card);
  const authorLabel = card.sourceBoard.anonymousAuthor ? "익명" : student.name;
  return (
    <SurfacePressable
      style={[styles.card, isWide && styles.cardWide]}
      onPress={onPress}
      accessibilityLabel={`${authorLabel}의 작품 ${card.title || "제목 없음"} 열기`}
      accessibilityHint="작품 내용을 자세히 봐요"
    >
      <View style={styles.preview}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={styles.previewImage}
            resizeMode="cover"
            accessible={false}
          />
        ) : (
          <Text style={styles.previewPlaceholder}>미리보기 없음</Text>
        )}
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
    </SurfacePressable>
  );
}

function toBoardCard(
  card: PortfolioCardDTO,
  student: PortfolioStudentDTO["student"],
): BoardCard {
  const authorName = student.name;
  return {
    id: card.id,
    boardId: card.sourceBoard.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    x: 0,
    y: 0,
    width: null,
    height: null,
    order: null,
    sectionId: card.sourceSection?.id ?? null,
    authorId: null,
    externalAuthorName: null,
    studentAuthorId: student.id,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    likeCount: 0,
    commentCount: 0,
    attachments: card.attachments
      .filter((attachment) =>
        attachment.kind === "image" ||
        attachment.kind === "video" ||
        attachment.kind === "file"
      )
      .map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind as "image" | "video" | "file",
        url: attachment.url,
        previewUrl: null,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        order: attachment.order,
      })),
    authors: [{ id: student.id, displayName: authorName, studentId: student.id }],
    authorName,
    studentAuthorName: authorName,
    anonymousAuthor: card.sourceBoard.anonymousAuthor,
  };
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  content: {
    width: "100%",
    maxWidth: layoutTokens.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  contentLandscape: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
  },
  classroom: { ...typography.label, color: colors.textMuted },
  rosterRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  studentChip: {
    width: portfolioTokens.rosterChipWidth,
    minHeight: portfolioTokens.rosterChipMinHeight,
    padding: spacing.md,
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
    gap: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  sectionCount: { ...typography.label, color: colors.accent },
  inlineLoading: {
    minHeight: portfolioTokens.rosterChipMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  cardGrid: {
    gap: spacing.lg,
  },
  cardGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  card: {
    width: "100%",
    minHeight: portfolioTokens.cardMinHeight,
    overflow: "hidden",
  },
  cardWide: {
    width: portfolioTokens.cardWidth,
    flexGrow: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  preview: {
    height: dashboard.showcasePreviewHeight,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  previewImage: { width: "100%", height: "100%" },
  previewPlaceholder: { ...typography.micro, color: colors.textFaint },
  play: {
    position: "absolute",
    width: dashboard.playSize,
    height: dashboard.playSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  playText: {
    ...typography.section,
    color: colors.text,
    marginLeft: media.playOffset,
  },
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  cardTitle: { ...typography.subtitle, color: colors.text },
  cardContent: { ...typography.body, color: colors.textMuted },
  cardMeta: { ...typography.micro, color: colors.textMuted, marginTop: "auto" },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
