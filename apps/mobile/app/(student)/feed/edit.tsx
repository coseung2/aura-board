import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text } from "react-native";
import { FeedComposerForm } from "../../../components/FeedComposerForm";
import { useInputFeedback } from "../../../components/input-feedback-provider";
import { InputPage } from "../../../components/input-page";
import { apiFetch } from "../../../lib/api";
import { clearStudentFeedCache } from "../../../lib/student-feed-cache";
import { useFeedEditor } from "../../../screens/student/feed-editor-context";

export default function FeedEditScreen() {
  const router = useRouter();
  const { post, clear } = useFeedEditor();
  const notify = useInputFeedback();
  useEffect(() => clear, [clear]);
  return (
    <InputPage title="게시물 수정" onBack={() => router.back()}>
      {post?.canEdit ? (
        <FeedComposerForm
          initialDraft={{
            title: post.title,
            body: post.body,
            media: post.media.map(({ kind, url, altText }) => ({
              kind,
              url,
              altText,
            })),
          }}
          submitLabel="수정 저장"
          onSubmit={async (draft) => {
            await apiFetch(
              `/api/student/feed/${encodeURIComponent(post.postId)}`,
              { method: "PATCH", json: draft },
            );
            clearStudentFeedCache();
          }}
          onSuccess={() => notify("게시물을 수정했어요.")}
        />
      ) : (
        <Text>목록에서 수정할 게시물을 다시 선택해 주세요.</Text>
      )}
    </InputPage>
  );
}
