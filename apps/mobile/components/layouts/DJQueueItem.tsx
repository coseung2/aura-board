import { Image, StyleSheet, Text, View } from "react-native";
import {
  colors,
  dj,
  iconSizes,
  media,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import type { BoardCard } from "../../lib/types";
import { AppButton, IconButton, Pill } from "../ui";
import { resolveQueueAuthorName } from "./dj-queue-state";

type Props = {
  card: BoardCard;
  rank: number;
  onApprove: () => void;
  onReject: () => void;
  onMarkPlayed: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canControl: boolean;
};

export function DJQueueItem({
  card,
  rank,
  onApprove,
  onReject,
  onMarkPlayed,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  canControl,
}: Props) {
  const submitter = resolveQueueAuthorName(card);
  const status = card.queueStatus ?? "pending";
  const isPending = status === "pending";

  return (
    <View style={styles.queueItem}>
      <View style={styles.queueItemMain}>
        <Text style={styles.queueRank}>{rank}</Text>
        {card.linkImage ? (
          <Image
            source={{ uri: card.linkImage }}
            style={styles.queueThumb}
            resizeMode="cover"
            accessibilityLabel={`${card.title} 미리보기`}
          />
        ) : (
          <View style={[styles.queueThumb, styles.queueThumbFallback]}>
            <Text style={styles.queueThumbEmoji}>♪</Text>
          </View>
        )}
        <View style={styles.queueInfo}>
          <Text style={styles.queueTrack} numberOfLines={2}>
            {card.title}
          </Text>
          <View style={styles.queueSubRow}>
            {card.linkDesc ? (
              <Text style={styles.queueSub}>{card.linkDesc}</Text>
            ) : null}
            {submitter ? (
              <Text style={styles.queueSub}>
                {card.linkDesc ? " · " : ""}
                {submitter}
              </Text>
            ) : null}
            {isPending ? (
              <Pill
                tone="warning"
                style={styles.pendingPill}
                textStyle={styles.pendingText}
              >
                대기
              </Pill>
            ) : null}
          </View>
        </View>
        {canControl && isPending ? (
          <AppButton
            style={styles.queueApproveButton}
            textStyle={styles.queueApproveText}
            onPress={onApprove}
          >
            승인
          </AppButton>
        ) : null}
      </View>
      {canControl ? (
        <View style={styles.queueCtrls}>
          <IconButton
            style={styles.iconBtn}
            onPress={onMoveUp}
            disabled={!canMoveUp}
            accessibilityLabel="위로 이동"
          >
            <Text style={styles.iconBtnText}>↑</Text>
          </IconButton>
          <IconButton
            style={styles.iconBtn}
            onPress={onMoveDown}
            disabled={!canMoveDown}
            accessibilityLabel="아래로 이동"
          >
            <Text style={styles.iconBtnText}>↓</Text>
          </IconButton>
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={onMarkPlayed}
          >
            ✓
          </AppButton>
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={isPending ? onReject : onDelete}
          >
            {isPending ? "거부" : "제거"}
          </AppButton>
        </View>
      ) : isPending && card.isOwnPendingQueue ? (
        <View style={styles.queueCtrls}>
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={onDelete}
          >
            신청 취소
          </AppButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  queueItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  queueItemMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  queueRank: {
    width: dj.queueRankWidth,
    textAlign: "center",
    ...typography.label,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  queueThumb: {
    width: dj.queueThumbWidth,
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.btn,
    backgroundColor: colors.mediaLilac,
  },
  queueThumbFallback: { alignItems: "center", justifyContent: "center" },
  queueThumbEmoji: { fontSize: iconSizes.sm, color: colors.onAccent },
  queueInfo: { flex: 1, minWidth: 0 },
  queueApproveButton: { minHeight: tapMin, paddingHorizontal: spacing.md },
  queueApproveText: { ...typography.badge, color: colors.onAccent },
  queueTrack: { ...typography.label, color: colors.text },
  queueSubRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  queueSub: { ...typography.micro, color: colors.textMuted },
  pendingPill: { marginLeft: spacing.xs },
  pendingText: { ...typography.badge, color: colors.warningTintedText },
  queueCtrls: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  iconBtn: {
    width: dj.compactIconButton,
    height: dj.compactIconButton,
    backgroundColor: colors.transparent,
  },
  iconBtnText: { ...typography.label, color: colors.textMuted },
  ctrlBtn: {
    minHeight: dj.compactIconButton,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ctrlText: { ...typography.badge, color: colors.textMuted },
});
