import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import type { FeedPostView } from "../lib/feed";
import { apiFetch } from "../lib/api";
import { blockAuthor, hideContent, reportContent } from "../lib/content-safety";
import { CommentBottomSheet } from "./CommentBottomSheet";
import { StreamFeedPost } from "./layouts/ColumnsStreamFeedPost";
import { borders, colors } from "../theme/tokens";

/** Feed boundary adapter: FeedPost identity and routes stay separate from boards. */
export function FeedPostCard({ item }: { item: FeedPostView }) {
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentCount);
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  function openModerationMenu() {
    const actions: Array<{
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }> = [{ text: "취소", style: "cancel" }];
    if (item.canDelete) {
      actions.push({
        text: "게시물 삭제",
        style: "destructive",
        onPress: () => {
          void apiFetch(`/api/student/feed/${encodeURIComponent(item.postId)}`, { method: "DELETE" })
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("삭제 실패", "게시물을 삭제하지 못했습니다."));
        },
      });
    }
    if (item.canHide) {
      actions.push({
        text: "이 게시물 숨기기",
        onPress: () => {
          void hideContent({ targetKind: "feed_post", targetId: item.postId })
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("숨기기 실패", "게시물을 숨기지 못했습니다."));
        },
      });
    }
    if (item.canBlockAuthor && item.authorId) {
      actions.push({
        text: "작성자 차단",
        style: "destructive",
        onPress: () => {
          void blockAuthor(item.authorId!)
            .then(() => setRemoved(true))
            .catch(() => Alert.alert("차단 실패", "작성자를 차단하지 못했습니다."));
        },
      });
    }
    if (item.canReport) {
      actions.push({
        text: "게시물 신고",
        style: "destructive",
        onPress: () => {
          void reportContent({ targetKind: "feed_post", targetId: item.postId, reason: "other" })
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
        feedPost={{ ...item, commentCount }}
        engagementMode="interactive"
        onOpenComments={() => setCommentsVisible(true)}
        onLongPress={openModerationMenu}
      />
      <CommentBottomSheet
        cardId={item.postId}
        resourceKind="feed"
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        onCommentCountChange={(change) => setCommentCount((count) => Math.max(0, count + change))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
});
