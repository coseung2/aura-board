import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { CardComposer } from "../../components/CardComposer";
import { InputPage } from "../../components/input-page";
import { AppButton } from "../../components/ui";
import { useInputBoard } from "../../hooks/use-input-board";
import { canReadMobileLayout } from "../../lib/product-access";
import { useProductAccess } from "../../lib/product-access-context";

export default function CardComposeScreen() {
  const {
    slug = "",
    cardId,
    sectionId,
    order,
  } = useLocalSearchParams<{
    slug: string;
    cardId?: string;
    sectionId?: string;
    order?: string;
  }>();
  const router = useRouter();
  const access = useProductAccess();
  const board = useInputBoard(slug);
  const card = cardId
    ? board.data?.cards.find((item) => item.id === cardId)
    : undefined;
  const breakout = board.data?.layoutData.breakout;
  const writable =
    !breakout ||
    Boolean(sectionId && breakout.writableSectionIds.includes(sectionId));
  const allowed =
    board.data &&
    canReadMobileLayout(access, board.data.board.layout) &&
    (cardId ? card?.canEdit === true : writable);
  if (!board.data || !allowed)
    return (
      <InputPage title="게시물 작성" onBack={() => router.back()}>
        {board.error ? (
          <>
            <Text accessibilityRole="alert">{board.error}</Text>
            <AppButton onPress={board.retry}>다시 시도</AppButton>
          </>
        ) : board.data ? (
          <Text>이 게시물을 작성하거나 수정할 수 없어요.</Text>
        ) : (
          <ActivityIndicator />
        )}
      </InputPage>
    );
  return (
    <CardComposer
      key={cardId ?? `${slug}:${sectionId ?? ""}`}
      boardId={board.data.board.id}
      initialCard={card}
      sectionId={sectionId}
      order={order === undefined ? undefined : Number(order)}
      onCreated={board.invalidate}
    />
  );
}
