import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { CommentThread, type CommentThreadProps } from "./comment-thread";

export { CommentThread } from "./comment-thread";

/** Student entry points navigate; parent threads keep their contextual sheet. */
export function CommentBottomSheet(props: CommentThreadProps) {
  const router = useRouter();
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => {
    if (!props.visible || !props.cardId || props.viewer === "parent") return;
    router.push({
      pathname:
        props.resourceKind === "feed"
          ? "/(student)/feed/[id]/comments"
          : "/(student)/card/[id]/comments",
      params: {
        id: props.cardId,
        ...(props.boardId ? { boardId: props.boardId } : {}),
      },
    });
    closeRef.current();
  }, [
    props.visible,
    props.cardId,
    props.boardId,
    props.resourceKind,
    props.viewer,
    router,
  ]);
  return props.viewer === "parent" ? <CommentThread {...props} /> : null;
}
