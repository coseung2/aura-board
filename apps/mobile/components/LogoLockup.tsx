import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, spacing, typography } from "../theme/tokens";

type LogoLockupProps = {
  size?: number;
  withWordmark?: boolean;
  style?: StyleProp<ViewStyle>;
  wordmarkStyle?: StyleProp<TextStyle>;
};

export function LogoLockup({
  size = 32,
  withWordmark = true,
  style,
  wordmarkStyle,
}: LogoLockupProps) {
  return (
    <View style={[styles.root, style]}>
      <Image
        source={require("../assets/icon.png")}
        style={[
          styles.icon,
          { width: size, height: size, borderRadius: size * 0.22 },
        ]}
        resizeMode="contain"
        accessibilityLabel="Aura-board"
      />
      {withWordmark ? (
        <Text style={[styles.wordmark, wordmarkStyle]}>Aura-board</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    backgroundColor: colors.surfaceAlt,
  },
  wordmark: {
    ...typography.label,
    color: colors.text,
  },
});
