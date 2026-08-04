import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { slimeBuffChipTier } from "../../lib/slime-shop-presentation";
import {
  iconSizes,
  layers,
  spacing,
  typography,
  colors,
} from "../../theme/tokens";

const BUFF_TIER_ICON = {
  bronze: require("../../assets/ui/buff-tiers/buff-tier-bronze.png"),
  silver: require("../../assets/ui/buff-tiers/buff-tier-silver.png"),
  gold: require("../../assets/ui/buff-tiers/buff-tier-gold.png"),
} as const;

type SlimeBuffTierChipProps = {
  label: string;
  bps: number;
};

/** Native counterpart of the web item-preview buff metadata chip. */
export function SlimeBuffTierChip({ label, bps }: SlimeBuffTierChipProps) {
  const tier = slimeBuffChipTier(bps);
  return (
    <View style={styles.root} pointerEvents="none" accessible={false}>
      <Image
        source={BUFF_TIER_ICON[tier]}
        style={styles.icon}
        contentFit="contain"
      />
      <Text
        style={styles.text}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    zIndex: layers.cardOverlay,
    top: spacing.xs,
    left: spacing.xs,
    maxWidth: "92%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.xxs,
  },
  icon: { width: iconSizes.sm, height: iconSizes.sm, flexShrink: 0 },
  text: {
    ...typography.micro,
    flexShrink: 1,
    color: colors.text,
    textAlign: "left",
    includeFontPadding: false,
  },
});
