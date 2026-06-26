"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuessFeedback, KordlePublicState, LetterState } from "../engine";
import { recomposeHangul } from "../engine";
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

// Korean on-screen typing is jamo-based. The user taps a leading jamo
// (e.g. ?), then a medial (e.g. ?), then optionally a trail. The
// `currentBuffer` holds the in-progress syllable. When a complete syllable
// is reached we commit it to `pendingSlots`. On submit we recompose each
// slot to a Hangul syllable and join.
const KO_LEADS = new Set([0x1100, 0x1101, 0x1102, 0x1103, 0x1104, 0x1105, 0x1106, 0x1107, 0x1108, 0x1109, 0x110a, 0x110b, 0x110c, 0x110d, 0x110e, 0x110f, 0x1110, 0x1111, 0x1112]);
const KO_MEDIALS = new Set([0x1161, 0x1162, 0x1163, 0x1164, 0x1165, 0x1166, 0x1167, 0x1168, 0x1169, 0x116a, 0x116b, 0x116c, 0x116d, 0x116e, 0x116f, 0x1170, 0x1171, 0x1172, 0x1173, 0x1174, 0x1175]);
const KO_TRAILS = new Set([0x11a8, 0x11a9, 0x11aa, 0x11ab, 0x11ac, 0x11ad, 0x11ae, 0x11af, 0x11b0, 0x11b1, 0x11b2, 0x11b3, 0x11b4, 0x11b5, 0x11b6, 0x11b7, 0x11b8, 0x11b9, 0x11ba, 0x11bb, 0x11bc, 0x11bd, 0x11be, 0x11bf, 0x11c0, 0x11c1, 0x11c2]);

function classifyHangul(cp: number): "lead" | "medial" | "trail" | "none" {
  if (KO_LEADS.has(cp)) return "lead";
  if (KO_MEDIALS.has(cp)) return "medial";
  if (KO_TRAILS.has(cp)) return "trail";
  return "none";
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

export function KordleBoard({ boardId, initialState, attemptId, locale }: Props) {
  const [state, setState] = useState<KordlePublicState>(initialState);
  // For Korean, `pendingSlots` holds committed syllable strings (each 2-3
  // jamos long). `buffer` holds the in-progress syllable.
  // For English, `pendingSlots` holds single letters and `buffer` is unused.
  const [pendingSlots, setPendingSlots] = useState<string[]>([]);
  const [buffer, setBuffer] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isKorean = locale.toLowerCase().startsWith("ko");
  void boardId;

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

  const submit = useCallback(async () => {
    if (submitting || isComplete) return;
    // Compose final guess.
    const finalSlots = [...pendingSlots];
    if (buffer.length > 0) {
      finalSlots.push(recomposeHangul(buffer));
    }
    const guess = isKorean ? finalSlots.map((s) => s).join("") : finalSlots.join("");
    if ([...guess].length !== state.wordLength) {
      setError(`??? ${state.wordLength}???? ??`);
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
        setError(typeof data.error === "string" ? data.error : "submit_failed");
        return;
      }
      const data = (await res.json()) as { state: KordlePublicState };
      setState(data.state);
      setPendingSlots([]);
      setBuffer("");
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, buffer, isComplete, isKorean, pendingSlots, state.wordLength, submitting]);

  const onKey = useCallback(
    (key: string) => {
      if (isComplete || submitting) return;
      if (key === "ENTER") {
        // For Korean, ENTER commits the current buffer to a slot if it is
        // a complete syllable, then submits.
        if (isKorean && buffer.length > 0) {
          if (isCompleteSyllable(buffer)) {
            const slot = recomposeHangul(buffer);
            setPendingSlots((p) => (p.length >= state.wordLength ? p : [...p, slot]));
            setBuffer("");
          } else {
            setError("??? ???? ????");
            return;
          }
        }
        void submit();
        return;
      }
      if (key === "BACK") {
        if (isKorean && buffer.length > 0) {
          setBuffer((b) => b.slice(0, -1));
        } else {
          setPendingSlots((p) => p.slice(0, -1));
        }
        return;
      }
      if (isKorean) {
        const cp = key.codePointAt(0) ?? 0;
        const klass = classifyHangul(cp);
        if (klass === "none") return; // ignore non-jamo keys for Korean
        const nextBuffer = buffer + key;
        if (buffer.length === 0 && klass !== "lead") {
          setError("???? ??? ???");
          return;
        }
        if (buffer.length === 1 && klass !== "medial" && klass !== "lead") {
          setError("?? ?? ?? ??? ??? ???");
          return;
        }
        if (buffer.length === 2 && klass !== "trail") {
          // Buffer is full (lead+medial); commit then start new syllable.
          const slot = recomposeHangul(buffer);
          setPendingSlots((p) => (p.length >= state.wordLength ? p : [...p, slot]));
          if (klass === "lead") {
            setBuffer(key);
          } else {
            // Stray medial/trail with no lead: ignore.
            setError("??? ??????");
            return;
          }
          return;
        }
        setBuffer(nextBuffer);
        // Auto-commit when complete (3 jamos).
        if (isCompleteSyllable(nextBuffer)) {
          const slot = recomposeHangul(nextBuffer);
          setPendingSlots((p) => (p.length >= state.wordLength ? p : [...p, slot]));
          setBuffer("");
        }
        return;
      }
      // English: one letter per slot.
      if (pendingSlots.length >= state.wordLength) return;
      setPendingSlots((p) => [...p, key]);
    },
    [buffer, isComplete, isKorean, pendingSlots.length, state.wordLength, submit, submitting],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === "ENTER" || k === "BACKSPACE" || k === "DEL") {
        onKey(k === "DEL" ? "BACK" : k);
        e.preventDefault();
        return;
      }
      if (!isKorean && /^[A-Z]$/.test(k)) {
        onKey(k);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isKorean, onKey]);

  // For display, the grid wants an array of slot strings (each
  // representing one cell). For Korean, slots = pendingSlots + (buffer
  // precomposed as the next cell if non-empty). For English, slots are
  // already the raw letters.
  const displaySlots: string[] = isKorean
    ? (() => {
        const slots = [...pendingSlots];
        if (buffer.length > 0) slots.push(recomposeHangul(buffer));
        return slots;
      })()
    : pendingSlots;

  return (
    <div className="kordle-board" data-locale={locale} aria-label="Kordle game">
      <KordleGrid
        wordLength={state.wordLength}
        maxGuesses={state.maxGuesses}
        pastGuesses={state.guesses}
        pending={displaySlots}
        isKorean={isKorean}
      />
      {error && (
        <p className="kordle-error" role="alert">
          {error}
        </p>
      )}
      {!isComplete && (
        <KordleKeyboard
          locale={locale}
          letterStates={letterStates}
          onKey={onKey}
          disabled={submitting}
        />
      )}
      {isComplete && (
        <KordleResultModal
          status={state.status as Status}
          solvedAtGuess={state.solvedAtGuess}
          totalGuesses={state.guesses.length}
        />
      )}
    </div>
  );
}
