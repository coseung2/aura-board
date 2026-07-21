import { StyleSheet, View } from "react-native";
import type { ParentPostDTO, PortfolioCardDTO } from "../lib/types";
import { resolveParentFeedAuthor } from "../lib/parent-feed-presentation";
import { portfolioCardToBoardCard } from "../lib/portfolio-card";
import { parent, spacing } from "../theme/tokens";
import { StreamFeedPost } from "./layouts/ColumnsBoard";

type Props = {
  card: ParentPostDTO | PortfolioCardDTO;
  childName?: string;
  highlighted?: boolean;
};

/** Parent wrapper around the canonical student stream post presentation. */
export function ParentFeedCard({ card, childName, highlighted = false }: Props) {
  const linkedChildNames =
    "linkedChildren" in card
      ? card.linkedChildren.map((child) => child.name).filter(Boolean).join(" · ")
      : "";
  const attribution = linkedChildNames || childName || "우리 아이";
  const authorName = resolveParentFeedAuthor(card, attribution);
  const fallbackStudentId =
    "linkedChildren" in card ? card.linkedChildren[0]?.id ?? null : null;
  const feedCard = portfolioCardToBoardCard(card, {
    fallbackAuthor: { id: fallbackStudentId, name: authorName },
  });

  return (
    <View style={styles.card}>
      <StreamFeedPost
        card={feedCard}
        authorLabel={authorName}
        sourceLabel={buildSourceLabel(card)}
        engagementMode="summary"
        highlighted={highlighted}
      />
    </View>
  );
}

function buildSourceLabel(card: PortfolioCardDTO): string {
  if (card.sourceBoard.layout === "columns" && card.sourceSection) {
    return `${card.sourceBoard.title} · ${card.sourceSection.title}`;
  }
  return card.sourceBoard.title;
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: parent.contentCardMinWidth * 2 - spacing.lg,
    alignSelf: "center",
  },
});
