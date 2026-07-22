import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CommentBottomSheet } from "../../components/CommentBottomSheet";
import { StreamFeedPost } from "../../components/layouts/ColumnsBoard";
import {
  borders,
  colors,
  pageChrome,
  portfolio as portfolioTokens,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiBase } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { AppHeader, SurfaceCard } from "../../components/ui";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import type {
  BoardCard,
  MeResponse,
  PortfolioCardDTO,
  PortfolioStudentDTO,
} from "../../lib/types";

export default function StudentPortfolioScreen() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<PortfolioStudentDTO | null>(null);
  const [commentCard, setCommentCard] = useState<BoardCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalCards = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.cards.map((card) => toBoardCard(card, portfolio.student));
  }, [portfolio]);
  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
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
          <View style={styles.headerRight}>
            {portfolio ? (
              <Text style={styles.headerCount}>{portfolio.cards.length}개</Text>
            ) : null}
            <StudentHeaderActions />
          </View>
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
        <ScrollView contentContainerStyle={styles.content}>
          {portfolioLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : portfolio?.cards.length ? (
            <View style={styles.streamList}>
              {portfolio.cards.map((card, index) => (
                <View key={card.id}>
                  <StreamFeedPost
                    card={
                      modalCards[index] ?? toBoardCard(card, portfolio.student)
                    }
                    onOpenComments={() =>
                      setCommentCard(modalCards[index] ?? null)
                    }
                  />
                  {index < portfolio.cards.length - 1 ? (
                    <View style={styles.streamSeparator} accessible={false} />
                  ) : null}
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
      <CommentBottomSheet
        cardId={commentCard?.id ?? null}
        visible={commentCard !== null}
        onClose={() => setCommentCard(null)}
        onCommentCountChange={(change) => {
          if (!commentCard) return;
          setPortfolio((current) =>
            current
              ? {
                  ...current,
                  cards: current.cards.map((card) =>
                    card.id === commentCard.id
                      ? {
                          ...card,
                          commentCount: Math.max(0, card.commentCount + change),
                        }
                      : card,
                  ),
                }
              : current,
          );
        }}
      />
    </SafeAreaView>
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
    imageUrl: getCardPreviewImage(card),
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage ? resolvePortfolioAssetUrl(card.linkImage) : null,
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
      .filter(
        (attachment) =>
          attachment.kind === "image" ||
          attachment.kind === "video" ||
          attachment.kind === "file",
      )
      .map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind as "image" | "video" | "file",
        url: resolvePortfolioAssetUrl(attachment.url),
        previewUrl: attachment.previewUrl
          ? resolvePortfolioAssetUrl(attachment.previewUrl)
          : null,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        order: attachment.order,
      })),
    authors: [
      { id: student.id, displayName: authorName, studentId: student.id },
    ],
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
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  headerCount: { ...typography.label, color: colors.accent },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  inlineLoading: {
    minHeight: portfolioTokens.rosterChipMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  streamList: { gap: spacing.none },
  streamSeparator: {
    height: borders.hairline,
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  emptyBox: {
    marginHorizontal: pageChrome.horizontalPadding,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
