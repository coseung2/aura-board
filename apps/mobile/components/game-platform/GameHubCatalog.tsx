import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { AlertCircle, CirclePlay } from "lucide-react-native";
import { apiFetch, getApiUrl } from "../../lib/api";
import {
  MOBILE_GAME_CATALOG,
  MOBILE_GAME_HUB_ORDER,
  type MobileOfficialGameKind,
} from "../../lib/game-platform-contract";
import {
  borders,
  colors,
  iconSizes,
  layout,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { ControlPressable } from "../ui";

type EntryResponse = {
  gameKind: MobileOfficialGameKind;
  boardId: string;
  boardSlug: string;
  href: string;
};

export function GameHubCatalog() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = 2;
  const horizontalPadding = width >= layout.mobileBreakpoint ? spacing.xxl : spacing.lg;
  const contentWidth = Math.max(
    0,
    Math.min(width, layout.readableMaxWidth) - horizontalPadding * 2,
  );
  const cardWidth = Math.max(
    1,
    Math.floor((contentWidth - spacing.md * (columns - 1)) / columns),
  );
  const [pendingKind, setPendingKind] =
    useState<MobileOfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<MobileOfficialGameKind, string>>
  >({});

  useFocusEffect(
    useCallback(() => {
      setPendingKind(null);
      return undefined;
    }, []),
  );

  async function enterGame(gameKind: MobileOfficialGameKind) {
    if (pendingKind) return;
    setPendingKind(gameKind);
    setErrors((current) => ({ ...current, [gameKind]: undefined }));
    try {
      const response = await apiFetch<EntryResponse>(
        "/api/student/game-hub/entry",
        {
          method: "POST",
          json: { gameKind },
        },
      );
      if (response.gameKind !== gameKind || !response.boardSlug) {
        throw new Error("invalid_game_hub_entry");
      }
      router.push(
        `/(student)/board/${encodeURIComponent(response.boardSlug)}?layout=${gameKind}` as Href,
      );
    } catch {
      setErrors((current) => ({
        ...current,
        [gameKind]: "입장에 실패했어요.",
      }));
    } finally {
      // Navigation can unmount this screen before focus returns. Always clear
      // the busy lock so re-entry is available when the hub is shown again.
      setPendingKind(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.grid}>
        {MOBILE_GAME_HUB_ORDER.map((kind) => {
          const game = MOBILE_GAME_CATALOG[kind];
          const pending = pendingKind === kind;
          const error = errors[kind];
          return (
            <View style={[styles.card, { width: cardWidth }]} key={kind}>
              <Image
                source={{
                  uri: getApiUrl(`/game-hub/${game.artworkKey}.png`),
                }}
                style={styles.artwork}
                contentFit="cover"
                accessible
                accessibilityLabel={`${game.displayName} 게임 대표 아트`}
              />
              <View style={styles.cardBody}>
                <Text selectable style={styles.cardTitle}>
                  {game.displayName}
                </Text>
                <ControlPressable
                  disabled={pendingKind !== null}
                  accessibilityLabel={`${game.displayName} 입장하기`}
                  accessibilityState={{ busy: pending, disabled: pendingKind !== null }}
                  onPress={() => void enterGame(kind)}
                  style={styles.entryButton}
                >
                  {pending ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <CirclePlay
                      size={iconSizes.sm}
                      color={colors.onAccent}
                      strokeWidth={2.3}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                  )}
                  <Text selectable style={styles.entryText}>
                    {pending ? "여는 중" : "입장"}
                  </Text>
                </ControlPressable>
                {error ? (
                  <View style={styles.error} accessibilityRole="alert">
                    <AlertCircle
                      size={iconSizes.sm}
                      color={colors.danger}
                      strokeWidth={2.2}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                    <Text selectable style={styles.errorText}>
                      {error}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  card: {
    minWidth: 0,
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  artwork: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceAlt,
  },
  cardBody: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  cardTitle: { ...typography.subtitle, color: colors.text },
  entryButton: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  entryText: { ...typography.label, color: colors.onAccent },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  errorText: { ...typography.micro, flex: 1, color: colors.danger },
});
