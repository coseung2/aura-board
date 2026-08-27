import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { feedApiMessage, type FeedDraft, type FeedPostView } from "../lib/feed";
import { ApiError, apiFetch } from "../lib/api";
import { blockAuthor, hideContent, reportContent } from "../lib/content-safety";
import { CommentBottomSheet } from "./CommentBottomSheet";
import { StreamFeedPost } from "./layouts/ColumnsStreamFeedPost";
import { FeedComposerForm } from "./FeedComposerForm";
import { AppHeader, AppModal } from "./ui";
import { clearStudentFeedCache } from "../lib/student-feed-cache";
import { borders, colors } from "../theme/tokens";

/** Feed boundary adapter: FeedPost identity and routes stay separate from boards. */
export function FeedPostCard({ item }: { item: FeedPostView }) {
  const [post, setPost] = useState(item);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentCount);
  const [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useState(false);

  if (removed) return null;

  function openModerationMenu() {
    const actions: Array<{
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }> = [{ text: "취소", style: "cancel" }];
    if (post.canEdit) {
      actions.push({
        text: "게시물 수정",
        onPress: () => setEditing(true),
      });
    }
    if (post.canDelete) {
      actions.push({
        text: "게시물 삭제",
        style: "destructive",
        onPress: () => {
          void apiFetch(`/api/student/feed/${encodeURIComponent(post.postId)}`, { method: "DELETE" })
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("삭제 실패", "게시물을 삭제하지 못했습니다."));
        },
      });
    }
    if (post.canHide) {
      actions.push({
        text: "이 게시물 숨기기",
        onPress: () => {
          void hideContent({ targetKind: "feed_post", targetId: post.postId })
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("숨기기 실패", "게시물을 숨기지 못했습니다."));
        },
      });
    }
    if (post.canBlockAuthor && post.authorId) {
      actions.push({
        text: "작성자 차단",
        style: "destructive",
        onPress: () => {
          void blockAuthor(post.authorId!)
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("차단 실패", "작성자를 차단하지 못했습니다."));
        },
      });
    }
    if (post.canReport) {
      actions.push({
        text: "게시물 신고",
        style: "destructive",
        onPress: () => {
          void reportContent({ targetKind: "feed_post", targetId: post.postId, reason: "other" })
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("신고 실패", "신고를 보내지 못했습니다."));
        },
      });
    }
    Alert.alert("게시물 메뉴", undefined, actions);
  }

  return (
    <View style={styles.card} accessible={false}>
      <StreamFeedPost
        feedPost={{ ...post, commentCount }}
        engagementMode="interactive"
        onOpenComments={() => setCommentsVisible(true)}
        onLongPress={openModerationMenu}
      />
      <CommentBottomSheet
        cardId={post.postId}
        resourceKind="feed"
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        onCommentCountChange={(change) => setCommentCount((count) => Math.max(0, count + change))}
      />
      <AppModal
        visible={editing}
        onClose={() => setEditing(false)}
        animationType="slide"
        keyboardAvoiding
        sheetStyle={styles.editor}
      >
        <View style={styles.editor}>
          <AppHeader title="게시물 수정" onBack={() => setEditing(false)} showDailyBanner={false} />
          <FeedComposerForm
            initialDraft={{
              title: post.title,
              body: post.body,
              media: post.media.map((media) => ({
                kind: media.kind,
                url: media.url,
                altText: media.altText ?? null,
              })),
            }}
            submitLabel="수정 저장"
            onSubmit={async (draft: FeedDraft) => {
              try {
                await apiFetch(`/api/student/feed/${encodeURIComponent(post.postId)}`, {
                  method: "PATCH",
                  json: draft,
                });
                setPost((current) => ({
                  ...current,
                  ...draft,
                  media: draft.media.map((media, position) => ({
                    ...media,
                    id: current.media[position]?.id ?? `${post.postId}:${position}`,
                    position,
                  })),
                }));
                clearStudentFeedCache();
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) {
                  throw new Error("로그인이 만료되었어요.");
                }
                throw new Error(feedApiMessage(cause, "게시물을 수정하지 못했어요."));
              }
            }}
            onSuccess={() => setEditing(false)}
          />
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  editor: { flex: 1, backgroundColor: colors.bg },
});
