import { useLocalSearchParams, useRouter } from "expo-router";
import { CommentThread } from "../../components/CommentBottomSheet";
import { clearStudentFeedCache } from "../../lib/student-feed-cache";

export default function StudentCommentScreen({
  resourceKind = "card",
}: {
  resourceKind?: "card" | "feed";
}) {
  const { id = "", boardId } = useLocalSearchParams<{
    id: string;
    boardId?: string;
  }>();
  const router = useRouter();
  return (
    <CommentThread
      page
      visible
      cardId={id}
      boardId={boardId}
      resourceKind={resourceKind}
      onClose={() => router.back()}
      onCommentCountChange={() => {
        if (resourceKind === "feed") clearStudentFeedCache();
      }}
    />
  );
}
