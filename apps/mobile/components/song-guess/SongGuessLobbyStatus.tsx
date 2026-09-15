import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../ui";
import { borders, radii, spacing, typography } from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { GAME_PET_SIZES } from "../../lib/game-participant-pet";
import { GameParticipantPet } from "../game-platform/GameParticipantPet";

type Props = {
  studentId?: string;
  snapshot: SongGuessSnapshot;
  joined: boolean;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
};

export function SongGuessLobbyStatus({ snapshot, studentId, joined, pending, failed, onRetry }: Props) {
  const participants = snapshot.participants.filter((participant) => participant.joined !== false);
  const own = studentId ? snapshot.participants.find((participant) => participant.participantId === studentId) ?? null : null;
  const friends = participants.filter((participant) => participant !== own);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.card}>
        {own?.representativePet ? (
          <View style={styles.heroPet}>
            <GameParticipantPet name={own.displayName} pet={own.representativePet} size={GAME_PET_SIZES.emphasis} />
          </View>
        ) : null}
      <Text style={styles.title} selectable>
        {joined ? (own?.displayName ?? "게임에 입장했어요") : failed ? "입장하지 못했어요" : "게임에 입장하는 중이에요"}
      </Text>
      {!joined ? (
        <>
          <Text style={styles.muted} selectable>
            {failed ? "다시 시도해 주세요." : "잠시만 기다려 주세요."}
          </Text>
          <Text style={styles.status} selectable>
            {pending ? "입장 중…" : failed ? "입장하지 못했어요." : "입장 준비 중…"}
          </Text>
          {failed ? (
            <AppButton
              variant="secondary"
              style={styles.retryButton}
              textStyle={styles.retryButtonText}
              onPress={onRetry}
              accessibilityLabel="게임 입장 다시 시도"
            >
              다시 시도
            </AppButton>
          ) : null}
        </>
      ) : null}
      </View>
      {participants.length ? (
        <>
          <View style={styles.friendsHeading}>
            <Text style={styles.friendsTitle}>함께 들어온 친구</Text>
            <Text style={styles.friendsCount}>{participants.length}명</Text>
          </View>
          <View style={styles.participantPanel}>
            <View style={styles.participantGrid}>
              {friends.map((participant) => (
                <View key={participant.participantId} style={styles.participant}>
                  <View style={styles.participantPet}>
                    {participant.representativePet ? (
                      <GameParticipantPet name={participant.displayName} pet={participant.representativePet} size={GAME_PET_SIZES.compact} />
                    ) : null}
                  </View>
                  <Text style={styles.participantName} numberOfLines={1}>{participant.displayName}</Text>
                </View>
              ))}
              {friends.length === 0 ? (
                <Text style={styles.emptyFriends}>친구들이 들어오기를 기다리고 있어요</Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    minHeight: song.lobbyCardMinHeight,
    borderRadius: song.answerRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
    alignItems: "center",
  },
  heroPet: { width: GAME_PET_SIZES.emphasis, height: GAME_PET_SIZES.emphasis, alignItems: "center", justifyContent: "center" },
  title: { ...typography.title, color: song.text, textAlign: "center" },
  muted: { ...typography.body, color: song.muted, textAlign: "center" },
  status: { ...typography.label, color: song.accent, textAlign: "center" },
  retryButton: { borderRadius: radii.control, borderColor: song.borderStrong, backgroundColor: song.track },
  retryButtonText: { color: song.text },
  friendsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  friendsTitle: { ...typography.label, color: song.text },
  friendsCount: { ...typography.badge, color: song.muted },
  participantPanel: { minHeight: song.lobbyParticipantPanelMinHeight, padding: spacing.md, borderRadius: song.answerRadius, backgroundColor: song.panel },
  participantGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.md },
  participant: { width: "25%", alignItems: "center", gap: spacing.xs },
  participantPet: { width: GAME_PET_SIZES.compact, height: GAME_PET_SIZES.compact, alignItems: "center", justifyContent: "center" },
  participantName: { ...typography.micro, maxWidth: song.lobbyParticipantNameMaxWidth, color: song.text, textAlign: "center" },
  emptyFriends: { ...typography.body, width: "100%", paddingVertical: spacing.xl, color: song.muted, textAlign: "center" },
});
