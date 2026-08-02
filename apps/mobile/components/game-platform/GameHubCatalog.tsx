import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { type Href, useRouter } from "expo-router";
import { AlertCircle, CirclePlay, Radio } from "lucide-react-native";
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
  radii,
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
  const columns = width >= 720 ? 2 : 1;
  const horizontalPadding = width >= layout.mobileBreakpoint ? spacing.xxl : spacing.lg;
  const contentWidth = Math.max(
    0,
    Math.min(width, layout.readableMaxWidth) - horizontalPadding * 2,
  );
  const cardWidth = Math.max(
    1,
    Math.floor((contentWidth - spacing.lg * (columns - 1)) / columns),
  );
  const [pendingKind, setPendingKind] =
    useState<MobileOfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<MobileOfficialGameKind, string>>
  >({});

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
        [gameKind]: "게임 방을 열지 못했어요. 잠시 후 다시 시도해 주세요.",
      }));
      setPendingKind(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text selectable style={styles.eyebrow}>GAME HUB</Text>
        <Text selectable style={styles.title} accessibilityRole="header">
          바로 입장하는 게임
        </Text>
        <Text selectable style={styles.description}>
          선생님이 별도 보드를 만들지 않아도 다섯 게임을 항상 확인하고 입장할
          수 있어요. 필요한 문제나 참가자는 게임 안에서 안전하게 안내합니다.
        </Text>
      </View>

      <View style={styles.grid}>
        {MOBILE_GAME_HUB_ORDER.map((kind) => {
          const game = MOBILE_GAME_CATALOG[kind];
          const pending = pendingKind === kind;
          const error = errors[kind];
          return (
            <View style={[styles.card, { width: cardWidth }]} key={kind}>
              <Image
                source={{
                  uri: getApiUrl(`/api/game-hub/art/${game.artworkKey}`),
                }}
                style={styles.artwork}
                contentFit="cover"
                accessible
                accessibilityLabel={`${game.displayName} 게임 대표 아트`}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text selectable style={styles.cardTitle}>
                    {game.displayName}
                  </Text>
                  <View style={styles.status}>
                    <Radio
                      size={iconSizes.sm}
                      color={colors.plantActive}
                      strokeWidth={2.4}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                    <Text selectable style={styles.statusText}>
                      {game.statusLabel}
                    </Text>
                  </View>
                </View>
                <Text selectable style={styles.cardDescription}>
                  {game.description}
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
                    {pending ? "게임 방 여는 중…" : "입장하기"}
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
  root: { gap: spacing.xl },
  intro: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  card: {
    minWidth: 0,
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  artwork: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceAlt,
  },
  cardBody: {
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardTitle: { ...typography.subtitle, flex: 1, color: colors.text },
  status: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.plantVisited,
    borderRadius: radii.pill,
    backgroundColor: colors.noticeSuccessBg,
  },
  statusText: { ...typography.micro, color: colors.plantActive },
  cardDescription: {
    ...typography.body,
    minHeight: tapMin,
    color: colors.textMuted,
  },
  entryButton: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.accent,
    borderRadius: radii.control,
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
