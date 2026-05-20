import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import type { ObservationImageDTO } from "../../lib/types";

interface Props {
  images: ObservationImageDTO[];
}

/**
 * 단계별 사진 비교 — 첫 번째 사진과 마지막 사진을 나란히 보여줌.
 * 웹의 StageCompare (슬라이더)와 달리, 모바일에서는 좌우 배치로 간소화.
 * 이미지가 2장 미만이면 렌더하지 않음.
 */
export function StageCompare({ images }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (images.length < 2) return null;

  const first = images[0];
  const latest = images[images.length - 1];

  if (!expanded) {
    return (
      <Pressable style={styles.toggleBtn} onPress={() => setExpanded(true)}>
        <Text style={styles.toggleText}>📷 성장 비교 보기</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>📷 성장 비교</Text>
        <Pressable onPress={() => setExpanded(false)}>
          <Text style={styles.closeText}>접기</Text>
        </Pressable>
      </View>
      <View style={styles.compareRow}>
        <View style={styles.compareItem}>
          <Image
            source={{ uri: first.thumbnailUrl ?? first.url }}
            style={styles.compareImage}
            resizeMode="cover"
          />
          <Text style={styles.compareLabel}>처음</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.compareItem}>
          <Image
            source={{ uri: latest.thumbnailUrl ?? latest.url }}
            style={styles.compareImage}
            resizeMode="cover"
          />
          <Text style={styles.compareLabel}>최근</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  toggleText: {
    ...typography.label,
    color: colors.accent,
  },
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerText: {
    ...typography.label,
    color: colors.text,
  },
  closeText: {
    ...typography.label,
    color: colors.accent,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  compareItem: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  compareImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  compareLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  arrow: {
    fontSize: 20,
    color: colors.textMuted,
  },
});
