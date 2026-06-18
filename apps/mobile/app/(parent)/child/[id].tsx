import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  borders,
  colors,
  iconSizes,
  parent,
  spacing,
  typography,
} from "../../../theme/tokens";
import { layoutEmoji, layoutLabel } from "../../../theme/layout-meta";
import { ApiError, parentApiFetch } from "../../../lib/api";
import { clearParentSession } from "../../../lib/session";
import type {
  BoardCard,
  ParentPortfolioResponse,
  PortfolioCardDTO,
  ShowcaseEntryDTO,
} from "../../../lib/types";
import { CardDetailModal } from "../../../components/CardDetailModal";
import {
  AppButton,
  AppHeader,
  EmptyState,
  Pill,
  SurfacePressable,
} from "../../../components/ui";

type OpenCard = {
  card: PortfolioCardDTO;
  authorName: string;
};

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const childId = typeof id === "string" ? id : "";
  const [data, setData] = useState<ParentPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<OpenCard | null>(null);

  const load = useCallback(async () => {
    if (!childId) {
      setError("자녀 정보를 찾을 수 없어요.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await parentApiFetch<ParentPortfolioResponse>(
        `/api/parent/portfolio?childId=${encodeURIComponent(childId)}`,
      );
      setData(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearParentSession();
        router.replace(
          "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
        );
        return;
      }
      if (e instanceof ApiError && e.status === 403) {
        setError("자녀 정보를 볼 권한이 없어요.");
      } else {
        setError("작품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [childId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const modalCard = useMemo(
    () => (openCard ? toBoardCard(openCard.card, openCard.authorName) : null),
    [openCard],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.errorCenter}>
          <EmptyState
            icon={<Text style={styles.errorEmoji}>🔒</Text>}
            title="확인할 수 없어요"
            description={error ?? "잠시 후 다시 시도해 주세요."}
            action={(
              <View style={styles.emptyActions}>
                <AppButton onPress={load}>다시 시도</AppButton>
                <AppButton variant="secondary" onPress={handleBack}>
                  돌아가기
                </AppButton>
              </View>
            )}
          />
        </View>
      </SafeAreaView>
    );
  }

  const ownCards = data.ownCards;
  const showcase = data.classroomShowcase;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <AppHeader title="자녀 작품" onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {data.child.name.slice(0, 1)}
            </Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.childName}>{data.child.name}의 작품</Text>
            <Text style={styles.childSub}>
              작품 {ownCards.length}개 · 우리 학급 자랑해요 {showcase.length}개
            </Text>
          </View>
        </View>

        <PortfolioSection
          title={`작품 (${ownCards.length}개)`}
          emptyTitle="아직 자녀의 작품이 없어요"
          cards={ownCards.map((card) => ({
            key: card.id,
            card,
            authorName: data.child.name,
          }))}
          onOpen={setOpenCard}
        />

        <PortfolioSection
          title={`우리 학급 자랑해요 (${showcase.length}개)`}
          emptyTitle="아직 자랑해요 작품이 없어요"
          cards={showcase.map((entry) => ({
            key: `${entry.cardId}:${entry.studentId}`,
            card: entry.card,
            authorName: entry.studentName,
            showcase: entry,
          }))}
          onOpen={setOpenCard}
        />
      </ScrollView>
      <CardDetailModal card={modalCard} onClose={() => setOpenCard(null)} />
    </SafeAreaView>
  );
}

function PortfolioSection({
  title,
  emptyTitle,
  cards,
  onOpen,
}: {
  title: string;
  emptyTitle: string;
  cards: Array<{
    key: string;
    card: PortfolioCardDTO;
    authorName: string;
    showcase?: ShowcaseEntryDTO;
  }>;
  onOpen: (open: OpenCard) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {cards.length === 0 ? (
        <EmptyState
          style={styles.emptyWrap}
          icon={<Text style={styles.emptyEmoji}>📭</Text>}
          title={emptyTitle}
        />
      ) : (
        <View style={styles.cardGrid}>
          {cards.map(({ key, card, authorName, showcase }) => (
            <PortfolioCard
              key={key}
              card={card}
              authorName={authorName}
              showcase={showcase}
              onPress={() => onOpen({ card, authorName })}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function PortfolioCard({
  card,
  authorName,
  showcase,
  onPress,
}: {
  card: PortfolioCardDTO;
  authorName: string;
  showcase?: ShowcaseEntryDTO;
  onPress: () => void;
}) {
  const imageUrl =
    card.thumbUrl ??
    card.imageUrl ??
    card.attachments.find((a) => a.kind === "image")?.previewUrl ??
    card.attachments.find((a) => a.kind === "image")?.url ??
    card.linkImage;
  const sourceLabel = buildSourceLabel(card);
  const authorLabel = card.sourceBoard.anonymousAuthor
    ? "익명"
    : showcase
      ? showcase.studentName
      : authorName;

  return (
    <SurfacePressable
      style={styles.card}
      onPress={onPress}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardFallback}>
          <Text style={styles.cardEmoji}>{layoutEmoji(card.sourceBoard.layout)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {card.title || "제목 없음"}
        </Text>
        <Text style={styles.cardSource} numberOfLines={1}>
          {sourceLabel}
        </Text>
        <View style={styles.cardMetaRow}>
          <Pill numberOfLines={1} textStyle={styles.cardLayout}>
            {layoutLabel(card.sourceBoard.layout)}
          </Pill>
          <Pill
            tone="accent"
            numberOfLines={1}
            style={styles.cardAuthorPill}
            textStyle={styles.cardAuthor}
          >
            {authorLabel}
          </Pill>
        </View>
      </View>
    </SurfacePressable>
  );
}

function buildSourceLabel(card: PortfolioCardDTO): string {
  if (card.sourceBoard.layout === "columns" && card.sourceSection) {
    return `${card.sourceBoard.title} · ${card.sourceSection.title}`;
  }
  return card.sourceBoard.title;
}

function toBoardCard(card: PortfolioCardDTO, authorName: string): BoardCard {
  return {
    id: card.id,
    boardId: card.sourceBoard.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl ?? card.thumbUrl,
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
    externalAuthorName: authorName,
    studentAuthorId: null,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    attachments: card.attachments
      .filter((a) => a.kind === "image" || a.kind === "video" || a.kind === "file")
      .map((a) => ({
        id: a.id,
        kind: a.kind as "image" | "video" | "file",
        url: a.url,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        order: a.order,
      })),
    authorName,
    studentAuthorName: authorName,
    anonymousAuthor: card.sourceBoard.anonymousAuthor,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: parent.doneIconSize },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatar: {
    width: parent.childDetailAvatarSize,
    height: parent.childDetailAvatarSize,
    borderRadius: parent.childDetailAvatarSize,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  avatarText: { ...typography.title, color: colors.accentTintedText },
  headerCopy: { flex: 1 },
  childName: { ...typography.display, color: colors.text },
  childSub: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...typography.title, color: colors.text },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  card: {
    width: parent.portfolioCardWidth,
    minWidth: parent.portfolioCardMinWidth,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: parent.portfolioImageHeight,
    backgroundColor: colors.surfaceAlt,
  },
  cardFallback: {
    height: parent.portfolioImageHeight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
  },
  cardEmoji: { fontSize: parent.emptyIconSize },
  cardBody: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { ...typography.section, color: colors.text },
  cardSource: { ...typography.label, color: colors.textMuted },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cardLayout: { ...typography.micro, color: colors.textFaint },
  cardAuthorPill: { flex: 1 },
  cardAuthor: { ...typography.micro, color: colors.accentTintedText },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: parent.portfolioEmptyMinHeight,
  },
  emptyEmoji: { fontSize: parent.emptyIconSize },
});
