import { useRouter } from "expo-router";
import { FeedComposerForm } from "../../../components/FeedComposerForm";
import { useInputFeedback } from "../../../components/input-feedback-provider";
import { InputPage } from "../../../components/input-page";
import { ApiError, apiFetch } from "../../../lib/api";
import { feedApiMessage, type FeedDraft } from "../../../lib/feed";
import { clearSessionToken, getUnifiedLoginRoute } from "../../../lib/session";
import { clearStudentFeedCache } from "../../../lib/student-feed-cache";

export default function StudentFeedComposeScreen() {
  const router = useRouter();
  const notify = useInputFeedback();

  async function submit(draft: FeedDraft) {
    try {
      await apiFetch("/api/student/feed", { method: "POST", json: draft });
      clearStudentFeedCache();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        throw new Error("로그인이 만료되었어요.");
      }
      throw new Error(feedApiMessage(cause, "게시물을 저장하지 못했어요."));
    }
  }

  return (
    <InputPage title="새 게시물" onBack={() => router.back()}>
      <FeedComposerForm
        onSubmit={submit}
        onSuccess={() => notify("게시물을 등록했어요.")}
      />
    </InputPage>
  );
}
