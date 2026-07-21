import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getApiBase } from "../lib/api";
import type { MobileWalkingTitle } from "../lib/slimes";
import { borders, colors, radii, spacing, typography } from "../theme/tokens";

type Props = {
  title: MobileWalkingTitle | null;
};

export function WalkingTitleSlot({ title }: Props) {
  if (!title) {
    return (
      <View style={styles.placeholder} accessibilityLabel="칭호 도전 중">
        <Text style={styles.placeholderText}>칭호 도전 중</Text>
      </View>
    );
  }

  const source = title.imagePath.startsWith("http")
    ? title.imagePath
    : `${getApiBase()}${title.imagePath}`;

  return (
    <View style={styles.frame} accessibilityRole="image" accessibilityLabel={`${title.label} 칭호`}>
      <Image source={{ uri: source }} style={styles.image} contentFit="contain" accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", height: spacing.xxl, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  placeholder: {
    width: "100%",
    minHeight: spacing.xxl,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  placeholderText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
});
