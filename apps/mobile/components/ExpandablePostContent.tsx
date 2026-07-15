import { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, spacing, typography } from "../theme/tokens";
import { ControlPressable } from "./ui";

const DEFAULT_PREVIEW_CHARACTER_COUNT = 140;

type Props = {
  content: string;
  style: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  selectable?: boolean;
  characterLimit?: number;
};

export function ExpandablePostContent({
  content,
  style,
  containerStyle,
  selectable = true,
  characterLimit = DEFAULT_PREVIEW_CHARACTER_COUNT,
}: Props) {
  const normalizedContent = content.trim();
  const preview = useMemo(
    () => buildPostPreview(normalizedContent, characterLimit),
    [characterLimit, normalizedContent],
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [normalizedContent]);

  if (!normalizedContent) return null;

  return (
    <View style={containerStyle}>
      <Text selectable={selectable} style={style}>
        {expanded || !preview.truncated ? normalizedContent : preview.content}
      </Text>
      {preview.truncated ? (
        <ControlPressable
          style={styles.toggle}
          onPress={() => setExpanded((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "간단히 보기" : "더보기"}
        >
          <Text style={styles.toggleLabel}>
            {expanded ? "간단히 보기" : "… 더보기"}
          </Text>
        </ControlPressable>
      ) : null}
    </View>
  );
}

function buildPostPreview(content: string, characterLimit: number): {
  content: string;
  truncated: boolean;
} {
  const characters = Array.from(content);
  if (characters.length <= characterLimit) {
    return { content, truncated: false };
  }
  return {
    content: characters.slice(0, characterLimit).join("").trimEnd(),
    truncated: true,
  };
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.accentTintedText,
  },
});
