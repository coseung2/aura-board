import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { CardDetailModal } from "../../components/CardDetailModal";
import {
  borders,
  colors,
  dashboard,
  layout as layoutTokens,
  media,
  pageChrome,
  portfolio as portfolioTokens,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutLabel } from "../../theme/layout-meta";
import { apiFetch, ApiError, getApiBase } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  AppHeader,
  SurfaceCard,
  SurfacePressable,
} from "../../components/ui";
import type {
  BoardCard,
  MeResponse,
  PortfolioCardDTO,
  PortfolioStudentDTO,
} from "../../lib/types";

export default function StudentPortfolioScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [portfolio, setPortfolio] = useState<PortfolioStudentDTO | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLandscapeLayout = width > height && width >= dashboard.columns.one;
  const useWidePadding = width >= layoutTokens.mobileBreakpoint;
  const horizontalPadding = useWidePadding ? spacing.xxl : spacing.xl;
  const cardColumns = width > height ? 4 : 2;
  const gridWidth = Math.max(
    Math.min(width, layoutTokens.readableMaxWidth) - horizontalPadding * 2,
    0,
  );
  const cardWidth = Math.max(
    1,
    Math.floor(
      (gridWidth - layoutTokens.boardGridGap * (cardColumns - 1)) /
        cardColumns,
    ),
  );
  const modalCards = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.cards.map((card) => toBoardCard(card, portfolio.student));
  }, [portfolio]);
  const cardColumnsData = useMemo(() => {
    if (!portfolio) return [];
    const columns = Array.from(
      { length: cardColumns },
      () => [] as Array<{ card: PortfolioCardDTO; index: number }>,
    );
    const columnHeights = Array.from({ length: cardColumns }, () => 0);

    portfolio.cards.forEach((card, index) => {
      const targetColumn = columnHeights.reduce(
        (shortestIndex, height, columnIndex) =>
          height < columnHeights[shortestIndex] ? columnIndex : shortestIndex,
        0,
      );
      columns[targetColumn].push({ card, index });
      columnHeights[targetColumn] += estimatePortfolioCardHeight(card, cardWidth);
    });

    return columns;
  }, [cardColumns, cardWidth, portfolio]);

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
        await loadPortfolio(meRes.student.id);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("포트폴리오를 불러올 수 없어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handleAuthError, loadPortfolio]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="포트폴리오"
        right={
          portfolio ? (
            <Text style={styles.headerCount}>{portfolio.cards.length}개</Text>
          ) : undefined
        }
      />

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
          contentContainerStyle={[
            styles.content,
            useWidePadding && styles.contentWide,
            isLandscapeLayout && styles.contentLandscape,
          ]}
        >
          {portfolioLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : portfolio?.cards.length ? (
            <View style={styles.cardGrid}>
              {cardColumnsData.map((column, columnIndex) => (
                <View key={`portfolio-column-${columnIndex}`} style={styles.cardColumn}>
                  {column.map(({ card, index }) => (
                    <PortfolioCard
                      key={card.id}
                      card={card}
                      student={portfolio.student}
                      cardWidth={cardWidth}
                      onPress={() => setSelectedCard(modalCards[index] ?? null)}
                    />
                  ))}
                </View>
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
  cardWidth,
  onPress,
}: {
  card: PortfolioCardDTO;
  student: PortfolioStudentDTO["student"];
  cardWidth: number;
  onPress: () => void;
}) {
  const image = getCardPreviewImage(card);
  const authorLabel = card.sourceBoard.anonymousAuthor ? "익명" : student.name;
  return (
    <SurfacePressable
      style={[styles.card, { width: cardWidth }]}
      onPress={onPress}
      accessibilityLabel={`${authorLabel}의 작품 ${card.title || "제목 없음"} 열기`}
      accessibilityHint="작품 내용을 자세히 봐요"
    >
      <View style={styles.preview}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={styles.previewImage}
            contentFit="cover"
            transition={150}
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

function getCardPreviewImage(card: PortfolioCardDTO): string | null {
  if (card.thumbUrl) return resolvePortfolioAssetUrl(card.thumbUrl);
  if (card.imageUrl) return resolvePortfolioAssetUrl(card.imageUrl);
  if (card.linkImage) return resolvePortfolioAssetUrl(card.linkImage);
  const imageAttachment = card.attachments?.find(
    (a) => a.kind === "image" && (a.previewUrl || a.url),
  );
  const image = imageAttachment?.previewUrl ?? imageAttachment?.url ?? null;
  return image ? resolvePortfolioAssetUrl(image) : null;
}

function resolvePortfolioAssetUrl(value: string): string {
  const apiBase = getApiBase();
  try {
    const assetUrl = new URL(value, apiBase);
    const apiOrigin = new URL(apiBase).origin;
    const isAuraBoardAsset =
      assetUrl.hostname === "aura-board.com" ||
      assetUrl.hostname === "www.aura-board.com";

    if (isAuraBoardAsset && apiOrigin !== assetUrl.origin) {
      return `${apiOrigin}${assetUrl.pathname}${assetUrl.search}`;
    }

    if (assetUrl.origin !== apiOrigin) {
      return `${apiOrigin}/api/link-preview/image?url=${encodeURIComponent(
        assetUrl.toString(),
      )}`;
    }
    return assetUrl.toString();
  } catch {
    return value;
  }
}

function estimatePortfolioCardHeight(card: PortfolioCardDTO, cardWidth: number) {
  const charactersPerLine = Math.max(9, Math.floor(cardWidth / 13));
  const estimatedLines = (text: string, maximum: number) =>
    Math.min(
      maximum,
      Math.max(1, Math.ceil(text.trim().length / charactersPerLine)),
    );
  const titleLines = estimatedLines(card.title || "제목 없음", 2);
  const contentLines = card.content ? estimatedLines(card.content, 3) : 0;

  return (
    cardWidth / media.previewAspectRatio +
    spacing.sm * 2 +
    typography.subtitle.lineHeight * titleLines +
    (contentLines ? typography.label.lineHeight * contentLines + spacing.xs : 0) +
    typography.micro.lineHeight
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
  loadingText: { ...typography.body, color: colors.textMuted },
  content: {
    width: "100%",
    maxWidth: layoutTokens.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  contentWide: {
    paddingHorizontal: spacing.xxl,
  },
  contentLandscape: {
    gap: spacing.xl,
  },
  headerCount: { ...typography.label, color: colors.accent },
  inlineLoading: {
    minHeight: portfolioTokens.rosterChipMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  cardGrid: {
    flexDirection: "row",
    columnGap: layoutTokens.boardGridGap,
  },
  cardColumn: {
    flex: 1,
    minWidth: 0,
    gap: layoutTokens.boardGridGap,
  },
  card: {
    overflow: "hidden",
  },
  preview: {
    aspectRatio: media.previewAspectRatio,
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
    width: spacing.xxl,
    height: spacing.xxl,
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
  cardBody: { padding: spacing.sm, gap: spacing.xs },
  cardTitle: { ...typography.subtitle, color: colors.text },
  cardContent: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.textMuted,
  },
  cardMeta: { ...typography.micro, color: colors.textFaint },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
