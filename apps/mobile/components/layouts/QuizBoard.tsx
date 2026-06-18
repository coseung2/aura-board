import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  colors,
  iconSizes,
  quiz as quizTokens,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import { AppButton, SurfaceCard, SurfacePressable } from "../ui";

// Kahoot-style quiz (student side).
// 1) Lobby: roomCode + 이름(자동) 으로 join → playerId 받기
// 2) Polling: /api/quiz/:id 을 2초마다 → currentQ 바뀌면 문제 표시
// 3) Answer: /api/quiz/answer → 다음 문제로.
// SSE 대신 polling 을 쓴 이유 — /api/quiz/:id/stream 은 `event: name\ndata:` 포맷이라
// 모바일 SSE parser 가 추가로 필요하고, 교실 wi-fi 장시간 SSE 가 불안정.

type QuizState = {
  id: string;
  title: string;
  status: "waiting" | "active" | "finished";
  currentQ: number;
  questions: Array<{
    id: string;
    order: number;
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    timeLimit: number;
    // answer 는 내려오지 않음 (치팅 방지).
  }>;
  players: Array<{
    id: string;
    nickname: string;
    score: number;
    studentId: string | null;
  }>;
};

type Player = { id: string; nickname: string; score: number };

type Letter = "A" | "B" | "C" | "D";

export function QuizBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const room = data.layoutData.quiz?.room;
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [lastAnsweredQ, setLastAnsweredQ] = useState<number>(-1);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [showFeedback, setShowFeedback] = useState<"ok" | "late" | null>(null);
  const questionStartMs = useRef<number>(0);

  const join = useCallback(async () => {
    if (!room?.roomCode) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await apiFetch<{
        player: Player;
        quiz: { id: string; status: string };
      }>("/api/quiz/join", {
        method: "POST",
        json: {
          roomCode: room.roomCode,
          studentId: data.currentStudent.id,
        },
      });
      setPlayer(res.player);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) setJoinError("방을 찾을 수 없어요. 코드를 확인해주세요.");
        else if (e.status === 400) setJoinError("이미 끝난 퀴즈예요.");
        else setJoinError(`참가 실패 (${e.status})`);
      } else {
        setJoinError(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    } finally {
      setJoining(false);
    }
  }, [room?.roomCode, data.currentStudent.id]);

  // Poll quiz state every 2 초.
  useEffect(() => {
    if (!player || !room?.id) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await apiFetch<{ quiz: QuizState }>(`/api/quiz/${room!.id}`);
        if (cancelled) return;
        setQuiz(res.quiz);
        // 새 문제로 넘어왔으면 타이머 초기화.
        if (res.quiz.currentQ !== lastAnsweredQ) {
          if (res.quiz.currentQ > lastAnsweredQ && selected !== null) {
            setSelected(null);
            setShowFeedback(null);
          }
        }
      } catch {
        // best-effort.
      }
    }
    tick();
    const handle = setInterval(tick, quizTokens.pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [player, room?.id, lastAnsweredQ, selected]);

  // 문제 시작 시각 추적 (점수 계산용).
  useEffect(() => {
    if (!quiz) return;
    if (quiz.currentQ !== lastAnsweredQ) {
      questionStartMs.current = Date.now();
    }
  }, [quiz, lastAnsweredQ]);

  async function answer(letter: Letter) {
    if (!quiz || !player) return;
    const current = quiz.questions[quiz.currentQ];
    if (!current) return;
    if (selected) return; // 중복 제출 방지
    setSelected(letter);
    const timeMs = Date.now() - questionStartMs.current;
    try {
      await apiFetch("/api/quiz/answer", {
        method: "POST",
        json: {
          questionId: current.id,
          playerId: player.id,
          selected: letter,
          timeMs,
        },
      });
      setShowFeedback("ok");
      setLastAnsweredQ(quiz.currentQ);
    } catch {
      setShowFeedback("late");
    }
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>🎮</Text>
        <Text style={styles.infoTitle}>퀴즈가 아직 준비되지 않았어요</Text>
        <Text style={styles.infoMsg}>선생님이 퀴즈를 생성하면 여기에 나타나요.</Text>
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>🎯</Text>
        <Text style={styles.infoTitle}>{room.title ?? "퀴즈 대기실"}</Text>
        <Text style={styles.infoMsg}>
          방 코드: <Text style={styles.roomCode}>{room.roomCode ?? "???"}</Text>
        </Text>
        <Text style={styles.infoMsg}>{data.currentStudent.name} 으로 참가합니다.</Text>
        {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
        <AppButton
          style={styles.joinBtn}
          onPress={() => {
            void join();
            onMutate();
          }}
          disabled={joining || room.status === "finished"}
          loading={joining}
        >
          {room.status === "finished" ? "이미 끝났어요" : "참가하기"}
        </AppButton>
      </View>
    );
  }

  if (!quiz) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.infoMsg}>상태 확인 중…</Text>
      </View>
    );
  }

  if (quiz.status === "waiting") {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>⏳</Text>
        <Text style={styles.infoTitle}>곧 시작해요!</Text>
        <Text style={styles.infoMsg}>
          참가자 {quiz.players.length}명 · 선생님이 시작하면 문제가 보여요.
        </Text>
      </View>
    );
  }

  if (quiz.status === "finished") {
    const sorted = [...quiz.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex((p) => p.id === player.id) + 1;
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>🏁</Text>
        <Text style={styles.infoTitle}>퀴즈 종료!</Text>
        <Text style={styles.infoMsg}>
          {myRank}위 · {player.score}점
        </Text>
        <SurfaceCard style={styles.leaderboard}>
          {sorted.slice(0, quizTokens.leaderboardPreviewCount).map((p, i) => (
            <View key={p.id} style={styles.lbRow}>
              <Text style={styles.lbRank}>{i + 1}</Text>
              <Text style={styles.lbName}>{p.nickname}</Text>
              <Text style={styles.lbScore}>{p.score}</Text>
            </View>
          ))}
        </SurfaceCard>
      </View>
    );
  }

  const q = quiz.questions[quiz.currentQ];
  if (!q) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const myScore = quiz.players.find((p) => p.id === player.id)?.score ?? 0;
  const options: Array<{ letter: Letter; text: string; color: string }> = [
    { letter: "A", text: q.optionA, color: colors.quizA },
    { letter: "B", text: q.optionB, color: colors.quizB },
    { letter: "C", text: q.optionC, color: colors.quizC },
    { letter: "D", text: q.optionD, color: colors.quizD },
  ];

  return (
    <View style={styles.activeRoot}>
      <View style={styles.topBar}>
        <Text style={styles.topLabel}>
          문제 {quiz.currentQ + 1} / {quiz.questions.length}
        </Text>
        <Text style={styles.topScore}>{player.nickname} · {myScore}점</Text>
      </View>
      <SurfaceCard style={styles.qCard}>
        <Text style={styles.qText}>{q.question}</Text>
      </SurfaceCard>
      <View style={styles.optGrid}>
        {options.map((opt) => {
          const isSelected = selected === opt.letter;
          return (
            <SurfacePressable
              key={opt.letter}
              style={[
                styles.opt,
                { backgroundColor: opt.color },
                (selected && !isSelected) && styles.optDim,
              ]}
              onPress={() => answer(opt.letter)}
              disabled={selected !== null}
            >
              <Text style={styles.optLetter}>{opt.letter}</Text>
              <Text style={styles.optText} numberOfLines={3}>{opt.text}</Text>
            </SurfacePressable>
          );
        })}
      </View>
      {showFeedback ? (
        <View style={styles.feedbackBar}>
          <Text style={styles.feedbackText}>
            {showFeedback === "ok" ? "정답 대기 중…" : "이미 답을 제출했어요"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  infoEmoji: { fontSize: iconSizes.gate },
  infoTitle: { ...typography.display, color: colors.text, textAlign: "center" },
  infoMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  roomCode: {
    ...typography.display,
    color: colors.accent,
    letterSpacing: quizTokens.roomCodeLetterSpacing,
  },
  errorText: { ...typography.label, color: colors.danger },
  joinBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },

  activeRoot: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topLabel: { ...typography.section, color: colors.text },
  topScore: { ...typography.label, color: colors.textMuted },
  qCard: {
    padding: spacing.xxl,
    minHeight: quizTokens.cardMinHeight,
    justifyContent: "center",
  },
  qText: {
    ...typography.title,
    color: colors.text,
    textAlign: "center",
  },
  optGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  opt: {
    width: quizTokens.optionWidth,
    flexBasis: quizTokens.optionWidth,
    flexGrow: 1,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: quizTokens.cardMinHeight,
    gap: spacing.sm,
  },
  optDim: { opacity: quizTokens.optionDimOpacity },
  optLetter: { ...typography.display, color: colors.onAccent },
  optText: { ...typography.section, color: colors.onAccent, textAlign: "center" },

  feedbackBar: {
    padding: spacing.md,
    backgroundColor: colors.accentTintedBg,
    alignItems: "center",
  },
  feedbackText: { ...typography.label, color: colors.accentTintedText },

  leaderboard: {
    width: "100%",
    maxWidth: quizTokens.leaderboardMaxWidth,
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  lbRank: {
    ...typography.title,
    color: colors.accent,
    width: quizTokens.rankWidth,
  },
  lbName: { ...typography.body, color: colors.text, flex: 1 },
  lbScore: { ...typography.subtitle, color: colors.text },
});
