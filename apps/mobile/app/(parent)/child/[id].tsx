import { useCallback, useEffect, useMemo, useState } from "react";
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
          <Text style={styles.errorEmoji}>🔒</Text>
          <Text style={styles.errorTitle}>확인할 수 없어요</Text>
          <Text style={styles.errorMsg}>{error ?? "잠시 후 다시 시도해 주세요."}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={load}
          >
            <Text style={styles.primaryBtnText}>다시 시도</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            onPress={handleBack}
          >
            <Text style={styles.secondaryBtnText}>돌아가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const ownCards = data.ownCards;
  const showcase = data.classroomShowcase;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            onPress={handleBack}
          >
            <Text style={styles.backText}>← 돌아가기</Text>
          </Pressable>
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
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        </View>
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

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
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
          <Text style={styles.cardLayout}>{layoutLabel(card.sourceBoard.layout)}</Text>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {showcase ? showcase.studentName : authorName}
          </Text>
        </View>
      </View>
    </Pressable>
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
    gap: spacing.md,
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: 56 },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  primaryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    ...shadows.accent,
  },
  primaryBtnPressed: { backgroundColor: colors.accentActive },
  primaryBtnText: { ...typography.label, color: "#fff" },
  secondaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnPressed: { backgroundColor: colors.surfaceAlt },
  secondaryBtnText: { ...typography.label, color: colors.textMuted },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.lg,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtnPressed: { backgroundColor: colors.surfaceAlt },
  backText: { ...typography.label, color: colors.textMuted },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
    borderWidth: 1,
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
    width: "31.8%",
    minWidth: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: "hidden",
    ...shadows.card,
  },
  cardPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.99 }],
  },
  cardImage: {
    width: "100%",
    height: 132,
    backgroundColor: colors.surfaceAlt,
  },
  cardFallback: {
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
  },
  cardEmoji: { fontSize: 48 },
  cardBody: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { ...typography.section, color: colors.text },
  cardSource: { ...typography.label, color: colors.textMuted },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cardLayout: { ...typography.micro, color: colors.textFaint },
  cardAuthor: { ...typography.micro, color: colors.textMuted, flex: 1, textAlign: "right" },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.section, color: colors.textMuted },
});
