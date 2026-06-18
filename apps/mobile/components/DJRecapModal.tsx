import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  borders,
  colors,
  iconSizes,
  radii,
  recap,
  spacing,
  states,
  typography,
} from "../theme/tokens";
import { apiFetch, ApiError } from "../lib/api";
import { AppButton, AppModal, IconButton, Pill, SurfaceCard } from "./ui";

// DJ 월말 리캡 모달 (mobile). 웹 src/components/dj/DJRecapModal.tsx 의 네이티브 포팅.

type Song = {
  key: string;
  title: string;
  linkImage: string | null;
  videoId: string | null;
  plays: number;
  firstSubmitter: string | null;
};

type Submitter = {
  id: string | null;
  name: string;
  plays: number;
  uniqueSongs: number;
};

type RecapData = {
  period: { from: string; to: string; label: string };
  totals: {
    plays: number;
    uniqueSongs: number;
    uniqueSubmitters: number;
    totalMinutes: number;
  };
  topSongs: Song[];
  topSubmitters: Submitter[];
  byDay: Array<{ date: string; plays: number }>;
  spotlight: { topSong: Song | null; topSubmitter: Submitter | null };
};

export function DJRecapModal({
  open,
  boardId,
  boardTitle,
  onClose,
}: {
  open: boolean;
  boardId: string;
  boardTitle: string;
  onClose: () => void;
}) {
  const [month, setMonth] = useState<string>(currentMonth());
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch<RecapData>(
          `/api/dj/recap?boardId=${encodeURIComponent(boardId)}&month=${encodeURIComponent(month)}`,
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError) setError(`불러오기 실패 (${e.status})`);
          else setError(e instanceof Error ? e.message : "불러올 수 없어요");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, month]);

  const maxByDay = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.byDay.map((d) => d.plays));
  }, [data]);

  return (
    <AppModal
      visible={open}
      onClose={onClose}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.modal}
      accessibilityLabel="DJ 보드 이달의 리캡"
    >
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.eyebrow}>📊 이달의 리캡</Text>
          <Text style={styles.title}>{boardTitle}</Text>
        </View>
        <IconButton style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>×</Text>
        </IconButton>
      </View>

      <View style={styles.monthbar}>
        <AppButton
          variant="secondary"
          style={styles.monthBtn}
          textStyle={styles.monthBtnText}
          onPress={() => setMonth(shiftMonth(month, -1))}
        >
          ← {monthLabel(shiftMonth(month, -1))}
        </AppButton>
        <Pill tone="accent" textStyle={styles.monthPillText}>
          {monthLabel(month)}
        </Pill>
        <AppButton
          variant="secondary"
          style={styles.monthBtn}
          textStyle={styles.monthBtnText}
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= currentMonth()}
        >
          {monthLabel(shiftMonth(month, 1))} →
        </AppButton>
      </View>

          {loading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.emptyText}>불러오는 중…</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>😵</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : !data || data.totals.plays === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🎵</Text>
              <Text style={styles.emptyText}>이 달에는 아직 재생된 곡이 없어요.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
            >
              {/* 탑스탯 */}
              <View style={styles.stats}>
                <Stat label="총 재생" value={`${data.totals.plays}`} unit="곡" />
                <Stat label="고유 곡" value={`${data.totals.uniqueSongs}`} unit="개" />
                <Stat label="참여" value={`${data.totals.uniqueSubmitters}`} unit="명" />
                {data.totals.totalMinutes > 0 ? (
                  <Stat label="총 시간" value={`${data.totals.totalMinutes}`} unit="분" />
                ) : null}
              </View>

              {/* 스포트라이트 */}
              {data.spotlight.topSong || data.spotlight.topSubmitter ? (
                <View style={styles.spotlight}>
                  {data.spotlight.topSong ? (
                    <SurfaceCard style={[styles.spot, styles.spotSong]}>
                      <Text style={styles.spotLabel}>🎵 가장 많이 들은 곡</Text>
                      {data.spotlight.topSong.linkImage ? (
                        <Image
                          source={{ uri: data.spotlight.topSong.linkImage }}
                          style={styles.spotThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.spotThumb, styles.spotThumbFallback]}>
                          <Text style={styles.spotThumbEmoji}>♪</Text>
                        </View>
                      )}
                      <Text style={styles.spotTitle} numberOfLines={2}>
                        {data.spotlight.topSong.title}
                      </Text>
                      <Text style={styles.spotMeta}>{data.spotlight.topSong.plays}회 재생</Text>
                    </SurfaceCard>
                  ) : null}
                  {data.spotlight.topSubmitter ? (
                    <SurfaceCard style={[styles.spot, styles.spotDJ]}>
                      <Text style={styles.spotLabel}>🏆 이달의 DJ</Text>
                      <View style={styles.spotAvatar}>
                        <Text style={styles.spotAvatarText}>
                          {data.spotlight.topSubmitter.name[0]}
                        </Text>
                      </View>
                      <Text style={styles.spotTitle}>{data.spotlight.topSubmitter.name}</Text>
                      <Text style={styles.spotMeta}>
                        {data.spotlight.topSubmitter.plays}회 · {data.spotlight.topSubmitter.uniqueSongs}곡
                      </Text>
                    </SurfaceCard>
                  ) : null}
                </View>
              ) : null}

              {/* Top 곡 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top 10 곡</Text>
                {data.topSongs.map((song, i) => (
                  <View key={song.key} style={styles.songRow}>
                    <Text style={[styles.pos, i < 3 && styles.posTop]}>{i + 1}</Text>
                    {song.linkImage ? (
                      <Image source={{ uri: song.linkImage }} style={styles.songThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.songThumb, styles.spotThumbFallback]}>
                        <Text style={styles.spotThumbEmoji}>♪</Text>
                      </View>
                    )}
                    <View style={styles.songInfo}>
                      <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                      {song.firstSubmitter ? (
                        <Text style={styles.songSub}>첫 신청 {song.firstSubmitter}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.songPlays}>{song.plays}회</Text>
                  </View>
                ))}
              </View>

              {/* 제출자 랭킹 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>신청 TOP</Text>
                {data.topSubmitters.map((s, i) => (
                  <View key={`${s.id ?? s.name}`} style={styles.rankRow}>
                    <Text style={[styles.pos, i < 3 && styles.posTop]}>{i + 1}</Text>
                    <View style={[styles.rankAvatar, i === 0 && styles.rankAvatarTop]}>
                      <Text style={[styles.rankAvatarText, i === 0 && styles.rankAvatarTextTop]}>
                        {s.name[0]}
                      </Text>
                    </View>
                    <Text style={styles.rankName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.rankCount}>{s.plays}회 · {s.uniqueSongs}곡</Text>
                  </View>
                ))}
              </View>

              {/* 일별 bar */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>일별 재생</Text>
                <View style={styles.bars}>
                  {data.byDay.map((d) => {
                    const h = (d.plays / maxByDay) * recap.barFullPercent;
                    return (
                      <View key={d.date} style={styles.barCol}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${Math.max(recap.barMinPercent, h)}%` },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.barsXaxis}>
                  <Text style={styles.barsXtext}>{data.byDay[0]?.date.slice(5)}</Text>
                  <Text style={styles.barsXtext}>
                    {data.byDay[data.byDay.length - 1]?.date.slice(5)}
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
    </AppModal>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <SurfaceCard style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}> {unit}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </SurfaceCard>
  );
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m!, 10)}월`;
}

const styles = StyleSheet.create({
  backdrop: {
    padding: spacing.xl,
  },
  modal: {
    maxWidth: recap.modalMaxWidth,
    maxHeight: recap.modalMaxHeight,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headCopy: { flex: 1 },
  eyebrow: { ...typography.badge, color: colors.accent, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.text },
  closeBtn: {
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  closeText: { ...typography.subtitle, color: colors.textMuted },

  monthbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  monthBtn: {
    flexShrink: 1,
  },
  monthBtnText: { ...typography.micro, color: colors.textMuted },
  monthPillText: { ...typography.label, color: colors.accentTintedText },

  bodyScroll: {
    flexShrink: 1,
  },
  body: { padding: spacing.xl, gap: spacing.xl },
  emptyBox: {
    padding: spacing.xxxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.gate },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flex: 1,
    minWidth: recap.statMinWidth,
    padding: spacing.md,
    alignItems: "center",
  },
  statValue: { ...typography.display, color: colors.text },
  statUnit: { ...typography.label, color: colors.textMuted },
  statLabel: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },

  spotlight: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  spot: {
    flex: 1,
    minWidth: recap.spotMinWidth,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  spotSong: { backgroundColor: colors.recapSongBg, borderColor: colors.recapSongBorder },
  spotDJ: { backgroundColor: colors.recapDjBg, borderColor: colors.recapDjBorder },
  spotLabel: { ...typography.badge, color: colors.textMuted },
  spotThumb: {
    width: recap.spotThumbWidth,
    height: recap.spotThumbHeight,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  spotThumbFallback: {
    backgroundColor: colors.mediaLavender,
    alignItems: "center",
    justifyContent: "center",
  },
  spotThumbEmoji: { fontSize: iconSizes.md, color: colors.onAccent },
  spotAvatar: {
    width: recap.spotAvatarSize,
    height: recap.spotAvatarSize,
    borderRadius: radii.pill,
    backgroundColor: colors.rankingGold,
    alignItems: "center",
    justifyContent: "center",
  },
  spotAvatarText: { ...typography.display, color: colors.onAccent },
  spotTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  spotMeta: { ...typography.micro, color: colors.textMuted },

  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.text },

  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radii.btn,
  },
  pos: {
    width: recap.positionWidth,
    textAlign: "center",
    fontFamily: "monospace",
    ...typography.label,
    color: colors.textMuted,
  },
  posTop: { color: colors.rankingGold },
  songThumb: {
    width: recap.songThumbWidth,
    height: recap.songThumbHeight,
    borderRadius: radii.btn,
    backgroundColor: colors.surfaceAlt,
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { ...typography.label, color: colors.text },
  songSub: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },
  songPlays: { ...typography.label, color: colors.accent, fontVariant: ["tabular-nums"] },

  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rankAvatar: {
    width: recap.rankAvatarSize,
    height: recap.rankAvatarSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rankAvatarTop: { backgroundColor: colors.rankingGold },
  rankAvatarText: { ...typography.badge, color: colors.text },
  rankAvatarTextTop: { color: colors.onAccent },
  rankName: { flex: 1, ...typography.body, color: colors.text },
  rankCount: { ...typography.micro, color: colors.textMuted, fontVariant: ["tabular-nums"] },

  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: recap.barsHeight,
    backgroundColor: colors.bg,
    borderRadius: radii.btn,
    padding: spacing.md,
    gap: spacing.xs,
  },
  barCol: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  barFill: {
    backgroundColor: colors.accent,
    borderRadius: radii.btn,
    opacity: states.pressedOpacity,
    minHeight: spacing.xs,
  },
  barsXaxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  barsXtext: { ...typography.micro, color: colors.textFaint },
});
