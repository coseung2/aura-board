import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  dj,
  iconSizes,
  media,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import type { BoardCard } from "../../lib/types";
import { AppModal, IconButton } from "../ui";
import { resolveQueueAuthorName } from "./dj-queue-state";

type Props = {
  open: boolean;
  played: BoardCard[];
  canControl: boolean;
  onClose: () => void;
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

export function DJPlayedDrawer({
  open,
  played,
  canControl,
  onClose,
  onRestore,
  onDelete,
}: Props) {
  return (
    <AppModal
      visible={open}
      animationType="slide"
      onClose={onClose}
      align="right"
      closeOnBackdropPress
      sheetStyle={styles.drawer}
      accessibilityLabel="재생 완료 목록"
    >
      <View style={styles.head}>
        <View style={styles.copy}>
          <Text style={styles.title}>재생 완료</Text>
          <Text style={styles.subtitle}>대기열로 복귀시킬 수 있습니다</Text>
        </View>
        <IconButton
          style={styles.close}
          onPress={onClose}
          accessibilityLabel="닫기"
        >
          <Text style={styles.closeText}>×</Text>
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {played.length === 0 ? (
          <Text style={styles.empty}>재생 완료된 곡이 없습니다.</Text>
        ) : (
          played.map((card) => (
            <View
              key={card.id}
              style={styles.item}
            >
              {card.linkImage ? (
                <Image
                  source={{ uri: card.linkImage }}
                  style={styles.thumb}
                  resizeMode="cover"
                  accessibilityLabel={`${card.title} 미리보기`}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={styles.thumbEmoji}>♪</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {card.title}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {card.linkDesc ? `${card.linkDesc} · ` : ""}
                  {resolveQueueAuthorName(card)}
                </Text>
              </View>
              {canControl ? (
                <>
                  <IconButton
                    style={styles.action}
                    onPress={() => onRestore(card.id)}
                    accessibilityLabel="대기열로 복귀"
                  >
                    <Text style={styles.actionText}>↺</Text>
                  </IconButton>
                  <IconButton
                    style={styles.action}
                    onPress={() => onDelete(card.id)}
                    accessibilityLabel="재생 완료 곡 삭제"
                  >
                    <Text style={styles.actionDanger}>×</Text>
                  </IconButton>
                </>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.foot}>
        <Text style={styles.footText}>총 {played.length}곡 재생됨</Text>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  drawer: {
    width: dj.drawerWidth,
    height: "100%",
    maxHeight: "100%",
    borderRadius: radii.none,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  copy: { flex: 1 },
  title: { ...typography.section, color: colors.text },
  subtitle: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  close: { borderWidth: borders.hairline, borderColor: colors.border },
  closeText: { ...typography.subtitle, color: colors.textMuted },
  list: { padding: spacing.sm, gap: spacing.xs },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    padding: spacing.xl,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.btn,
  },
  thumb: {
    width: dj.drawerThumbWidth,
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.btn,
    backgroundColor: colors.mediaNeutral,
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  thumbEmoji: { fontSize: iconSizes.sm, color: colors.onAccent },
  info: { flex: 1, minWidth: 0 },
  itemTitle: { ...typography.label, color: colors.text },
  itemSub: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  action: { borderRadius: radii.btn },
  actionText: { ...typography.label, color: colors.textMuted },
  actionDanger: { ...typography.label, color: colors.danger },
  foot: {
    padding: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  footText: { ...typography.micro, color: colors.textMuted },
});
