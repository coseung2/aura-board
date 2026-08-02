import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  fetchOwnGameRecords,
  mobileOutcomeLabel,
  type MobileGameRecord,
  type MobileGameRecordsResponse,
} from "../../lib/game-platform";
import {
  MOBILE_GAME_CATALOG,
  MOBILE_GAME_RECORD_RANGES,
  MOBILE_OFFICIAL_GAME_KINDS,
  type MobileGameRecordRange,
  type MobileOfficialGameKind,
} from "../../lib/game-platform-contract";
import {
  borders,
  colors,
  gamePlatform,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { AppButton, ControlPressable } from "../ui";

export type MobileGameRecordsPanelProps = {
  initialGameKind?: MobileOfficialGameKind | "all";
  initialRange?: MobileGameRecordRange;
  pageSize?: number;
};

function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null) return null;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function metricsSummary(record: MobileGameRecord): string[] {
  const metrics = record.metrics;
  switch (record.gameKind) {
    case "kordle":
      return [
        metrics.solved === true
          ? `${Number(metrics.guessesUsed ?? 0)}번 만에 성공`
          : "정답을 찾지 못함",
      ];
    case "speed-game":
      return [
        `${String(metrics.groupName ?? "모둠")} · ${Number(metrics.groupRank ?? 0)}위`,
        `${Number(metrics.correctCount ?? 0)}/${Number(metrics.totalRounds ?? 0)} 정답`,
      ];
    case "shadow-alliance":
      return [
        `${String(metrics.team ?? "팀")} · ${Number(metrics.rank ?? 0)}위`,
        `${Number(metrics.roundWins ?? 0)}승`,
      ];
    case "omok":
      return [
        metrics.side === "white" ? "백돌" : "흑돌",
        `${Number(metrics.moveCount ?? 0)}수`,
      ];
    case "song-guess":
      return [
        `${Number(metrics.rank ?? 0)}위`,
        `${Number(metrics.correctRounds ?? 0)}/${Number(metrics.totalRounds ?? 0)} 정답`,
      ];
  }
}

export function GameRecordsPanel({
  initialGameKind = "all",
  initialRange = "30d",
  pageSize = 20,
}: MobileGameRecordsPanelProps) {
  const [gameKind, setGameKind] = useState<MobileOfficialGameKind | "all">(
    initialGameKind,
  );
  const [range, setRange] = useState<MobileGameRecordRange>(initialRange);
  const [data, setData] = useState<MobileGameRecordsResponse | null>(null);
  const [records, setRecords] = useState<MobileGameRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      const requestId = ++requestRef.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      const controller = new AbortController();
      try {
        const response = await fetchOwnGameRecords({
          gameKind,
          range,
          limit: pageSize,
          cursor,
          signal: controller.signal,
        });
        if (requestId !== requestRef.current) return;
        setData(response);
        setRecords((current) =>
          append ? [...current, ...response.records] : response.records,
        );
        setNextCursor(response.nextCursor);
      } catch (caught) {
        if (requestId !== requestRef.current) return;
        if (!(caught instanceof Error && caught.name === "AbortError")) {
          setError("전적을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
      return () => controller.abort();
    },
    [gameKind, pageSize, range],
  );

  useEffect(() => {
    setRecords([]);
    setNextCursor(null);
    void load(null, false);
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const latestLabel = useMemo(() => {
    if (!data?.summary.latestCompletedAt) return "없음";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(data.summary.latestCompletedAt));
  }, [data?.summary.latestCompletedAt]);

  return (
    <View style={styles.root}>
      <Text selectable style={styles.eyebrow}>MY RECORDS</Text>
      <Text selectable style={styles.title}>나의 전적</Text>

      <View style={styles.filters} accessibilityRole="tablist">
        <FilterButton
          label="전체"
          active={gameKind === "all"}
          onPress={() => setGameKind("all")}
        />
        {MOBILE_OFFICIAL_GAME_KINDS.map((kind) => (
          <FilterButton
            key={kind}
            label={`${MOBILE_GAME_CATALOG[kind].displayName}${
              data?.facets[kind] == null ? "" : ` ${data.facets[kind]}`
            }`}
            active={gameKind === kind}
            onPress={() => setGameKind(kind)}
          />
        ))}
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {MOBILE_GAME_RECORD_RANGES.map((value) => (
          <FilterButton
            key={value}
            label={value === "all" ? "전체 기간" : value}
            active={range === value}
            onPress={() => setRange(value)}
          />
        ))}
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="플레이" value={String(data?.summary.totalPlays ?? 0)} />
        <SummaryCard label="완료" value={String(data?.summary.completedCount ?? 0)} />
        <SummaryCard
          label="최고 점수"
          value={
            data?.summary.bestScore == null
              ? "—"
              : data.summary.bestScore.toLocaleString("ko-KR")
          }
        />
        <SummaryCard label="최근 플레이" value={latestLabel} />
      </View>

      {loading ? (
        <View style={styles.stateBox} accessibilityState={{ busy: true }}>
          <ActivityIndicator color={colors.accent} />
          <Text selectable style={styles.muted}>전적을 불러오는 중이에요.</Text>
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Text selectable style={styles.error} accessibilityLiveRegion="assertive">
            {error}
          </Text>
          <ActionButton label="다시 시도" onPress={() => void load(null, false)} />
        </View>
      ) : records.length === 0 ? (
        <View style={styles.stateBox}>
          <Text selectable style={styles.emptyTitle}>아직 이 조건의 전적이 없어요.</Text>
          <Text selectable style={styles.muted}>
            게임을 끝내면 결과가 여기에 안전하게 기록됩니다.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {records.map((record) => {
            const duration = formatDuration(record.durationMs);
            return (
              <View style={styles.record} key={record.id}>
                <View style={styles.recordMain}>
                  <Text selectable style={styles.recordTitle}>
                    {MOBILE_GAME_CATALOG[record.gameKind].displayName} · {record.boardTitle}
                  </Text>
                  <Text selectable style={styles.recordMeta}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(record.completedAt))}
                    {duration ? ` · ${duration}` : ""}
                    {record.score == null
                      ? ""
                      : ` · ${record.score.toLocaleString("ko-KR")}점`}
                  </Text>
                  <View style={styles.badges}>
                    {metricsSummary(record).map((line) => (
                      <Text selectable style={styles.badge} key={line}>
                        {line}
                      </Text>
                    ))}
                  </View>
                </View>
                <Text selectable style={styles.outcome}>
                  {mobileOutcomeLabel(record.outcome)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {nextCursor && !loading ? (
        <ActionButton
          label={loadingMore ? "불러오는 중…" : "더 보기"}
          disabled={loadingMore}
          onPress={() => void load(nextCursor, true)}
        />
      ) : null}
    </View>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <ControlPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filterButton, active && styles.filterButtonActive]}
    >
      <Text selectable style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </ControlPressable>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text selectable style={styles.summaryLabel}>{label}</Text>
      <Text selectable style={[styles.summaryValue, styles.tabular]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={styles.actionButton}
    >
      {label}
    </AppButton>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterButton: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  filterText: { ...typography.badge, color: colors.text },
  filterTextActive: { color: colors.accentTintedText },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  summaryCard: {
    minWidth: gamePlatform.summaryMinWidth,
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderCurve: "continuous",
    backgroundColor: colors.bg,
  },
  summaryLabel: { ...typography.micro, color: colors.textMuted },
  summaryValue: { ...typography.subtitle, color: colors.text },
  stateBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: { ...typography.subtitle, color: colors.text, textAlign: "center" },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  list: { gap: spacing.md },
  record: {
    minHeight: gamePlatform.recordMinHeight,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderCurve: "continuous",
    backgroundColor: colors.bg,
  },
  recordMain: { flex: 1, gap: spacing.xs },
  recordTitle: { ...typography.label, color: colors.text },
  recordMeta: { ...typography.micro, color: colors.textMuted },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  badge: {
    ...typography.micro,
    color: colors.textMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  outcome: { ...typography.label, color: colors.text, textAlign: "right" },
  actionButton: {
    minHeight: tapMin,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderCurve: "continuous",
  },
  tabular: { fontVariant: ["tabular-nums"] },
});
