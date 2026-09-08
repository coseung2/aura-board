import { StyleSheet, Text, View } from "react-native";
import { SLIME_ASSET_COLORS, type SlimeColor } from "../../lib/slime-assets";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import {
  borders,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";
import { SlimeSprite } from "../slime/SlimeSprite";

type RankedSongGuessParticipant = SongGuessSnapshot["participants"][number] & {
  rank: number;
};

export function SongGuessScoreboard({
  snapshot,
}: {
  snapshot: SongGuessSnapshot;
}) {
  const ranked = rankParticipants(snapshot.participants);
  return (
    <>
      {snapshot.phase === "reveal" || snapshot.phase === "finished" ? (
        <View style={styles.revealCard} accessibilityLiveRegion="polite">
          <Text style={styles.revealTitle} selectable>
            {snapshot.phase === "finished" ? "최종 포디엄" : "이번 라운드 결과"}
          </Text>
          <View style={styles.revealRows}>
            {(snapshot.phase === "finished"
              ? podiumParticipants(ranked)
              : ranked.slice(0, 5)
            ).map((participant) => (
              <ScoreParticipantRow
                key={`${participant.participantId ?? participant.displayName}-${participant.rank}`}
                participant={participant}
                showRoundScore
                podium={snapshot.phase === "finished"}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.scoreCard}>
        <Text style={styles.scoreHeading} selectable>
          전체 순위
        </Text>
        {ranked.length ? (
          ranked.map((participant) => (
            <ScoreParticipantRow
              key={`${participant.participantId ?? participant.displayName}-overall`}
              participant={participant}
              showMovement={snapshot.phase !== "lobby"}
            />
          ))
        ) : (
          <Text style={styles.muted}>점수 없음</Text>
        )}
      </View>
    </>
  );
}

function rankParticipants(
  participants: SongGuessSnapshot["participants"],
): RankedSongGuessParticipant[] {
  const sorted = [...participants].sort(
    (left, right) =>
      (right.joined === false ? -1 : 0) - (left.joined === false ? -1 : 0) ||
      right.score - left.score ||
      left.displayName.localeCompare(right.displayName),
  );
  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((participant, index) => {
    const rank =
      index > 0 && participant.score === previousScore
        ? previousRank
        : index + 1;
    previousScore = participant.score;
    previousRank = rank;
    return { ...participant, rank };
  });
}

function podiumParticipants(
  participants: RankedSongGuessParticipant[],
): RankedSongGuessParticipant[] {
  const podiumOrder = new Map([
    [2, 0],
    [1, 1],
    [3, 2],
  ]);
  return participants
    .filter((participant) => participant.rank <= 3)
    .sort(
      (left, right) =>
        (podiumOrder.get(left.rank) ?? 9) -
          (podiumOrder.get(right.rank) ?? 9) ||
        left.displayName.localeCompare(right.displayName),
    );
}

function ScoreParticipantRow({
  participant,
  showRoundScore = false,
  showMovement = false,
  podium = false,
}: {
  participant: RankedSongGuessParticipant;
  showRoundScore?: boolean;
  showMovement?: boolean;
  podium?: boolean;
}) {
  const pet = participant.representativePet;
  const movement =
    typeof participant.previousRank === "number"
      ? participant.previousRank - participant.rank
      : 0;
  return (
    <View style={[styles.scoreRow, podium && styles.podiumRow]}>
      <Text style={[styles.rank, podium && styles.podiumRank]} selectable>
        {participant.rank}
      </Text>
      <View style={styles.scoreAvatar}>
        {pet ? (
          <SlimeSprite
            slimeColor={toSlimeColor(pet.color)}
            growthStage={pet.growthStage}
            action="idle"
            displayScale={0.45}
            accessibilityLabel={`${participant.displayName} 슬라임`}
          />
        ) : (
          <Text style={styles.scoreAvatarFallback} selectable>
            {participant.displayName.slice(0, 1)}
          </Text>
        )}
      </View>
      <View style={styles.scoreIdentity}>
        <Text style={styles.playerName} numberOfLines={1} selectable>
          {participant.displayName}
        </Text>
        {participant.joined === false ? (
          <Text style={styles.unjoinedLabel} selectable>
            미입장
          </Text>
        ) : null}
      </View>
      {showMovement && movement !== 0 ? (
        <Text style={movement > 0 ? styles.rankUp : styles.rankDown} selectable>
          {movement > 0 ? `↑${movement}` : `↓${Math.abs(movement)}`}
        </Text>
      ) : null}
      {showRoundScore ? (
        <Text style={styles.roundScore} selectable>
          +{participant.roundScore ?? 0}
        </Text>
      ) : null}
      <Text style={styles.score} selectable>
        {participant.score.toLocaleString("ko-KR")}
      </Text>
    </View>
  );
}

function toSlimeColor(value: string): SlimeColor {
  return (SLIME_ASSET_COLORS as readonly string[]).includes(value)
    ? (value as SlimeColor)
    : (SLIME_ASSET_COLORS[0] as SlimeColor);
}

const styles = StyleSheet.create({
  revealCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },
  revealTitle: { ...typography.title, color: song.text, textAlign: "center" },
  revealRows: { gap: spacing.sm },
  scoreCard: {
    gap: spacing.sm,
    borderTopWidth: borders.hairline,
    borderColor: song.border,
    paddingTop: spacing.md,
  },
  scoreHeading: { ...typography.label, color: song.muted },
  scoreRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  podiumRow: {
    paddingVertical: spacing.sm,
    backgroundColor: song.track,
    borderRadius: radii.control,
  },
  podiumRank: { color: song.accent },
  scoreAvatar: {
    width: spacing.xxl,
    height: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  scoreAvatarFallback: { ...typography.label, color: song.accent },
  scoreIdentity: { flex: 1, minWidth: 0, gap: spacing.xxs },
  rank: { ...typography.subtitle, width: spacing.xxl, color: song.muted },
  playerName: { ...typography.body, flex: 1, color: song.text },
  unjoinedLabel: { ...typography.micro, color: song.muted },
  rankUp: { ...typography.badge, color: song.success },
  rankDown: { ...typography.badge, color: song.danger },
  roundScore: { ...typography.badge, color: song.accent },
  score: { ...typography.subtitle, color: song.text },
  muted: { ...typography.body, color: song.muted },
});
