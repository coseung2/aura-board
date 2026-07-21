import { StyleSheet, View } from "react-native";
import { StreamFeedPost } from "./layouts/ColumnsStreamFeedPost";
import {
  parentFeedAttribution,
  toParentFeedBoardCard,
  type ParentFeedCardDTO,
} from "../lib/parent-feed-card-adapter";
import { borders, colors } from "../theme/tokens";

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
  const boardCard = toParentFeedBoardCard(card, childName);
  const authorLabel = parentFeedAttribution(card, childName);

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
        engagementMode="summary"
        highlighted={highlighted}
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
