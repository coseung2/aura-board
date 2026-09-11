import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useInputFeedback } from "../../components/input-feedback-provider";
import { InputPage } from "../../components/input-page";
import { AssignmentSubmitForm } from "../../components/layouts/AssignmentBoard";
import { AppButton } from "../../components/ui";
import { useInputBoard } from "../../hooks/use-input-board";

export default function AssignmentSubmitScreen() {
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const notify = useInputFeedback();
  const board = useInputBoard(slug);
  const [now, setNow] = useState(Date.now);
  const slot = board.data?.layoutData.assignment?.slots.find(
    (item) => item.studentId === board.data?.currentStudent.id,
  );
  const dueAt = slot?.dueAt ?? board.data?.board.assignmentDeadline ?? null;
  useEffect(() => {
    if (!dueAt) return;
    const delay = new Date(dueAt).getTime() - Date.now() + 1;
    if (!Number.isFinite(delay)) return;
    if (delay <= 0) {
      if (now <= new Date(dueAt).getTime()) setNow(Date.now());
      return;
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(delay, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [dueAt, now]);
  const locked =
    slot?.submissionStatus === "orphaned" ||
    slot?.gradingStatus === "graded" ||
    slot?.gradingStatus === "released" ||
    Boolean(
      dueAt &&
      new Date(dueAt).getTime() < now &&
      board.data?.board.assignmentAllowLate === false,
    );
  if (!slot)
    return (
      <InputPage title="과제 제출" onBack={() => router.back()}>
        {board.error ? (
          <>
            <Text accessibilityRole="alert">{board.error}</Text>
            <AppButton onPress={board.retry}>다시 시도</AppButton>
          </>
        ) : board.data ? (
          <Text>제출할 수 있는 과제가 없어요.</Text>
        ) : (
          <ActivityIndicator />
        )}
      </InputPage>
    );
  return (
    <AssignmentSubmitForm
      key={slot.id}
      slotId={slot.id}
      dueAt={dueAt}
      canSubmit={!locked}
      unavailableReason={
        slot.submissionStatus === "orphaned"
          ? "이 과제는 더 이상 제출할 수 없어요. 선생님께 확인해 주세요."
          : slot.gradingStatus === "graded" || slot.gradingStatus === "released"
            ? "채점이 완료된 과제는 다시 제출할 수 없어요."
            : "제출 기한이 지나 제출할 수 없어요."
      }
      onSubmitted={(result) => {
        board.invalidate();
        notify(
          result.submittedOnTime === false
            ? "늦게 제출했어요. 제출은 저장되지만 보상은 없어요."
            : result.rewardAwarded && (result.rewardAmount ?? 0) > 0
              ? `기한 내 제출 보상 +${result.rewardAmount}원`
              : "과제를 제출했어요.",
        );
      }}
    />
  );
}
