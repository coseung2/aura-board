import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFonts } from "expo-font";
import { ApiError, apiFetch } from "../../lib/api";
import type {
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "../../lib/shadow-alliance";
import type { BoardDetailResponse } from "../../lib/types";
import {
  shadowAllianceColors as SHADOW,
  shadowAllianceStyles as styles,
} from "../../theme/shadow-alliance";
import { ControlPressable, TextField } from "../ui";

const { Cinzel_500Medium } = require("@expo-google-fonts/cinzel/500Medium") as {
  Cinzel_500Medium: number;
};
const { Cinzel_700Bold } = require("@expo-google-fonts/cinzel/700Bold") as {
  Cinzel_700Bold: number;
};
const { Cinzel_900Black } = require("@expo-google-fonts/cinzel/900Black") as {
  Cinzel_900Black: number;
};
const { JetBrainsMono_500Medium } = require(
  "@expo-google-fonts/jetbrains-mono/500Medium",
) as { JetBrainsMono_500Medium: number };
const { JetBrainsMono_700Bold } = require(
  "@expo-google-fonts/jetbrains-mono/700Bold",
) as { JetBrainsMono_700Bold: number };
const { NanumMyeongjo_400Regular } = require(
  "@expo-google-fonts/nanum-myeongjo/400Regular",
) as { NanumMyeongjo_400Regular: number };
const { NanumMyeongjo_700Bold } = require(
  "@expo-google-fonts/nanum-myeongjo/700Bold",
) as { NanumMyeongjo_700Bold: number };
const { NanumMyeongjo_800ExtraBold } = require(
  "@expo-google-fonts/nanum-myeongjo/800ExtraBold",
) as { NanumMyeongjo_800ExtraBold: number };

type Props = { data: BoardDetailResponse };
type ParticipantAction = "join" | "ready" | "forfeit" | "submit";
type RevealKey = "nick" | "team" | "power";

type PendingCommand = {
  requestId: string;
  runId: string;
  expectedVersion: number;
  fingerprint: string;
};

function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function commandError(caught: unknown): {
  error?: string;
  snapshot?: ShadowAllianceSnapshot;
} {
  if (!(caught instanceof ApiError) || !caught.body || typeof caught.body !== "object") {
    return {};
  }
  return caught.body as {
    error?: string;
    snapshot?: ShadowAllianceSnapshot;
  };
}

function errorLabel(code: string | undefined): string {
  switch (code) {
    case "version_conflict":
      return "다른 기기에서 상태가 바뀌어 최신 게임을 반영했어요.";
    case "already_submitted":
      return "이번 라운드 숫자는 이미 제출됐어요.";
    case "round_expired":
      return "제출 시간이 끝났어요.";
    case "invalid_number":
      return "1부터 100 사이의 정수를 입력해 주세요.";
    case "storage_error":
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
    default:
      return "요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
  }
}

function teamLabel(team: ShadowAllianceTeam): string {
  if (team === "black") return "블랙 연합";
  if (team === "white") return "화이트 연합";
  return "배정 대기";
}

function teamRevealLabel(team: ShadowAllianceTeam): string {
  if (team === "black") return `⚫ ${teamLabel(team)}`;
  if (team === "white") return `⚪ ${teamLabel(team)}`;
  return "◌ 배정 대기";
}

function connectionLabel(connection: string): string {
  if (connection === "connected") return "실시간 연결";
  if (connection === "reconnecting") return "연결 복구 중";
  if (connection === "offline") return "연결 끊김";
  return "연결 중";
}

function ShadowActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <ControlPressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        variant === "primary" ? styles.actionPrimary : styles.actionGhost,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          variant === "primary" ? styles.actionPrimaryText : styles.actionGhostText,
        ]}
      >
        {label}
      </Text>
    </ControlPressable>
  );
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ShadowAllianceBoard({ data }: Props) {
  const [gameFontsLoaded, gameFontError] = useFonts({
    Cinzel_500Medium,
    Cinzel_700Bold,
    Cinzel_900Black,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    NanumMyeongjo_400Regular,
    NanumMyeongjo_700Bold,
    NanumMyeongjo_800ExtraBold,
  });
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberDraft, setNumberDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<RevealKey | null>(null);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [clockNow, setClockNow] = useState(Date.now());
  const commandRef = useRef<PendingCommand | null>(null);
  const joinedRunRef = useRef<string | null>(null);
  const readyRunRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const acceptSnapshot = useCallback((next: ShadowAllianceSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    const now = Date.now();
    setReceivedAt(now);
    setClockNow(now);
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "retry" = "refresh") => {
      if (mode === "initial") setLoading(true);
      else if (mode === "retry") setReconnecting(true);
      try {
        const response = await apiFetch<{ snapshot: ShadowAllianceSnapshot }>(
          `/api/shadow-alliance/boards/${encodeURIComponent(data.board.id)}`,
        );
        acceptSnapshot(response.snapshot);
        setError(null);
        return response.snapshot;
      } catch (caught) {
        const body = commandError(caught);
        if (mode !== "refresh" || !snapshotRef.current) {
          setError(errorLabel(body.error));
        }
        return null;
      } finally {
        setLoading(false);
        if (mode === "retry") setReconnecting(false);
      }
    },
    [acceptSnapshot, data.board.id],
  );

  const command = useCallback(
    async (action: ParticipantAction, number?: number) => {
      const current = snapshotRef.current;
      if (!current) return null;
      const fingerprint = JSON.stringify({
        action,
        number: number ?? null,
        phase: current.phase,
        round: current.round,
      });
      const pending = commandRef.current;
      const envelope =
        pending &&
        pending.runId === current.id &&
        pending.expectedVersion === current.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: createRequestId(`shadow_${action}`),
              runId: current.id,
              expectedVersion: current.version,
              fingerprint,
            };
      commandRef.current = envelope;
      setBusy(true);
      setError(null);
      try {
        const response = await apiFetch<{ snapshot: ShadowAllianceSnapshot }>(
          `/api/shadow-alliance/boards/${encodeURIComponent(data.board.id)}`,
          {
            method: "PATCH",
            json: {
              requestId: envelope.requestId,
              runId: envelope.runId,
              expectedVersion: envelope.expectedVersion,
              action,
              ...(number === undefined ? {} : { number }),
            },
          },
        );
        commandRef.current = null;
        acceptSnapshot(response.snapshot);
        return response.snapshot;
      } catch (caught) {
        const body = commandError(caught);
        if (body.snapshot) acceptSnapshot(body.snapshot);
        if (body.error === "version_conflict") {
          commandRef.current = null;
          setError(null);
          return body.snapshot ?? null;
        }
        setError(errorLabel(body.error));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [acceptSnapshot, data.board.id],
  );

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    commandRef.current = null;
    joinedRunRef.current = null;
    readyRunRef.current = null;
    void load("initial");
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load("refresh"), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (snapshot?.phase !== "playing" || !snapshot.timerRunning) return;
    const timer = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot?.phase, snapshot?.timerRunning]);

  const ownParticipant = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.participants.find((participant) => participant.isSelf) ?? null;
  }, [snapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      !ownParticipant ||
      ownParticipant.joinedAt != null ||
      joinedRunRef.current === snapshot.id
    ) {
      return;
    }
    joinedRunRef.current = snapshot.id;
    void command("join").then((next) => {
      if (!next) joinedRunRef.current = null;
    });
  }, [command, ownParticipant, snapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      !ownParticipant ||
      ownParticipant.joinedAt == null ||
      ownParticipant.readyAt != null ||
      readyRunRef.current === snapshot.id
    ) {
      return;
    }
    readyRunRef.current = snapshot.id;
    void command("ready").then((next) => {
      if (!next) readyRunRef.current = null;
    });
  }, [command, ownParticipant, snapshot]);

  useEffect(() => {
    setRevealed(null);
    if (snapshot?.phase !== "playing") return;
    setNumberDraft("");
    setEditing(false);
    setSubmittedNumber(null);
  }, [snapshot?.phase, snapshot?.round]);

  const displayedTimeLeft = useMemo(() => {
    if (!snapshot) return 0;
    if (snapshot.phase !== "playing" || !snapshot.timerRunning) {
      return snapshot.timeLeftMs;
    }
    return Math.max(0, snapshot.timeLeftMs - (clockNow - receivedAt));
  }, [clockNow, receivedAt, snapshot]);

  const connection = reconnecting
    ? "reconnecting"
    : error
      ? "offline"
      : snapshot
        ? "connected"
        : "connecting";

  const atmosphere = (
    <>
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />
    </>
  );

  if (!gameFontsLoaded && !gameFontError) {
    return (
      <View style={styles.screen} accessibilityState={{ busy: true }}>
        {atmosphere}
        <View style={styles.centeredRoot}>
          <ActivityIndicator color={SHADOW.goldBright} />
        </View>
      </View>
    );
  }

  if (loading && !snapshot) {
    return (
      <View style={styles.screen} accessibilityState={{ busy: true }}>
        {atmosphere}
        <View style={styles.centeredRoot}>
          <Text style={styles.eyebrow}>본부 연결 중</Text>
          <Text style={styles.joinTitle}>그림자 연합</Text>
          <ActivityIndicator color={SHADOW.goldBright} />
          <Text style={styles.notice}>게임 상태를 불러오고 있습니다.</Text>
        </View>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.screen}>
        {atmosphere}
        <View style={styles.centeredRoot}>
          <View style={styles.joinMark}>
            <Text style={styles.joinMarkText}>⟡</Text>
          </View>
          <Text style={styles.eyebrow}>연결 오류</Text>
          <Text style={styles.joinTitle}>그림자 연합</Text>
          <Text style={styles.errorText}>{error ?? "게임 상태를 불러오지 못했어요."}</Text>
          <ShadowActionButton label="⟡ 다시 시도" onPress={() => void load("retry")} />
        </View>
      </View>
    );
  }

  if (!ownParticipant) {
    return (
      <View style={styles.screen}>
        {atmosphere}
        <View style={styles.centeredRoot}>
          <View style={styles.joinMark}>
            <Text style={styles.joinMarkText}>⟡</Text>
          </View>
          <Text style={styles.joinTitle}>그림자 연합</Text>
          <Text style={styles.notice}>
            {busy || reconnecting
              ? "본부에 익명 공작원 합류 요청을 보내는 중입니다."
              : "본부와 연결이 끊겼습니다. 다시 연결해 주세요."}
          </Text>
          {busy || reconnecting ? <ActivityIndicator color={SHADOW.goldBright} /> : null}
          {!busy && !reconnecting ? (
            <ShadowActionButton
              label="⟡ 다시 연결"
              onPress={() => {
                joinedRunRef.current = null;
                readyRunRef.current = null;
                void load("retry");
              }}
            />
          ) : null}
          <Text style={styles.connectionState}>{connectionLabel(connection)}</Text>
        </View>
      </View>
    );
  }

  const result = snapshot.lastResult;
  const ownGain =
    result?.players.find((player) => player.studentId === ownParticipant.studentId)
      ?.gain ?? ownParticipant.lastGain;
  const rankedParticipants = snapshot.participants
    .filter((participant) => participant.joinedAt != null)
    .sort(
      (left, right) =>
        right.power - left.power || left.name.localeCompare(right.name, "ko-KR"),
    );
  const ownRankIndex = rankedParticipants.findIndex(
    (participant) => participant.studentId === ownParticipant.studentId,
  );
  const ownRank = ownRankIndex >= 0 ? ownRankIndex + 1 : 1;
  const visibleSubmittedNumber = ownParticipant.ownNumber ?? submittedNumber;
  const showSubmitted =
    (ownParticipant.submitted || (busy && submittedNumber != null)) && !editing;
  const revealItems: Array<{ key: RevealKey; label: string; value: string }> = [
    { key: "nick", label: "👁 내 닉네임", value: ownParticipant.name },
    {
      key: "team",
      label: "👁 내 팀",
      value: teamRevealLabel(ownParticipant.team),
    },
    {
      key: "power",
      label: "👁 내 세력",
      value: `${ownParticipant.power.toLocaleString()} 세력`,
    },
  ];

  const submitNumber = () => {
    const number = Number(numberDraft);
    if (!Number.isInteger(number) || number < 1 || number > 100) {
      setError("1부터 100 사이의 정수를 입력해 주세요.");
      return;
    }
    setSubmittedNumber(number);
    setEditing(false);
    void command("submit", number);
  };

  let phaseContent: ReactNode = null;

  if (snapshot.phase === "lobby") {
    phaseContent = (
      <View style={[styles.commandPanel, styles.centerPhase]}>
        <Text style={styles.eyebrow}>대기 중</Text>
        <Text style={styles.notice}>
          본부의 지령을 기다리는 중입니다.{"\n"}곧 첫 라운드가 시작됩니다.
        </Text>
      </View>
    );
  } else if (snapshot.phase === "playing") {
    phaseContent = (
      <>
        <View style={styles.commandPanel}>
          <Text style={styles.eyebrow}>중앙 지령</Text>
          <Text style={styles.command}>{snapshot.command ?? "-"}</Text>
          <Text style={[styles.notice, styles.timerNotice]}>
            남은 협상 시간 · {formatTime(displayedTimeLeft)}
          </Text>
        </View>
        <View style={styles.inputArea}>
          {showSubmitted ? (
            <>
              <View style={styles.submittedPanel}>
                <Text style={styles.submittedBig}>✓ 제출 완료</Text>
                <Text style={styles.notice}>
                  내 숫자 ·{" "}
                  <Text style={styles.submittedNumber}>
                    {visibleSubmittedNumber?.toLocaleString() ?? "?"}
                  </Text>
                </Text>
              </View>
              {snapshot.editable ? (
                <ShadowActionButton
                  variant="ghost"
                  label="숫자 수정하기"
                  onPress={() => {
                    setNumberDraft(
                      String(ownParticipant.ownNumber ?? submittedNumber ?? ""),
                    );
                    setEditing(true);
                  }}
                />
              ) : (
                <Text style={[styles.notice, styles.centerText]}>
                  교사 설정: 제출 후 수정 불가
                </Text>
              )}
            </>
          ) : (
            <View style={styles.form}>
              <Text style={styles.inputLabel}>1 ~ 100 사이 숫자를 직접 입력하세요</Text>
              <TextField
                accessibilityLabel="제출 숫자"
                autoComplete="off"
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={3}
                placeholder="00"
                placeholderTextColor={SHADOW.muted2}
                value={numberDraft}
                onChangeText={(value) =>
                  setNumberDraft(value.replace(/[^0-9]/g, "").slice(0, 3))
                }
                style={styles.input}
              />
              <ShadowActionButton
                label="⟡ 제출"
                disabled={
                  busy ||
                  reconnecting ||
                  displayedTimeLeft <= 0 ||
                  ownParticipant.forfeitedAt != null
                }
                onPress={submitNumber}
              />
              <Text style={[styles.notice, styles.centerText]}>
                높을수록 더 많은 세력 — 단, 팀 평균이 무너지면 패배합니다.
              </Text>
            </View>
          )}
        </View>
      </>
    );
  } else if (snapshot.phase === "revealing") {
    phaseContent = (
      <View style={[styles.commandPanel, styles.centerPhase]}>
        <Text style={styles.eyebrow}>결과 공개 중</Text>
        <Text style={[styles.command, styles.commandSmall]}>
          {snapshot.command ?? result?.command ?? "-"}
        </Text>
        <Text style={styles.notice}>교실 화면을 주목하세요…</Text>
      </View>
    );
  } else if (snapshot.phase === "postround") {
    phaseContent = (
      <View style={[styles.resultPanel, styles.centerPhase]}>
        <Text style={styles.eyebrow}>이번 라운드 획득</Text>
        <Text style={styles.gainPop}>
          {ownGain > 0 ? `+${ownGain.toLocaleString()}` : "±0"}
        </Text>
        <Text style={styles.notice}>세력</Text>
        <Text style={[styles.notice, styles.resultNote]}>다음 지령을 기다리세요.</Text>
      </View>
    );
  } else {
    phaseContent = (
      <View style={[styles.resultPanel, styles.centerPhase]}>
        <Text style={styles.eyebrow}>게임 종료</Text>
        <Text style={[styles.gainPop, styles.rank]}>{ownRank}위</Text>
        <Text style={styles.notice}>전체 {rankedParticipants.length}명 중</Text>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>내 진영</Text>
        <Text style={styles.finalTeam}>{teamRevealLabel(ownParticipant.team)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {atmosphere}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.student}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.revealRow}>
          {revealItems.map((item) => {
            const isRevealed = revealed === item.key;
            return (
              <ControlPressable
                key={item.key}
                accessibilityLabel={`${item.label.replace("👁 ", "")}, 누르고 있는 동안 공개`}
                onPressIn={() => setRevealed(item.key)}
                onPressOut={() => setRevealed(null)}
                style={[styles.peek, isRevealed ? styles.peekActive : null]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.peekText, isRevealed ? styles.peekTextActive : null]}
                >
                  {isRevealed ? item.value : item.label}
                </Text>
              </ControlPressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <View pointerEvents="none" style={styles.cardGlow} />
          {phaseContent}
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {connection !== "connected" ? (
          <Text style={styles.connectionState}>{connectionLabel(connection)}</Text>
        ) : null}

        {ownParticipant.forfeitedAt == null &&
        snapshot.phase !== "finished" &&
        snapshot.phase !== "host-ended" ? (
          <ControlPressable
            onPress={() => void command("forfeit")}
            style={styles.leaveButton}
          >
            <Text style={styles.leaveLabel}>기권하고 나가기</Text>
          </ControlPressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
