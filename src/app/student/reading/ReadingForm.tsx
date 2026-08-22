"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchReadingFeedback,
  fetchReadingEntries,
  generateReadingFeedback,
  saveReadingEntry,
  ReadingFeedbackError,
  type BookType,
  type ReadingEntry,
  type ReadingEvaluationFields,
} from "@/lib/reading-client";

const BOOK_OPTIONS: Array<{ value: BookType; label: string }> = [
  { value: "comic", label: "만화책" },
  { value: "story", label: "이야기책" },
];

type FormState = {
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
};

const EMPTY_FORM: FormState = {
  bookType: "story",
  title: "",
  author: "",
  reflection: "",
};

const FEEDBACK_POLL_INTERVAL_MS = 4_000;
const FEEDBACK_POLL_TIMEOUT_MS = 2 * 60_000;
const FEEDBACK_RETRY_COUNT = 1;

type FeedbackPollResult = "generated" | "failed" | "timed_out";

export function ReadingForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeFeedbackIds = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    setError(null);
    fetchReadingEntries()
      .then((data) => {
        if (alive) {
          setEntries(data.entries);
          const recentCutoff = Date.now() - 10 * 60_000;
          const entryToResume = data.entries.find((entry) => {
            const isRecentPending =
              entry.aiFeedbackStatus === "pending" &&
              new Date(entry.updatedAt).getTime() >= recentCutoff;
            return entry.aiFeedbackStatus === "processing" || isRecentPending;
          });
          if (entryToResume) {
            void requestFeedback(entryToResume.id);
          }
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "독서 기록을 불러오지 못했어요.");
        }
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
      mounted.current = false;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }

  function updateEvaluation(readingLogId: string, evaluation: ReadingEvaluationFields) {
    if (!mounted.current) return;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === readingLogId ? { ...entry, ...evaluation } : entry,
      ),
    );
  }

  function setFeedbackProcessing(readingLogId: string) {
    if (!mounted.current) return;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === readingLogId
          ? { ...entry, aiFeedbackStatus: "processing", aiFeedbackError: null }
          : entry,
      ),
    );
  }

  async function pollFeedback(readingLogId: string): Promise<FeedbackPollResult> {
    const deadline = Date.now() + FEEDBACK_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, FEEDBACK_POLL_INTERVAL_MS));
      try {
        const { evaluation } = await fetchReadingFeedback(readingLogId);
        updateEvaluation(readingLogId, evaluation);
        if (evaluation.aiFeedbackStatus === "generated") return "generated";
        if (evaluation.aiFeedbackStatus === "failed") return "failed";
      } catch {
        // A status check is best-effort. The next interval or the retrying POST
        // will recover from a transient network/API failure.
      }
    }
    return "timed_out";
  }

  function canRetryFeedback(error: unknown): boolean {
    if (!(error instanceof ReadingFeedbackError)) return true;
    if (error.code === "reading_ai_key_missing") return false;
    return error.status === 409 || error.status === 429 || error.status >= 500;
  }

  async function requestFeedback(readingLogId: string) {
    if (activeFeedbackIds.current.has(readingLogId)) return;
    activeFeedbackIds.current.add(readingLogId);
    setFeedbackProcessing(readingLogId);
    try {
      for (let attempt = 0; attempt <= FEEDBACK_RETRY_COUNT; attempt += 1) {
        try {
          const { evaluation } = await generateReadingFeedback(readingLogId);
          updateEvaluation(readingLogId, evaluation);
          if (mounted.current && evaluation.aiFeedbackStatus === "generated") {
            setNotice("피드백이 준비됐어요.");
          }
          return;
        } catch (err) {
          if (!canRetryFeedback(err)) {
            updateEvaluation(readingLogId, {
              aiScore: null,
              aiFeedback: null,
              aiFeedbackStatus: "failed",
              aiFeedbackModel: null,
              aiFeedbackError: "피드백을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
              evaluatedAt: null,
            });
            return;
          }

          if (mounted.current) {
            setNotice("피드백을 기다리는 중이에요. 완료되면 자동으로 표시돼요.");
          }
          const pollResult = await pollFeedback(readingLogId);
          if (pollResult === "generated") {
            if (mounted.current) setNotice("피드백이 준비됐어요.");
            return;
          }
          if (attempt === FEEDBACK_RETRY_COUNT) {
            updateEvaluation(readingLogId, {
              aiScore: null,
              aiFeedback: null,
              aiFeedbackStatus: "failed",
              aiFeedbackModel: null,
              aiFeedbackError: "피드백을 준비하는 데 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.",
              evaluatedAt: null,
            });
            return;
          }
          setFeedbackProcessing(readingLogId);
        }
      }
    } finally {
      activeFeedbackIds.current.delete(readingLogId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const title = form.title.trim();
    const author = form.author.trim();
    const reflection = form.reflection.trim();
    if (!title) {
      setError("책 제목을 입력해 주세요.");
      return;
    }
    if (!author) {
      setError("지은이를 입력해 주세요.");
      return;
    }
    if (!reflection) {
      setError("독서 감상을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const { entry } = await saveReadingEntry({
        bookType: form.bookType,
        title,
        author,
        reflection,
      });
      setEntries((prev) => [entry, ...prev]);
      setForm(EMPTY_FORM);
      setNotice("저장했어요. 피드백을 기다리는 중이에요.");
      void requestFeedback(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="reading-page">
      <section className="reading-form-card">
        <form className="reading-form" onSubmit={handleSubmit}>
          <div className="reading-form-row">
            <label className="reading-field">
              <span className="reading-field-label">종류</span>
              <div className="reading-segmented" role="radiogroup" aria-label="책 종류">
                {BOOK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={form.bookType === opt.value}
                    className={`reading-segmented-option ${
                      form.bookType === opt.value ? "is-active" : ""
                    }`}
                    onClick={() => update("bookType", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <div className="reading-form-row reading-form-row-2">
            <label className="reading-field">
              <span className="reading-field-label">책 제목</span>
              <input
                type="text"
                className="reading-input"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="책 제목을 입력하세요"
                maxLength={80}
                disabled={submitting}
              />
            </label>
            <label className="reading-field">
              <span className="reading-field-label">지은이</span>
              <input
                type="text"
                className="reading-input"
                value={form.author}
                onChange={(e) => update("author", e.target.value)}
                placeholder="지은이를 입력하세요"
                maxLength={60}
                disabled={submitting}
              />
            </label>
          </div>

          <label className="reading-field">
            <span className="reading-field-label">독서 감상</span>
            <textarea
              className="reading-textarea"
              value={form.reflection}
              onChange={(e) => update("reflection", e.target.value)}
              placeholder="재미있었던 점이나 느낀 점을 적어 보세요."
              rows={10}
              maxLength={600}
              disabled={submitting}
            />
          </label>

          {error && <p className="reading-form-error">{error}</p>}
          {notice && <p className="reading-form-notice">{notice}</p>}

          <div className="reading-form-actions">
            <button
              type="submit"
              className="reading-submit-btn"
              disabled={submitting}
            >
              {submitting ? "저장 중..." : "저장하기"}
            </button>
          </div>
        </form>
      </section>

      <section className="reading-entries-card">
        <h2 className="reading-entries-title">내 독서 기록</h2>
        {!loaded ? (
          <p className="reading-entries-empty">불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="reading-entries-empty">아직 기록이 없어요.</p>
        ) : (
          <ul className="reading-entries-list">
            {entries.map((entry) => (
              <li key={entry.id} className="reading-entry">
                <div className="reading-entry-head">
                  <span
                    className={`reading-entry-badge reading-entry-badge-${
                      entry.bookType
                    }`}
                  >
                    {entry.bookType === "comic" ? "만화책" : "이야기책"}
                  </span>
                  <span className="reading-entry-title">{entry.title}</span>
                </div>
                {(entry.author || entry.createdAt) && (
                  <p className="reading-entry-meta">
                    {entry.author && <span>{entry.author}</span>}
                    {entry.author && entry.createdAt && <span aria-hidden="true"> · </span>}
                    {entry.createdAt && (
                      <span>
                        {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                    )}
                  </p>
                )}
                {entry.reflection && (
                  <p className="reading-entry-reflection">{entry.reflection}</p>
                )}
                {entry.aiFeedbackStatus === "generated" &&
                (entry.aiScore !== null || entry.aiFeedback) ? (
                  <div className="reading-entry-evaluation">
                    {entry.aiScore !== null && (
                      <span className="reading-entry-score">
                        {entry.aiScore}점
                      </span>
                    )}
                    {entry.aiFeedback && (
                      <span className="reading-entry-feedback">
                        {entry.aiFeedback}
                      </span>
                    )}
                  </div>
                ) : entry.aiFeedbackStatus === "failed" ? (
                  <div className="reading-entry-evaluation reading-entry-evaluation-status">
                    <span className="reading-entry-feedback">
                      피드백을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.
                    </span>
                    <button
                      type="button"
                      className="reading-feedback-retry"
                      onClick={() => void requestFeedback(entry.id)}
                    >
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <div className="reading-entry-evaluation reading-entry-evaluation-status">
                    <span className="reading-entry-feedback">피드백을 기다리는 중...</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
