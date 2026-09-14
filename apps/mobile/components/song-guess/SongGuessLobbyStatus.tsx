import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../ui";
import { borders, radii, spacing, typography } from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { SLIME_ASSET_COLORS, type SlimeColor } from "../../lib/slime-assets";
import { SlimeSprite } from "../slime/SlimeSprite";

type Props = {
  snapshot: SongGuessSnapshot;
  joined: boolean;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
};

export function SongGuessLobbyStatus({ snapshot, joined, pending, failed, onRetry }: Props) {
  const participants = snapshot.participants.filter((participant) => participant.joined !== false);
  const own = snapshot.viewer.participantIndex == null
    ? null
    : snapshot.participants[snapshot.viewer.participantIndex] ?? null;
  const friends = participants.filter((participant) => participant !== own);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.card}>
        {own?.representativePet ? (
          <View style={styles.heroPet}>
            <SlimeSprite
              slimeColor={toSlimeColor(own.representativePet.color)}
              growthStage={own.representativePet.growthStage}
              action="idle"
              displayScale={1.15}
              accessibilityLabel={`${own.displayName} 슬라임`}
            />
          </View>
        ) : null}
      <Text style={styles.title} selectable>
        {joined ? (own?.displayName ?? "게임에 입장했어요") : failed ? "입장하지 못했어요" : "게임에 입장하는 중이에요"}
      </Text>
      <Text style={styles.muted} selectable>
        {joined ? "입장 완료 · 선생님의 시작을 기다려요" : failed ? "다시 시도해 주세요." : "잠시만 기다려 주세요."}
      </Text>
      {!joined ? (
        <>
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
              {friends.map((participant, index) => (
                <View key={participant.participantId ?? `${participant.displayName}-${index}`} style={styles.participant}>
                  <View style={styles.participantPet}>
                    {participant.representativePet ? (
                      <SlimeSprite
                        slimeColor={toSlimeColor(participant.representativePet.color)}
                        growthStage={participant.representativePet.growthStage}
                        action="idle"
                        displayScale={0.48}
                        accessibilityLabel={`${participant.displayName} 슬라임`}
                      />
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
          <View style={styles.waitCard}>
            <Text style={styles.waitMuted}>선생님이 게임을 시작할 때까지</Text>
            <Text style={styles.waitTitle}>이 화면에서 기다려 주세요</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function toSlimeColor(value: string): SlimeColor {
  return (SLIME_ASSET_COLORS as readonly string[]).includes(value)
    ? (value as SlimeColor)
    : (SLIME_ASSET_COLORS[0] as SlimeColor);
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
  heroPet: { width: song.lobbyHeroPetSize, height: song.lobbyHeroPetSize, alignItems: "center", justifyContent: "center" },
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
  participantPet: { width: song.lobbyParticipantPetSize, height: song.lobbyParticipantPetSize, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  participantName: { ...typography.micro, maxWidth: song.lobbyParticipantNameMaxWidth, color: song.text, textAlign: "center" },
  emptyFriends: { ...typography.body, width: "100%", paddingVertical: spacing.xl, color: song.muted, textAlign: "center" },
  waitCard: { gap: spacing.xxs, padding: spacing.lg, borderRadius: song.answerRadius, backgroundColor: song.track, alignItems: "center" },
  waitMuted: { ...typography.body, color: song.muted, textAlign: "center" },
  waitTitle: { ...typography.label, color: song.text, textAlign: "center" },
});
