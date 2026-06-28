"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { normalizeWord } from "../engine";

type KordleLocale = "en-US" | "ko-KR";

type Props = {
  boardId: string;
  initialLocale: string;
  puzzleId?: string | null;
  puzzleStatus?: string | null;
};

const WORD_LENGTH = 6;

export function KordleTeacherControls({
  boardId,
  initialLocale,
  puzzleId,
  puzzleStatus,
}: Props) {
  const router = useRouter();
  const [locale, setLocale] = useState<KordleLocale>(
    initialLocale === "ko-KR" ? "ko-KR" : "en-US",
  );
  const [solution, setSolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const normalizedLength = useMemo(() => {
    if (!solution.trim()) return 0;
    return normalizeWord(solution, locale).length;
  }, [locale, solution]);

  const hasCustomWord = solution.trim().length > 0;
  const customWordInvalid = hasCustomWord && normalizedLength !== WORD_LENGTH;

  function applyLocale(nextLocale: KordleLocale) {
    setLocale(nextLocale);
    setSolution("");
    setError(null);
    window.dispatchEvent(
      new CustomEvent("kordle-locale-change", {
        detail: { locale: nextLocale },
      }),
    );
  }

  async function createPuzzle(useRandom: boolean) {
    if (busy) return;
    if (!useRandom && customWordInvalid) {
      setError(`${WORD_LENGTH}칸에 맞는 단어를 입력하세요`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          solution: useRandom ? undefined : solution,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.error === "wrong_length") {
          setError(`${WORD_LENGTH}칸에 맞는 단어를 입력하세요`);
        } else {
          setError("퍼즐을 만들지 못했습니다");
        }
        return;
      }
      const nextLocale = data?.locale === "ko-KR" ? "ko-KR" : "en-US";
      setLocale(nextLocale);
      setSolution("");
      window.dispatchEvent(
        new CustomEvent("kordle-locale-change", {
          detail: { locale: nextLocale },
        }),
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function startPuzzle() {
    if (busy || !puzzleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", puzzleId }),
      });
      if (!res.ok) {
        setError("시작하지 못했습니다");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function stopPuzzle() {
    if (busy || !puzzleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop", puzzleId }),
      });
      if (!res.ok) {
        setError("중단하지 못했습니다");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kordle-teacher-controls">
      <div className="kordle-locale-toggle" aria-label="꼬들 언어">
        <button
          type="button"
          className={locale === "en-US" ? "is-active" : ""}
          onClick={() => applyLocale("en-US")}
        >
          영어
        </button>
        <button
          type="button"
          className={locale === "ko-KR" ? "is-active" : ""}
          onClick={() => applyLocale("ko-KR")}
        >
          한글
        </button>
      </div>
      <input
        className="kordle-word-input"
        value={solution}
        onChange={(event) => {
          setSolution(event.target.value);
          setError(null);
        }}
        placeholder="문제를 출제하세요"
        aria-label="꼬들 정답"
      />
      <button
        type="button"
        className="kordle-create-btn"
        onClick={() => createPuzzle(false)}
        disabled={busy || isPending || customWordInvalid || !hasCustomWord}
      >
        생성
      </button>
      <button
        type="button"
        className="kordle-random-btn"
        onClick={() => createPuzzle(true)}
        disabled={busy || isPending}
      >
        랜덤
      </button>
      {puzzleStatus === "DRAFT" && (
        <button
          type="button"
          className="kordle-start-btn"
          onClick={() => startPuzzle()}
          disabled={busy || isPending || !puzzleId}
        >
          시작
        </button>
      )}
      {(puzzleStatus === "DRAFT" || puzzleStatus === "LIVE") && (
        <button
          type="button"
          className="kordle-stop-btn"
          onClick={() => stopPuzzle()}
          disabled={busy || isPending || !puzzleId}
        >
          중단
        </button>
      )}
      {hasCustomWord && (
        <span className={customWordInvalid ? "kordle-word-count is-invalid" : "kordle-word-count"}>
          {normalizedLength}/{WORD_LENGTH}
        </span>
      )}
      {error && <span className="kordle-control-error">{error}</span>}
    </div>
  );
}
