import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeedComposerForm } from "../../../components/FeedComposerForm";
import { AppHeader } from "../../../components/ui";
import { ApiError, apiFetch } from "../../../lib/api";
import { feedApiMessage, type FeedDraft } from "../../../lib/feed";
import {
  clearSessionToken,
  getUnifiedLoginRoute,
} from "../../../lib/session";
import { colors } from "../../../theme/tokens";

export default function StudentFeedComposeScreen() {
  const router = useRouter();

  async function submit(draft: FeedDraft) {
    try {
      await apiFetch("/api/student/feed", { method: "POST", json: draft });
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
    <SafeAreaView style={styles.page} edges={["top"]}>
      <AppHeader
        title="새 게시물"
        onBack={() => router.back()}
        showDailyBanner={false}
      />
      <FeedComposerForm onSubmit={submit} onSuccess={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
});
