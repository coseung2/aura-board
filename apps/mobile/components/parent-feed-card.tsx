import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { StreamFeedPost } from "./layouts/ColumnsStreamFeedPost";
import { CommentBottomSheet } from "./CommentBottomSheet";
import {
  parentFeedAttribution,
  toParentFeedBoardCard,
  type ParentFeedCardDTO,
} from "../lib/parent-feed-card-adapter";
import { borders, colors } from "../theme/tokens";
import { clearParentSession, getUnifiedLoginRoute } from "../lib/session";

type Props = {
  card: ParentFeedCardDTO;
  childName?: string;
  highlighted?: boolean;
};

/**
 * Parent-feed boundary adapter. The post UI is the same StreamFeedPost used
 * by the student mobile screens; only the parent-scoped DTO is adapted.
 */
export function ParentFeedCard({ card, childName, highlighted = false }: Props) {
  const router = useRouter();
  const [commentsVisible, setCommentsVisible] = useState(false);
  // Public comment counts belong to the school-wide thread. A parent card
  // opens only its family thread, so never surface that public count here.
  const boardCard = {
    ...toParentFeedBoardCard(card, childName),
    commentCount: 0,
  };
  const authorLabel = parentFeedAttribution(card, childName);
  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    setCommentsVisible(false);
    router.replace(getUnifiedLoginRoute("parent"));
  }, [router]);

  return (
    <View
      style={[styles.card, highlighted && styles.cardHighlighted]}
      accessible={false}
      accessibilityLabel={`${authorLabel}의 게시물${
        highlighted ? ", 선택한 게시물" : ""
      }`}
    >
      <StreamFeedPost
        card={boardCard}
        authorLabel={authorLabel}
        engagementMode="interactive"
        highlighted={highlighted}
        viewer="parent"
        onUnauthorized={handleUnauthorized}
        onOpenComments={() => setCommentsVisible(true)}
      />
      <CommentBottomSheet
        cardId={card.id}
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        viewer="parent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderBottomWidth: borders.none,
    borderBottomColor: colors.transparent,
  },
  cardHighlighted: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.accent,
  },
});
