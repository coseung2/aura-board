import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { colors, plant, radii, spacing, typography } from "../../theme/tokens";
import type { ObservationDTO } from "../../lib/types";
import { AppButton, SurfaceCard, SurfacePressable } from "../ui";

interface Props {
  observation: ObservationDTO;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (url: string) => void;
}

/**
 * 관찰 기록 카드 — 날짜, 메모, 이미지 썸네일, 수정/삭제 버튼.
 * 웹의 .plant-obs-card 와 시각적으로 동일.
 */
export function ObservationCard({ observation, canEdit, onEdit, onDelete, onOpenImage }: Props) {
  const dateStr = new Date(observation.observedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <SurfaceCard style={styles.card}>
      {/* 메타 (날짜) */}
      <View style={styles.meta}>
        <Text style={styles.date}>{dateStr}</Text>
        {canEdit && (
          <View style={styles.actionRow}>
            <AppButton
              variant="quiet"
              style={styles.actionBtn}
              textStyle={styles.actionText}
              onPress={onEdit}
            >
              수정
            </AppButton>
            <AppButton
              variant="quiet"
              style={styles.actionBtn}
              textStyle={styles.deleteText}
              onPress={onDelete}
            >
              삭제
            </AppButton>
          </View>
        )}
      </View>

      {/* 이미지 썸네일 */}
      {observation.images.length > 0 && (
        <FlatList
          horizontal
          data={observation.images}
          keyExtractor={(img) => img.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
          renderItem={({ item: img }) => (
            <SurfacePressable
              style={styles.thumbnailButton}
              onPress={() => onOpenImage(img.url)}
              accessibilityLabel="관찰 사진 열기"
            >
              <Image
                source={{ uri: img.thumbnailUrl ?? img.url }}
                style={styles.thumbnail}
                resizeMode="cover"
                accessibilityLabel="관찰 사진"
              />
            </SurfacePressable>
          )}
        />
      )}

      {/* 메모 */}
      {observation.memo ? (
        <Text style={styles.memo} numberOfLines={4}>
          {observation.memo}
        </Text>
      ) : null}

      {/* 사진 없음 사유 */}
      {observation.noPhotoReason ? (
        <Text style={styles.noPhotoReason}>
          사진 없음: {observation.noPhotoReason}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  date: {
    ...typography.micro,
    color: colors.textFaint,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    ...typography.micro,
    color: colors.accent,
  },
  deleteText: {
    ...typography.micro,
    color: colors.danger,
  },
  imageRow: {
    gap: spacing.sm,
  },
  thumbnailButton: {
    borderRadius: radii.btn,
    overflow: "hidden",
  },
  thumbnail: {
    width: plant.observationThumbWidth,
    height: plant.observationThumbHeight,
    borderRadius: radii.btn,
    backgroundColor: colors.surfaceAlt,
  },
  memo: {
    ...typography.body,
    color: colors.text,
  },
  noPhotoReason: {
    ...typography.micro,
    color: colors.textMuted,
    fontStyle: "italic",
  },
});
