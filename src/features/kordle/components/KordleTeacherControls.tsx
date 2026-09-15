"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { normalizeWord } from "../engine";

type KordleLocale = "en-US" | "ko-KR";

type Props = {
  boardId: string;
  initialLocale: string;
  puzzleId?: string | null;
  puzzleStatus?: string | null;
  puzzleVersion?: number | null;
};

const WORD_LENGTH = 6;

export function KordleTeacherControls({
  boardId,
  initialLocale,
  puzzleId,
  puzzleStatus,
  puzzleVersion,
}: Props) {
  const router = useRouter();
  const [locale, setLocale] = useState<KordleLocale>(
    initialLocale === "ko-KR" ? "ko-KR" : "en-US",
  );
  const localeRef = useRef<KordleLocale>(initialLocale === "ko-KR" ? "ko-KR" : "en-US");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [version, setVersion] = useState(puzzleVersion ?? 0);
  const pendingCommandRef = useRef<{
    action: "create" | "start" | "stop";
    requestId: string;
    expectedVersion: number;
    fingerprint: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const normalizedLength = useMemo(() => {
    if (!solution.trim()) return 0;
    return normalizeWord(solution, locale).length;
  }, [locale, solution]);

  const hasCustomWord = solution.trim().length > 0;
  const customWordInvalid = hasCustomWord && normalizedLength !== WORD_LENGTH;
  const roundEnded = puzzleStatus === "CLOSED";
  const canCreatePuzzle = !puzzleId || roundEnded;

  useEffect(() => {
    const nextLocale = initialLocale === "ko-KR" ? "ko-KR" : "en-US";
    setLocale(nextLocale);
    localeRef.current = nextLocale;
  }, [initialLocale]);

  useEffect(() => {
    setVersion(puzzleVersion ?? 0);
    pendingCommandRef.current = null;
  }, [puzzleId, puzzleVersion]);

  function applyLocale(nextLocale: KordleLocale) {
    if (busy || isPending || !canCreatePuzzle) return;
    localeRef.current = nextLocale;
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
    if (busy || isPending || inFlight.current || !canCreatePuzzle) return;
    if (!useRandom && customWordInvalid) {
      setError(`${WORD_LENGTH}칸에 맞는 단어를 입력하세요`);
      return;
    }
    setError(null);
    inFlight.current = true;
    setBusy(true);
    const selectedLocale = localeRef.current;
    const submittedSolution = useRandom ? "" : solution;
    const fingerprint = `${selectedLocale}:${submittedSolution}`;
    const pending = pendingCommandRef.current;
    const command =
      pending &&
      pending.action === "create" &&
      pending.expectedVersion === version &&
      pending.fingerprint === fingerprint
        ? pending
        : {
            action: "create" as const,
            requestId: crypto.randomUUID(),
            expectedVersion: version,
            fingerprint,
          };
    pendingCommandRef.current = command;
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
          locale: selectedLocale,
          solution: useRandom ? undefined : solution,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (typeof data?.puzzle?.version === "number") {
          setVersion(data.puzzle.version);
          pendingCommandRef.current = null;
        }
        if (data?.error === "wrong_length") {
          setError(`${WORD_LENGTH}칸에 맞는 단어를 입력하세요`);
        } else {
          setError("퍼즐을 만들지 못했습니다");
        }
        return;
      }
      pendingCommandRef.current = null;
      if (typeof data?.version === "number") setVersion(data.version);
      const nextLocale = data?.locale === "ko-KR" ? "ko-KR" : "en-US";
      localeRef.current = nextLocale;
      setLocale(nextLocale);
      setSolution("");
      window.dispatchEvent(
        new CustomEvent("kordle-locale-change", {
          detail: { locale: nextLocale },
        }),
      );
      startTransition(() => router.refresh());
    } catch {
      setError("문제를 만들지 못했어요. 입력을 유지했으니 다시 시도해 주세요.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function startPuzzle() {
    if (busy || isPending || inFlight.current || !puzzleId || puzzleStatus !== "DRAFT") return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const pending = pendingCommandRef.current;
    const command =
      pending &&
      pending.action === "start" &&
      pending.expectedVersion === version &&
      pending.fingerprint === puzzleId
        ? pending
        : {
            action: "start" as const,
            requestId: crypto.randomUUID(),
            expectedVersion: version,
            fingerprint: puzzleId,
          };
    pendingCommandRef.current = command;
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          puzzleId,
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (typeof data?.puzzle?.version === "number") {
          setVersion(data.puzzle.version);
          pendingCommandRef.current = null;
        }
        setError("시작하지 못했습니다");
        return;
      }
      pendingCommandRef.current = null;
      if (typeof data?.version === "number") setVersion(data.version);
      startTransition(() => router.refresh());
    } catch {
      setError("시작을 확인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function stopPuzzle() {
    if (busy || isPending || inFlight.current || !puzzleId) return;
    if (puzzleStatus === "LIVE" && !window.confirm("이번 문제를 종료할까요? 모든 학생의 풀이가 끝나요.")) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const pending = pendingCommandRef.current;
    const command =
      pending &&
      pending.action === "stop" &&
      pending.expectedVersion === version &&
      pending.fingerprint === puzzleId
        ? pending
        : {
            action: "stop" as const,
            requestId: crypto.randomUUID(),
            expectedVersion: version,
            fingerprint: puzzleId,
          };
    pendingCommandRef.current = command;
    try {
      const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          puzzleId,
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (typeof data?.puzzle?.version === "number") {
          setVersion(data.puzzle.version);
          pendingCommandRef.current = null;
        }
        setError("중단하지 못했습니다");
        return;
      }
      pendingCommandRef.current = null;
      if (typeof data?.version === "number") setVersion(data.version);
      startTransition(() => router.refresh());
    } catch {
      setError("종료를 확인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="kordle-teacher-controls">
      {canCreatePuzzle && <>
      <div className="kordle-locale-toggle" aria-label="꼬들 언어">
        <button
          type="button"
          className={locale === "en-US" ? "is-active" : ""}
          onClick={() => applyLocale("en-US")}
          disabled={busy || isPending}
        >
          영어
        </button>
        <button
          type="button"
          className={locale === "ko-KR" ? "is-active" : ""}
          onClick={() => applyLocale("ko-KR")}
          disabled={busy || isPending}
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
        disabled={busy || isPending}
      />
      <button
        type="button"
        className="kordle-create-btn"
        onClick={() => createPuzzle(false)}
        disabled={busy || isPending || customWordInvalid || !hasCustomWord}
      >
        {roundEnded ? "새 문제 만들기" : "문제 만들기"}
      </button>
      <button
        type="button"
        className="kordle-random-btn"
        onClick={() => createPuzzle(true)}
        disabled={busy || isPending}
      >
        무작위 문제
      </button>
      </>}
      {puzzleStatus === "DRAFT" && (
        <button
          type="button"
          className="kordle-start-btn"
          onClick={() => startPuzzle()}
          disabled={busy || isPending || !puzzleId}
        >
          게임 시작
        </button>
      )}
      {(puzzleStatus === "DRAFT" || puzzleStatus === "LIVE") && (
        <button
          type="button"
          className="kordle-stop-btn"
          onClick={() => stopPuzzle()}
          disabled={busy || isPending || !puzzleId}
        >
          {puzzleStatus === "LIVE" ? "게임 종료" : "문제 취소"}
        </button>
      )}
      {hasCustomWord && canCreatePuzzle && (
        <span className={customWordInvalid ? "kordle-word-count is-invalid" : "kordle-word-count"}>
          {normalizedLength}/{WORD_LENGTH}
        </span>
      )}
      {error && <span className="kordle-control-error" role="alert">{error}</span>}
    </div>
  );
}
