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
  // `pending` holds committed single-character cells: one letter per slot for
  // English, one jamo per slot for Korean. `buffer` is the Korean in-progress
  // syllable (a jamo string of 1-3 code points); empty for English.
  const [pending, setPending] = useState<string[]>([]);
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
        setError(typeof data.error === "string" ? data.error : "submit_failed");
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
      if (isComplete || submitting) return;
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
        const cp = key.codePointAt(0) ?? 0;
        const klass = classifyHangul(cp);
        if (klass === "none") return; // ignore non-jamo keys for Korean
        if (pending.length + buffer.length >= state.wordLength) return; // grid full
        if (buffer.length === 0) {
          if (klass !== "lead") {
            setError("초성부터 입력하세요");
            return;
          }
          setBuffer(key);
          return;
        }
        if (buffer.length === 1) {
          // buffer holds a lone lead.
          if (klass === "medial") {
            setBuffer(buffer + key);
            return;
          }
          if (klass === "lead") {
            // No medial chosen: commit the lone lead and start a new syllable.
            setPending((p) => [...p, ...buffer]);
            setBuffer(key);
            return;
          }
          setError("중성을 먼저 입력하세요");
          return;
        }
        // buffer.length === 2: lead + medial (a complete 2-jamo syllable).
        if (klass === "trail") {
          const completed = buffer + key;
          setPending((p) => [...p, ...completed]);
          setBuffer("");
          return;
        }
        if (klass === "lead") {
          setPending((p) => [...p, ...buffer]);
          setBuffer(key);
          return;
        }
        setError("종성 또는 새 초성을 입력하세요");
        return;
      }
      // English: one letter per slot.
      if (pending.length >= state.wordLength) return;
      setPending((p) => [...p, key]);
    },
    [buffer, isComplete, isKorean, pending.length, state.wordLength, submit, submitting],
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

  // Grid cells = committed cells + in-progress Korean jamos. For English
  // `buffer` is "" so this is just `pending`. Each entry is one cell.
  const displaySlots: string[] = [...pending, ...buffer];

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
