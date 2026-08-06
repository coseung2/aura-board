"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  LiveQuizQuestionInput,
  LiveQuizSuggestionSummary,
} from "@/lib/live-quiz/contracts";

import styles from "./live-quiz.module.css";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

const EMPTY_QUESTION: LiveQuizQuestionInput = {
  prompt: "",
  choices: ["", "", "", ""],
  correctChoice: 0,
  explanation: "",
  category: "",
};

type Props = {
  contentClassName: string;
  displayName: string;
};

export function LiveQuizSuggestionPanel({
  contentClassName,
  displayName,
}: Props) {
  const [draft, setDraft] = useState<LiveQuizQuestionInput>(EMPTY_QUESTION);
  const [suggestions, setSuggestions] = useState<LiveQuizSuggestionSummary[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const response = await fetch("/api/live-quiz/suggestions", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("추천 내역을 불러오지 못했습니다.");
      const body = (await response.json()) as {
        suggestions: LiveQuizSuggestionSummary[];
      };
      setSuggestions(body.suggestions);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "추천 내역을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const canSubmit = useMemo(
    () =>
      draft.prompt.trim().length >= 4 &&
      draft.choices.every((choice) => choice.trim().length > 0) &&
      new Set(draft.choices.map((choice) => choice.trim().toLowerCase())).size === 4,
    [draft],
  );

  function updateChoice(index: number, value: string) {
    setDraft((current) => {
      const choices = [...current.choices] as [string, string, string, string];
      choices[index] = value;
      return { ...current, choices };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/live-quiz/suggestions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        if (response.status === 429 || body?.error === "suggestion_daily_limit") {
          throw new Error("하루 추천 한도 5개를 모두 사용했습니다.");
        }
        throw new Error("문제를 제출하지 못했습니다. 내용을 확인해 주세요.");
      }
      setDraft(EMPTY_QUESTION);
      setMessage("추천 문제를 보냈습니다. 검수 결과는 아래에서 확인할 수 있어요.");
      await loadSuggestions();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "문제를 제출하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`${contentClassName} ${styles.suggestionLayout}`}>
      <form className={styles.suggestionForm} onSubmit={submit}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>이용자 추천 문제</p>
            <h2>라이브 문제 제안하기</h2>
          </div>
          <span className={styles.dailyLimit}>24시간 최대 5개</span>
        </div>
        <p className={styles.formIntro}>
          {displayName}님이 만든 문제는 운영자 검수와 수정을 거친 뒤 라이브 문제 풀에
          들어갑니다.
        </p>

        <label className={styles.field}>
          <span>분류</span>
          <input
            value={draft.category}
            maxLength={40}
            placeholder="예: 과학, 학교생활, 상식"
            onChange={(event) =>
              setDraft((current) => ({ ...current, category: event.target.value }))
            }
          />
        </label>

        <label className={styles.field}>
          <span>문제</span>
          <textarea
            value={draft.prompt}
            maxLength={300}
            rows={3}
            required
            placeholder="누구나 이해할 수 있게 한 문장으로 적어 주세요."
            onChange={(event) =>
              setDraft((current) => ({ ...current, prompt: event.target.value }))
            }
          />
        </label>

        <fieldset className={styles.choiceEditor}>
          <legend>선택지와 정답</legend>
          {draft.choices.map((choice, index) => (
            <div className={styles.choiceEditRow} key={index}>
              <label className={styles.correctRadio}>
                <input
                  type="radio"
                  name="correct-choice"
                  checked={draft.correctChoice === index}
                  onChange={() =>
                    setDraft((current) => ({ ...current, correctChoice: index }))
                  }
                />
                <span>{OPTION_LABELS[index]}</span>
              </label>
              <input
                value={choice}
                maxLength={120}
                required
                aria-label={`${OPTION_LABELS[index]} 선택지`}
                placeholder={`${OPTION_LABELS[index]} 선택지`}
                onChange={(event) => updateChoice(index, event.target.value)}
              />
            </div>
          ))}
          <p>왼쪽 원을 눌러 정답 하나를 지정하세요.</p>
        </fieldset>

        <label className={styles.field}>
          <span>한 줄 해설</span>
          <textarea
            value={draft.explanation}
            maxLength={500}
            rows={2}
            placeholder="정답을 이해하는 데 도움이 되는 설명을 적어 주세요."
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                explanation: event.target.value,
              }))
            }
          />
        </label>

        <button
          type="submit"
          className={styles.primaryButton}
          disabled={!canSubmit || submitting}
        >
          {submitting ? "제출 중…" : "검수 요청하기"}
        </button>
        {message ? <p className={styles.successNotice}>{message}</p> : null}
        {error ? <p className={styles.errorNotice} role="alert">{error}</p> : null}
      </form>

      <aside className={styles.suggestionHistory}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>내 추천</p>
            <h2>검수 현황</h2>
          </div>
        </div>
        {loadingSuggestions ? (
          <p className={styles.mutedText}>추천 내역을 불러오는 중…</p>
        ) : suggestions.length === 0 ? (
          <div className={styles.emptyHistory}>
            <span aria-hidden>💡</span>
            <p>아직 추천한 문제가 없습니다.</p>
          </div>
        ) : (
          <ol className={styles.historyList}>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <div>
                  <span className={`${styles.statusChip} ${styles[suggestion.status]}`}>
                    {statusLabel(suggestion.status)}
                  </span>
                  <time dateTime={suggestion.createdAt}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                    }).format(new Date(suggestion.createdAt))}
                  </time>
                </div>
                <strong>{suggestion.prompt}</strong>
                {suggestion.reviewNote ? <p>{suggestion.reviewNote}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </section>
  );
}

function statusLabel(status: LiveQuizSuggestionSummary["status"]): string {
  switch (status) {
    case "approved":
      return "승인";
    case "rejected":
      return "반려";
    case "archived":
      return "보관";
    default:
      return "검수 대기";
  }
}
