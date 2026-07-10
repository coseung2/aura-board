import { StyleSheet, Text, View } from "react-native";
import type { BoardDetailResponse } from "../../lib/types";
import { colors, spacing, typography } from "../../theme/tokens";
import { EmptyState, Pill } from "../ui";
import { ColumnsBoard } from "./ColumnsBoard";
import { ReadOnlyCardsBoard } from "./ReadOnlyCardsBoard";

export function BreakoutBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const access = data.layoutData.breakout;
  if (!access || data.sections.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="배정된 모둠 공간이 없어요"
          description="선생님이 모둠을 배정하면 사용할 수 있어요."
        />
      </View>
    );
  }

  if (access.status === "archived") {
    return (
      <View style={styles.root}>
        <View style={styles.notice}>
          <Pill tone="neutral">활동 종료</Pill>
          <Text style={styles.noticeText}>읽기 전용으로 보관된 모둠 활동이에요.</Text>
        </View>
        <ReadOnlyCardsBoard data={data} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.notice}>
        <Pill tone="accent">
          {access.visibility === "own-only" ? "내 모둠" : "다른 모둠 보기"}
        </Pill>
        <Text style={styles.noticeText}>서버가 허용한 모둠 공간만 표시합니다.</Text>
      </View>
      <ColumnsBoard
        data={data}
        onMutate={onMutate}
        writableSectionIds={access.writableSectionIds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  noticeText: { ...typography.badge, color: colors.textMuted, flex: 1 },
});
