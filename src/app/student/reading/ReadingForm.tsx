"use client";

import { useEffect, useState } from "react";
import {
  fetchReadingEntries,
  saveReadingEntry,
  type BookType,
  type ReadingEntry,
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

export function ReadingForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchReadingEntries()
      .then((data) => {
        if (alive) setEntries(data.entries);
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
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
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
      setNotice("저장했어요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="reading-page">
      <section className="reading-form-card">
        <h1 className="reading-page-title">독서</h1>
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
              rows={5}
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
                {(entry.aiScore !== null || entry.aiFeedback) && (
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
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
