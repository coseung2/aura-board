import { Redirect } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PortfolioCardDTO } from "../../lib/types";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentFeedCard } from "../../components/parent-feed-card";
import { AppHeader, SurfaceCard } from "../../components/ui";
import { borders, colors, spacing, typography } from "../../theme/tokens";

const DEV_CARD_DIMENSION = 1;

const DEV_FEED_CARDS: PortfolioCardDTO[] = [
  {
    id: "dev-preview-science",
    title: "봄빛 과학 전시회",
    content: "빛과 그림자를 관찰한 실험 기록을 모아 보았어요.",
    color: null,
    width: DEV_CARD_DIMENSION,
    height: DEV_CARD_DIMENSION,
    imageUrl: null,
    thumbUrl: null,
    linkUrl: null,
    linkTitle: null,
    linkDesc: null,
    linkImage: null,
    videoUrl: null,
    fileUrl: null,
    fileName: null,
    fileSize: null,
    fileMimeType: null,
    externalAuthorName: null,
    studentAuthorName: "샘플 학생",
    authorName: "샘플 학생",
    likeCount: 128,
    commentCount: 12,
    authors: [
      {
        id: "dev-author-science",
        studentId: "dev-student-haneul",
        displayName: "샘플 학생",
        order: 0,
      },
    ],
    attachments: [],
    sourceBoard: {
      id: "dev-board-science",
      slug: "dev-science",
      title: "봄빛 과학",
      layout: "columns",
      anonymousAuthor: false,
    },
    sourceSection: { id: "dev-section-experiment", title: "실험 기록" },
    isShowcasedByMe: false,
    hasAnyShowcase: true,
    createdAt: "2026-07-10T09:30:00.000Z",
  },
  {
    id: "dev-preview-rehearsal",
    title: "주말 음악회 리허설",
    content: "영상과 안내 자료가 함께 있는 게시물 상태를 확인해 보세요.",
    color: null,
    width: DEV_CARD_DIMENSION,
    height: DEV_CARD_DIMENSION,
    imageUrl: null,
    thumbUrl: null,
    linkUrl: null,
    linkTitle: null,
    linkDesc: null,
    linkImage: null,
    videoUrl: "https://example.invalid/dev-preview-rehearsal.mp4",
    fileUrl: "https://example.invalid/dev-preview-program.pdf",
    fileName: "음악회 안내.pdf",
    fileSize: 48000,
    fileMimeType: "application/pdf",
    externalAuthorName: null,
    studentAuthorName: "샘플 학생",
    authorName: "샘플 학생",
    likeCount: 2048,
    commentCount: 103,
    authors: [
      {
        id: "dev-author-rehearsal",
        studentId: "dev-student-haneul",
        displayName: "샘플 학생",
        order: 0,
      },
    ],
    attachments: [
      {
        id: "dev-attachment-video",
        kind: "video",
        url: "https://example.invalid/dev-preview-rehearsal.mp4",
        previewUrl: null,
        fileName: "리허설 영상.mp4",
        fileSize: 1200000,
        mimeType: "video/mp4",
        order: 0,
      },
      {
        id: "dev-attachment-program",
        kind: "file",
        url: "https://example.invalid/dev-preview-program.pdf",
        previewUrl: null,
        fileName: "음악회 안내.pdf",
        fileSize: 48000,
        mimeType: "application/pdf",
        order: 1,
      },
    ],
    sourceBoard: {
      id: "dev-board-music",
      slug: "dev-music",
      title: "우리 반 소식",
      layout: "stream",
      anonymousAuthor: false,
    },
    sourceSection: null,
    isShowcasedByMe: false,
    hasAnyShowcase: false,
    createdAt: "2026-07-08T14:15:00.000Z",
  },
  {
    id: "dev-preview-reflection",
    title: "",
    content: "이번 주에 새롭게 알게 된 점과 다음 목표를 적었어요.",
    color: null,
    width: DEV_CARD_DIMENSION,
    height: DEV_CARD_DIMENSION,
    imageUrl: null,
    thumbUrl: null,
    linkUrl: null,
    linkTitle: null,
    linkDesc: null,
    linkImage: null,
    videoUrl: null,
    fileUrl: "https://example.invalid/dev-preview-reflection.txt",
    fileName: "주간 회고.txt",
    fileSize: 2048,
    fileMimeType: "text/plain",
    externalAuthorName: null,
    studentAuthorName: "샘플 학생",
    authorName: "샘플 학생",
    likeCount: 7,
    commentCount: 0,
    authors: [
      {
        id: "dev-author-reflection",
        studentId: "dev-student-haneul",
        displayName: "샘플 학생",
        order: 0,
      },
    ],
    attachments: [
      {
        id: "dev-attachment-reflection",
        kind: "file",
        url: "https://example.invalid/dev-preview-reflection.txt",
        previewUrl: null,
        fileName: "주간 회고.txt",
        fileSize: 2048,
        mimeType: "text/plain",
        order: 0,
      },
    ],
    sourceBoard: {
      id: "dev-board-reflection",
      slug: "dev-reflection",
      title: "주간 회고",
      layout: "freeform",
      anonymousAuthor: false,
    },
    sourceSection: null,
    isShowcasedByMe: false,
    hasAnyShowcase: false,
    createdAt: "2026-07-05T07:45:00.000Z",
  },
];

export default function ParentDevPreview() {
  if (!__DEV__) {
    return <Redirect href="/(parent)/login" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="학부모 피드 미리보기"
        right={<Text style={styles.devBadge}>DEV</Text>}
      />

      <FlatList
        data={DEV_FEED_CARDS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParentFeedCard
            card={item}
            childName="샘플 학생"
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SurfaceCard style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>개발 전용 미리보기</Text>
              <Text style={styles.noticeText}>
                서버와 로그인 없이 로컬 샘플 카드만 표시합니다. 본문과 첨부가 게시물 안에 바로 표시됩니다.
              </Text>
            </SurfaceCard>
            <View style={styles.childSummary}>
              <Text style={styles.childName}>샘플 학생의 새 소식</Text>
              <Text style={styles.childMeta}>5학년 2반 · 샘플 피드 3개</Text>
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      <ParentBottomNav
        active="home"
        notificationCount={2}
        onHomePress={() => undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: spacing.xl },
  listHeader: { gap: spacing.lg, padding: spacing.lg },
  noticeCard: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  noticeTitle: { ...typography.label, color: colors.accentTintedText },
  noticeText: { ...typography.body, color: colors.textMuted },
  childSummary: { gap: spacing.xs },
  childName: { ...typography.title, color: colors.text },
  childMeta: { ...typography.body, color: colors.textMuted },
  devBadge: {
    ...typography.micro,
    color: colors.accentTintedText,
    borderWidth: borders.hairline,
    borderColor: colors.accent,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  separator: { height: borders.hairline, backgroundColor: colors.border },
});
