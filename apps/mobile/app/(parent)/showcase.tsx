import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  dashboard,
  spacing,
  typography,
} from "../../theme/tokens";
import { ApiError, parentApiFetch } from "../../lib/api";
import { clearParentSession } from "../../lib/session";
import type {
  BoardCard,
  ParentChildrenResponse,
  PortfolioCardDTO,
  ShowcaseEntryDTO,
} from "../../lib/types";
import { AppHeader } from "../../components/ui";
import { CardDetailModal } from "../../components/CardDetailModal";
import { ShowcaseCardGrid } from "../../components/ShowcaseCardGrid";

type OpenCard = {
  card: PortfolioCardDTO;
  authorName: string;
};

export default function ParentShowcaseScreen() {
  const router = useRouter();
  const { classroomId } = useLocalSearchParams<{ classroomId?: string }>();
  const [entries, setEntries] = useState<ShowcaseEntryDTO[]>([]);
  const [classroomName, setClassroomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<OpenCard | null>(null);

  const modalCard = useMemo(
    () => (openCard ? toBoardCard(openCard.card, openCard.authorName) : null),
    [openCard],
  );

  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearParentSession();
        router.replace(
          "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
        );
        return true;
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const me = await parentApiFetch<ParentChildrenResponse>("/api/parent/children");
        const activeClassrooms = me.children
          .map((child) => child.classroom)
          .filter((c): c is NonNullable<typeof c> => c !== null);
        const requested = typeof classroomId === "string" ? classroomId : "";
        const target =
          activeClassrooms.find((c) => c.id === requested) ?? activeClassrooms[0];
        if (!target) {
          if (mounted) {
            setEntries([]);
            setClassroomName("");
            setError(null);
          }
          return;
        }
        const res = await parentApiFetch<{ entries: ShowcaseEntryDTO[] }>(
          `/api/showcase/classroom/${encodeURIComponent(target.id)}?limit=${dashboard.showcaseFeedLimit}`,
        );
        if (mounted) {
          setEntries(res.entries);
          setClassroomName(target.name);
          setError(null);
        }
      } catch (e) {
        if (await handleAuthError(e)) return;
        if (mounted) setError("자랑해요를 불러올 수 없어요.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [classroomId, handleAuthError]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
          <View style={styles.head}>
            <Text style={styles.title}>{classroomName || "자녀 학급"} 자랑해요</Text>
            <Text style={styles.subtitle}>
              자녀가 속한 학급에서 선생님과 친구들이 함께 고른 작품이에요.
            </Text>
          </View>
          <ShowcaseCardGrid
            entries={entries}
            emptyText="아직 자랑해요 작품이 없어요."
            onOpen={(entry) =>
              setOpenCard({ card: entry.card, authorName: entry.studentName })
            }
          />
        </ScrollView>
      )}

      <CardDetailModal card={modalCard} onClose={() => setOpenCard(null)} />
    </SafeAreaView>
  );
}

function toBoardCard(card: PortfolioCardDTO, authorName: string): BoardCard {
  return {
    id: card.id,
    boardId: card.sourceBoard.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl ?? card.thumbUrl,
    thumbUrl: card.thumbUrl,
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
        previewUrl: null,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: { padding: spacing.xxl, gap: spacing.xl },
  head: { gap: spacing.xs },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
