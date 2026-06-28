"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KordlePublicState, LetterState } from "../engine";
import { KordleGrid } from "./KordleGrid";
import { KordleKeyboard } from "./KordleKeyboard";
import { KordleResultModal } from "./KordleResultModal";

type Props = {
  boardId: string;
  initialState: KordlePublicState;
  attemptId: string;
  locale: string;
};

type Status = KordlePublicState["status"];

function KordleWinnerInfo({ stats }: { stats: KordlePublicState["winnerStats"] }) {
  const latestRound = stats.rounds[0] ?? null;
  return (
    <aside className="kordle-winner-info" aria-label="꼬들 우승 기록">
      <div className="kordle-winner-section">
        <p className="kordle-winner-label">우승 기록</p>
        {stats.leaderboard.length > 0 ? (
          <ol className="kordle-winner-list">
            {stats.leaderboard.map((winner) => (
              <li key={winner.studentId}>
                <span>{winner.name}</span>
                <strong>{winner.wins}승</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="kordle-winner-empty">아직 우승자가 없습니다</p>
        )}
      </div>
      {latestRound && (
        <div className="kordle-winner-section">
          <p className="kordle-winner-label">최근 회차</p>
          <p className="kordle-round-winner">
            <span>{latestRound.roundNumber}회차</span>
            <strong>{latestRound.winners.map((winner) => winner.name).join(", ")}</strong>
            <small>{latestRound.solvedAtGuess}줄 만에 성공</small>
          </p>
        </div>
      )}
    </aside>
  );
}

// Korean on-screen typing is jamo-based. The engine normalizes Korean into a
// flat jamo stream (lead U+1100..U+1112, medial U+1161..U+1175,
// trail U+11A8..U+11C2) and `state.wordLength` is that jamo code-point length,
// NOT a syllable count. So pending input is modeled as a flat array of single
// jamo characters, one per grid cell - matching the per-jamo feedback the
// server returns. `buffer` holds the in-progress syllable (1-3 jamos) until it
// is complete; on submit the whole jamo stream is sent as-is.
const KO_LEADS = new Set(Array.from({ length: 19 }, (_, i) => 0x1100 + i));
const KO_MEDIALS = new Set(Array.from({ length: 21 }, (_, i) => 0x1161 + i));
const KO_TRAILS = new Set(Array.from({ length: 27 }, (_, i) => 0x11a8 + i));
const KO_IEUNG_LEAD = String.fromCodePoint(0x110b);
const KO_LEAD_TO_TRAIL = new Map<string, string>([
  [String.fromCodePoint(0x1100), String.fromCodePoint(0x11a8)],
  [String.fromCodePoint(0x1101), String.fromCodePoint(0x11a9)],
  [String.fromCodePoint(0x1102), String.fromCodePoint(0x11ab)],
  [String.fromCodePoint(0x1103), String.fromCodePoint(0x11ae)],
  [String.fromCodePoint(0x1105), String.fromCodePoint(0x11af)],
  [String.fromCodePoint(0x1106), String.fromCodePoint(0x11b7)],
  [String.fromCodePoint(0x1107), String.fromCodePoint(0x11b8)],
  [String.fromCodePoint(0x1109), String.fromCodePoint(0x11ba)],
  [String.fromCodePoint(0x110a), String.fromCodePoint(0x11bb)],
  [String.fromCodePoint(0x110b), String.fromCodePoint(0x11bc)],
  [String.fromCodePoint(0x110c), String.fromCodePoint(0x11bd)],
  [String.fromCodePoint(0x110e), String.fromCodePoint(0x11be)],
  [String.fromCodePoint(0x110f), String.fromCodePoint(0x11bf)],
  [String.fromCodePoint(0x1110), String.fromCodePoint(0x11c0)],
  [String.fromCodePoint(0x1111), String.fromCodePoint(0x11c1)],
  [String.fromCodePoint(0x1112), String.fromCodePoint(0x11c2)],
]);
const KO_DOUBLE_LEADS = new Map<string, string>([
  [String.fromCodePoint(0x1100) + String.fromCodePoint(0x1100), String.fromCodePoint(0x1101)],
  [String.fromCodePoint(0x1103) + String.fromCodePoint(0x1103), String.fromCodePoint(0x1104)],
  [String.fromCodePoint(0x1107) + String.fromCodePoint(0x1107), String.fromCodePoint(0x1108)],
  [String.fromCodePoint(0x1109) + String.fromCodePoint(0x1109), String.fromCodePoint(0x110a)],
  [String.fromCodePoint(0x110c) + String.fromCodePoint(0x110c), String.fromCodePoint(0x110d)],
]);
const KO_TRAIL_TO_LEAD = new Map<string, string>([
  [String.fromCodePoint(0x11a8), String.fromCodePoint(0x1100)],
  [String.fromCodePoint(0x11ab), String.fromCodePoint(0x1102)],
  [String.fromCodePoint(0x11ae), String.fromCodePoint(0x1103)],
  [String.fromCodePoint(0x11af), String.fromCodePoint(0x1105)],
  [String.fromCodePoint(0x11b7), String.fromCodePoint(0x1106)],
  [String.fromCodePoint(0x11b8), String.fromCodePoint(0x1107)],
  [String.fromCodePoint(0x11ba), String.fromCodePoint(0x1109)],
  [String.fromCodePoint(0x11bc), String.fromCodePoint(0x110b)],
  [String.fromCodePoint(0x11bd), String.fromCodePoint(0x110c)],
  [String.fromCodePoint(0x11be), String.fromCodePoint(0x110e)],
  [String.fromCodePoint(0x11bf), String.fromCodePoint(0x110f)],
  [String.fromCodePoint(0x11c0), String.fromCodePoint(0x1110)],
  [String.fromCodePoint(0x11c1), String.fromCodePoint(0x1111)],
  [String.fromCodePoint(0x11c2), String.fromCodePoint(0x1112)],
]);
const KO_COMPOUND_TRAILS = new Map<string, string>([
  [String.fromCodePoint(0x11a8) + String.fromCodePoint(0x11a8), String.fromCodePoint(0x11a9)],
  [String.fromCodePoint(0x11a8) + String.fromCodePoint(0x11ba), String.fromCodePoint(0x11aa)],
  [String.fromCodePoint(0x11ab) + String.fromCodePoint(0x11bd), String.fromCodePoint(0x11ac)],
  [String.fromCodePoint(0x11ab) + String.fromCodePoint(0x11c2), String.fromCodePoint(0x11ad)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11a8), String.fromCodePoint(0x11b0)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11b7), String.fromCodePoint(0x11b1)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11b8), String.fromCodePoint(0x11b2)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11ba), String.fromCodePoint(0x11b3)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11c0), String.fromCodePoint(0x11b4)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11c1), String.fromCodePoint(0x11b5)],
  [String.fromCodePoint(0x11af) + String.fromCodePoint(0x11c2), String.fromCodePoint(0x11b6)],
  [String.fromCodePoint(0x11b8) + String.fromCodePoint(0x11ba), String.fromCodePoint(0x11b9)],
  [String.fromCodePoint(0x11ba) + String.fromCodePoint(0x11ba), String.fromCodePoint(0x11bb)],
]);
const KO_COMPOUND_TRAIL_SPLIT = new Map<string, [string, string]>([
  [String.fromCodePoint(0x11a9), [String.fromCodePoint(0x11a8), String.fromCodePoint(0x1100)]],
  [String.fromCodePoint(0x11aa), [String.fromCodePoint(0x11a8), String.fromCodePoint(0x1109)]],
  [String.fromCodePoint(0x11ac), [String.fromCodePoint(0x11ab), String.fromCodePoint(0x110c)]],
  [String.fromCodePoint(0x11ad), [String.fromCodePoint(0x11ab), String.fromCodePoint(0x1112)]],
  [String.fromCodePoint(0x11b0), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1100)]],
  [String.fromCodePoint(0x11b1), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1106)]],
  [String.fromCodePoint(0x11b2), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1107)]],
  [String.fromCodePoint(0x11b3), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1109)]],
  [String.fromCodePoint(0x11b4), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1110)]],
  [String.fromCodePoint(0x11b5), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1111)]],
  [String.fromCodePoint(0x11b6), [String.fromCodePoint(0x11af), String.fromCodePoint(0x1112)]],
  [String.fromCodePoint(0x11b9), [String.fromCodePoint(0x11b8), String.fromCodePoint(0x1109)]],
  [String.fromCodePoint(0x11bb), [String.fromCodePoint(0x11ba), String.fromCodePoint(0x1109)]],
]);
const KO_COMPAT_TO_LEAD: Record<string, string> = {
  ㄱ: String.fromCodePoint(0x1100),
  ㄴ: String.fromCodePoint(0x1102),
  ㄷ: String.fromCodePoint(0x1103),
  ㄹ: String.fromCodePoint(0x1105),
  ㅁ: String.fromCodePoint(0x1106),
  ㅂ: String.fromCodePoint(0x1107),
  ㅅ: String.fromCodePoint(0x1109),
  ㅇ: String.fromCodePoint(0x110b),
  ㅈ: String.fromCodePoint(0x110c),
  ㅊ: String.fromCodePoint(0x110e),
  ㅋ: String.fromCodePoint(0x110f),
  ㅌ: String.fromCodePoint(0x1110),
  ㅍ: String.fromCodePoint(0x1111),
  ㅎ: String.fromCodePoint(0x1112),
};
const KO_COMPAT_TO_TRAIL: Record<string, string> = {
  ㄱ: String.fromCodePoint(0x11a8),
  ㄴ: String.fromCodePoint(0x11ab),
  ㄷ: String.fromCodePoint(0x11ae),
  ㄹ: String.fromCodePoint(0x11af),
  ㅁ: String.fromCodePoint(0x11b7),
  ㅂ: String.fromCodePoint(0x11b8),
  ㅅ: String.fromCodePoint(0x11ba),
  ㅇ: String.fromCodePoint(0x11bc),
  ㅈ: String.fromCodePoint(0x11bd),
  ㅊ: String.fromCodePoint(0x11be),
  ㅋ: String.fromCodePoint(0x11bf),
  ㅌ: String.fromCodePoint(0x11c0),
  ㅍ: String.fromCodePoint(0x11c1),
  ㅎ: String.fromCodePoint(0x11c2),
};
const KO_COMPAT_TO_MEDIAL: Record<string, string> = {
  ㅏ: String.fromCodePoint(0x1161),
  ㅐ: String.fromCodePoint(0x1162),
  ㅑ: String.fromCodePoint(0x1163),
  ㅔ: String.fromCodePoint(0x1166),
  ㅕ: String.fromCodePoint(0x1167),
  ㅗ: String.fromCodePoint(0x1169),
  ㅛ: String.fromCodePoint(0x116d),
  ㅓ: String.fromCodePoint(0x1165),
  ㅜ: String.fromCodePoint(0x116e),
  ㅠ: String.fromCodePoint(0x1172),
  ㅡ: String.fromCodePoint(0x1173),
  ㅣ: String.fromCodePoint(0x1175),
};
const KO_QWERTY_TO_COMPAT: Record<string, string> = {
  Q: "ㅂ",
  W: "ㅈ",
  E: "ㄷ",
  R: "ㄱ",
  T: "ㅅ",
  Y: "ㅛ",
  U: "ㅕ",
  I: "ㅑ",
  O: "ㅐ",
  P: "ㅔ",
  A: "ㅁ",
  S: "ㄴ",
  D: "ㅇ",
  F: "ㄹ",
  G: "ㅎ",
  H: "ㅗ",
  J: "ㅓ",
  K: "ㅏ",
  L: "ㅣ",
  Z: "ㅋ",
  X: "ㅌ",
  C: "ㅊ",
  V: "ㅍ",
  B: "ㅠ",
  N: "ㅜ",
  M: "ㅡ",
};

function classifyHangul(cp: number): "lead" | "medial" | "trail" | "none" {
  if (KO_LEADS.has(cp)) return "lead";
  if (KO_MEDIALS.has(cp)) return "medial";
  if (KO_TRAILS.has(cp)) return "trail";
  return "none";
}

function resolveKoreanKey(key: string, buffer: string): string {
  const compat = KO_QWERTY_TO_COMPAT[key.toUpperCase()] ?? key;
  const medial = KO_COMPAT_TO_MEDIAL[compat];
  if (medial) return medial;
  if (buffer.length === 2 && KO_COMPAT_TO_TRAIL[compat]) {
    return KO_COMPAT_TO_TRAIL[compat];
  }
  return KO_COMPAT_TO_LEAD[compat] ?? key;
}

function isCompleteSyllable(buffer: string): boolean {
  if (buffer.length < 2) return false;
  const cps: number[] = [];
  for (const ch of buffer) cps.push(ch.codePointAt(0) ?? 0);
  // lead + medial = complete (2 jamos)
  if (cps.length === 2) {
    return KO_LEADS.has(cps[0]) && KO_MEDIALS.has(cps[1]);
  }
  // lead + medial + trail = complete (3 jamos)
  if (cps.length === 3) {
    return KO_LEADS.has(cps[0]) && KO_MEDIALS.has(cps[1]) && KO_TRAILS.has(cps[2]);
  }
  return false;
}

function guessErrorMessage(reason: string, wordLength: number): string {
  switch (reason) {
    case "wrong_length":
      return `${wordLength}칸을 모두 채워 주세요`;
    case "bad_chars":
      return "이 언어에 맞는 글자만 입력할 수 있어요";
    case "not_in_dictionary":
      return "등록된 단어 목록에 없어요";
    case "puzzle_closed":
    case "puzzle_not_playable":
      return "아직 시작되지 않았거나 종료된 문제예요";
    case "no_attempts_left":
      return "더 이상 시도할 수 없어요";
    case "waiting_for_turn":
      return "다른 친구들이 제출하면 다음 줄로 넘어갑니다";
    case "forbidden":
    case "unauthenticated":
      return "참여 권한을 확인해 주세요";
    default:
      return "제출하지 못했어요";
  }
}

export function KordleBoard({ boardId, initialState, attemptId, locale }: Props) {
  const [state, setState] = useState<KordlePublicState>(initialState);
  const [activeLocale, setActiveLocale] = useState(locale);
  // `pending` holds committed single-character cells: one letter per slot for
  // English, one jamo per slot for Korean. `buffer` is the Korean in-progress
  // syllable (a jamo string of 1-3 code points); empty for English.
  const [pending, setPending] = useState<string[]>([]);
  const [buffer, setBuffer] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isKorean = activeLocale.toLowerCase().startsWith("ko");
  void boardId;

  useEffect(() => {
    setActiveLocale(locale);
    setPending([]);
    setBuffer("");
    setError(null);
  }, [locale, attemptId]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: string }>).detail;
      if (!detail?.locale) return;
      setActiveLocale(detail.locale);
      setPending([]);
      setBuffer("");
      setError(null);
    }

    window.addEventListener("kordle-locale-change", handleLocaleChange);
    return () => window.removeEventListener("kordle-locale-change", handleLocaleChange);
  }, []);

  const letterStates = useMemo(() => {
    const map = new Map<string, LetterState>();
    for (const fb of state.guesses) {
      for (const lf of fb) {
        const cur = map.get(lf.char);
        if (!cur || cur === "absent" || (cur === "present" && lf.state === "correct")) {
          map.set(lf.char, lf.state);
        }
      }
    }
    return map;
  }, [state.guesses]);

  const isComplete = state.status === "WON" || state.status === "LOST";
  const isWaitingForTurn =
    !isComplete && state.turn.currentGuessIndex !== null && state.turn.isWaiting;
  const canType =
    !isComplete &&
    !submitting &&
    state.turn.currentGuessIndex !== null &&
    state.nextGuessIndex === state.turn.currentGuessIndex;

  useEffect(() => {
    if (!isWaitingForTurn) return;
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/kordle/attempts/${attemptId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as {
            state?: KordlePublicState;
          } | null;
          if (!cancelled && data?.state) {
            setState(data.state);
            if (!data.state.turn.isWaiting) {
              setError(null);
              return;
            }
          }
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, 1200);
        }
      }
    }

    timer = window.setTimeout(poll, 900);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [attemptId, isWaitingForTurn]);

  const submit = useCallback(async () => {
    if (submitting || isComplete) return;
    // Full guess = committed cells + any in-progress Korean syllable jamos.
    // For English `buffer` is always "" so this is just the joined letters.
    const guess = pending.join("") + buffer;
    if ([...guess].length !== state.wordLength) {
      setError(`${state.wordLength}개의 자모를 입력하세요`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/kordle/attempts/${attemptId}/guess`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string"
            ? guessErrorMessage(data.error, state.wordLength)
            : "제출하지 못했어요",
        );
        return;
      }
      const data = (await res.json()) as { state: KordlePublicState };
      setState(data.state);
      setPending([]);
      setBuffer("");
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, buffer, isComplete, pending, state.wordLength, submitting]);

  const onKey = useCallback(
    (key: string) => {
      if (!canType) return;
      if (key === "ENTER") {
        // Refuse to submit a half-formed Korean syllable.
        if (isKorean && buffer.length > 0 && !isCompleteSyllable(buffer)) {
          setError("음절이 완성되지 않았습니다");
          return;
        }
        void submit();
        return;
      }
      if (key === "BACK") {
        if (isKorean && buffer.length > 0) {
          setBuffer((b) => b.slice(0, -1));
        } else {
          setPending((p) => p.slice(0, -1));
        }
        return;
      }
      if (isKorean) {
        const resolvedKey = resolveKoreanKey(key, buffer);
        const cp = resolvedKey.codePointAt(0) ?? 0;
        const klass = classifyHangul(cp);
        if (klass === "none") return; // ignore non-jamo keys for Korean
        if (pending.length + buffer.length >= state.wordLength) return; // grid full
        if (buffer.length === 0) {
          if (klass === "medial") {
            const lastPending = pending[pending.length - 1];
            const splitCompound = lastPending ? KO_COMPOUND_TRAIL_SPLIT.get(lastPending) : undefined;
            if (splitCompound && pending.length >= 3) {
              const [remainingTrail, shiftedLead] = splitCompound;
              setPending((p) => [...p.slice(0, -1), remainingTrail]);
              setBuffer(shiftedLead + resolvedKey);
              return;
            }
            const shiftedLead = lastPending ? KO_TRAIL_TO_LEAD.get(lastPending) : undefined;
            if (shiftedLead && pending.length >= 3) {
              setPending((p) => p.slice(0, -1));
              setBuffer(shiftedLead + resolvedKey);
              return;
            }
            if (pending.length + 2 <= state.wordLength) {
              setBuffer(KO_IEUNG_LEAD + resolvedKey);
              return;
            }
          }
          if (klass !== "lead") {
            setError("초성부터 입력하세요");
            return;
          }
          const lastPending = pending[pending.length - 1];
          const nextTrail = KO_LEAD_TO_TRAIL.get(resolvedKey);
          const compoundTrail =
            lastPending && nextTrail
              ? KO_COMPOUND_TRAILS.get(lastPending + nextTrail)
              : undefined;
          if (compoundTrail && pending.length >= 3) {
            setPending((p) => [...p.slice(0, -1), compoundTrail]);
            return;
          }
          setBuffer(resolvedKey);
          return;
        }
        if (buffer.length === 1) {
          // buffer holds a lone lead.
          if (klass === "medial") {
            setBuffer(buffer + resolvedKey);
            return;
          }
          if (klass === "lead") {
            const doubled = KO_DOUBLE_LEADS.get(buffer + resolvedKey);
            if (doubled) {
              setBuffer(doubled);
            }
            return;
          }
          setError("중성을 먼저 입력하세요");
          return;
        }
        // buffer.length === 2: lead + medial (a complete 2-jamo syllable).
        if (klass === "trail") {
          const completed = buffer + resolvedKey;
          setPending((p) => [...p, ...completed]);
          setBuffer("");
          return;
        }
        if (klass === "medial") {
          if (pending.length + buffer.length + 2 <= state.wordLength) {
            setPending((p) => [...p, ...buffer]);
            setBuffer(KO_IEUNG_LEAD + resolvedKey);
            return;
          }
          setError("칸이 부족합니다");
          return;
        }
        if (klass === "lead") {
          setPending((p) => [...p, ...buffer]);
          setBuffer(resolvedKey);
          return;
        }
        setError("종성 또는 새 초성을 입력하세요");
        return;
      }
      // English: one letter per slot.
      if (pending.length >= state.wordLength) return;
      setPending((p) => [...p, key]);
    },
    [buffer, canType, isKorean, pending.length, state.wordLength, submit],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === "ENTER" || k === "BACKSPACE" || k === "DEL") {
        onKey(k === "ENTER" ? "ENTER" : "BACK");
        e.preventDefault();
        return;
      }
      if (/^[A-Z]$/.test(k)) {
        onKey(k);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isKorean, onKey]);

  // Grid cells = committed cells + in-progress Korean jamos. For English
  // `buffer` is "" so this is just `pending`. Each entry is one cell.
  const displaySlots: string[] = [...pending, ...buffer];

  return (
    <div className="kordle-play-layout">
      <KordleWinnerInfo stats={state.winnerStats} />
      <div className="kordle-board" data-locale={activeLocale} aria-label="Kordle game">
        <KordleGrid
          wordLength={state.wordLength}
          maxGuesses={state.maxGuesses}
          pastGuesses={state.guesses}
          pending={displaySlots}
          isKorean={isKorean}
          activeGuessIndex={state.nextGuessIndex}
        />
        {error && (
          <p className="kordle-error" role="alert">
            {error}
          </p>
        )}
        {isWaitingForTurn && (
          <p className="kordle-turn-wait" role="status">
            {state.turn.isPendingJoin
              ? "다음 턴이 시작되면 입장합니다"
              : `${state.turn.submittedCount}/${state.turn.totalCount}명 제출 완료`}
          </p>
        )}
        <KordleKeyboard
          locale={activeLocale}
          letterStates={letterStates}
          onKey={onKey}
          disabled={!canType}
        />
        {isComplete && (
          <KordleResultModal
            status={state.status as Status}
            solvedAtGuess={state.solvedAtGuess}
            totalGuesses={state.guesses.length}
          />
        )}
      </div>
    </div>
  );
}
