import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "../../lib/api";
import {
  mergeKordleLiveEvents,
  type KordleLiveEvent,
} from "../../lib/kordle-live-feed";
import { useLiveSnapshot } from "../../lib/use-live-snapshot";
import {
  borders,
  colors,
  layers,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

type FeedResponse = {
  events: KordleLiveEvent[];
  serverTime: string;
};

const KORDLE_GUESS_SUBMITTED_EVENT = "guess-submitted";
export function KordleLiveFeed({ boardId }: { boardId: string }) {
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<KordleLiveEvent[]>([]);
  const sinceRef = useRef(new Date().toISOString());

  const refresh = useCallback(async () => {
    const result = await apiFetch<FeedResponse>(
      `/api/kordle/boards/${encodeURIComponent(boardId)}/feed?since=${encodeURIComponent(sinceRef.current)}`,
    );
    sinceRef.current = result.serverTime;
    setEvents((current) => mergeKordleLiveEvents(current, result.events));
  }, [boardId]);

  useLiveSnapshot({
    channelName: `kordle:board:${boardId}`,
    events: [KORDLE_GUESS_SUBMITTED_EVENT],
    reload: refresh,
  });

  if (events.length === 0) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityLabel="꼬들 라이브 채팅"
      accessibilityLiveRegion="polite"
      style={[styles.host, { top: insets.top + spacing.md }]}
    >
      {events.map((event) => (
        <View
          key={event.id}
          style={[styles.toast, event.isCorrect && styles.winnerToast]}
        >
          <Text style={styles.name}>{event.name}님</Text>
          <Text style={styles.message}>
            {event.isCorrect
              ? "정답을 맞췄습니다"
              : `${event.guessIndex}줄 · ${event.correctCount}글자`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: spacing.md,
    zIndex: layers.toast,
    alignItems: "flex-end",
    gap: spacing.sm,
    maxWidth: "88%",
  },
  toast: {
    minHeight: tapMin,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.text,
  },
  winnerToast: {
    borderColor: colors.warning,
    backgroundColor: colors.plantActive,
  },
  name: { ...typography.label, color: colors.onAccent, fontWeight: "800" },
  message: { ...typography.badge, color: colors.onAccent },
});
