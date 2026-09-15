import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { AlertCircle, CirclePlay } from "lucide-react-native";
import { ApiError, apiFetch, getApiUrl } from "../../lib/api";
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
import { useLiveSnapshot } from "../../lib/use-live-snapshot";
import { useGamePresenceScope } from "../../lib/use-game-presence";

type HubPayload = {
  statuses: Partial<Record<MobileOfficialGameKind, { label: string; playerCount: number; countKind: "participants" | "queue" }>>;
  channels: string[];
  presenceScopeIds?: string[];
  serverTimeMs?: number;
  nextRefreshAtMs?: number | null;
};

function HubSubscription({ channelName, reload, enabled }: { channelName: string; reload: () => Promise<void>; enabled: boolean }) {
  useLiveSnapshot({ channelName, events: ["game_hub_changed"], reload, enabled });
  return null;
}

type PresenceCounts = Partial<Record<MobileOfficialGameKind, number>>;

function HubPresenceSubscription({
  scopeId,
  enabled,
  onChange,
}: {
  scopeId: string;
  enabled: boolean;
  onChange: (scopeId: string, counts: PresenceCounts | null) => void;
}) {
  const participants = useGamePresenceScope({ scopeId, enabled });
  useEffect(() => {
    if (!participants) {
      onChange(scopeId, null);
      return;
    }
    const sets = new Map<MobileOfficialGameKind, Set<string>>();
    for (const participant of participants) {
      const kind = participant.gameKind as MobileOfficialGameKind;
      const students = sets.get(kind) ?? new Set<string>();
      students.add(participant.studentId);
      sets.set(kind, students);
    }
    onChange(
      scopeId,
      Object.fromEntries([...sets].map(([kind, students]) => [kind, students.size])) as PresenceCounts,
    );
  }, [onChange, participants, scopeId]);
  return null;
}

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
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [presenceByScope, setPresenceByScope] = useState<
    Record<string, PresenceCounts | null>
  >({});
  const [statusError, setStatusError] = useState(false);
  const [focused, setFocused] = useState(true);
  const sequence = useRef(0);
  const reloadStatus = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await apiFetch<HubPayload>("/api/game-hub/status");
      if (current !== sequence.current) return;
      setHub(next);
      setStatusError(false);
    } catch (error) {
      if (current === sequence.current) setStatusError(true);
      throw error;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPendingKind(null);
      setFocused(true);
      void reloadStatus().catch(() => undefined);
      return () => { ++sequence.current; setFocused(false); };
    }, [reloadStatus]),
  );

  useEffect(() => {
    if (!focused || hub?.nextRefreshAtMs == null || hub.serverTimeMs == null) return;
    const timer = setTimeout(() => {
      if (AppState.currentState === "active") void reloadStatus().catch(() => undefined);
    }, Math.max(0, hub.nextRefreshAtMs - hub.serverTimeMs));
    return () => clearTimeout(timer);
  }, [focused, hub, reloadStatus]);

  const updatePresence = useCallback(
    (scopeId: string, counts: PresenceCounts | null) => {
      setPresenceByScope((current) => ({ ...current, [scopeId]: counts }));
    },
    [],
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
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [gameKind]: error instanceof ApiError && (error.body as { error?: string } | null)?.error === "teacher_room_not_open"
          ? "선생님이 방을 열면 참여할 수 있어요." : "입장에 실패했어요.",
      }));
    } finally {
      // Navigation can unmount this screen before focus returns. Always clear
      // the busy lock so re-entry is available when the hub is shown again.
      setPendingKind(null);
    }
  }

  return (
    <View style={styles.root}>
      {hub?.channels?.map((channelName) => <HubSubscription key={channelName} channelName={channelName} reload={reloadStatus} enabled={focused} />)}
      {hub?.presenceScopeIds?.map((scopeId) => (
        <HubPresenceSubscription
          key={`presence:${scopeId}`}
          scopeId={scopeId}
          enabled={focused}
          onChange={updatePresence}
        />
      ))}
      {statusError && <ControlPressable accessibilityLabel="게임 상태 다시 확인" onPress={() => void reloadStatus().catch(() => undefined)}><Text style={styles.errorText}>게임 상태 다시 확인</Text></ControlPressable>}
      <View style={styles.grid}>
        {MOBILE_GAME_HUB_ORDER.map((kind) => {
          const game = MOBILE_GAME_CATALOG[kind];
          const pending = pendingKind === kind;
          const error = errors[kind];
          const livePresenceCount = Object.values(presenceByScope).reduce(
            (sum, counts) => sum + (counts?.[kind] ?? 0),
            0,
          );
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
                <Text style={styles.gameStatus}>
                  {statusError ? "상태 확인 필요" : hub?.statuses[kind]
                    ? `${hub.statuses[kind]!.label}${hub.statuses[kind]!.playerCount ? ` · ${hub.statuses[kind]!.playerCount}명 ${hub.statuses[kind]!.countKind === "queue" ? "대기" : "참가"}` : ""}${livePresenceCount > 0 ? ` · 접속 ${livePresenceCount}명` : ""}`
                    : "상태 확인 중"}
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
  gameStatus: { ...typography.micro, color: colors.textMuted },
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
