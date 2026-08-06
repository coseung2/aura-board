"use client";

import {
  type FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type {
  LiveQuizAdminQuestion,
  LiveQuizQuestionInput,
} from "@/lib/live-quiz/contracts";

import styles from "./live-quiz-admin.module.css";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;
const EMPTY_DRAFT: LiveQuizQuestionInput = {
  prompt: "",
  choices: ["", "", "", ""],
  correctChoice: 0,
  explanation: "",
  category: "",
};

type Props = {
  pending: LiveQuizAdminQuestion[];
  approved: LiveQuizAdminQuestion[];
};

export function LiveQuizAdminPanel({ pending, approved }: Props) {
  return (
    <div className={styles.stack}>
      <PlannerForm />

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p>이용자 추천</p>
            <h2>검수 대기 {pending.length}건</h2>
          </div>
          <span>문구·선택지를 고쳐서 승인할 수 있습니다.</span>
        </div>
        {pending.length === 0 ? (
          <div className={styles.empty}>검수 대기 중인 추천 문제가 없습니다.</div>
        ) : (
          <div className={styles.reviewGrid}>
            {pending.map((question) => (
              <ReviewCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p>방송 문제 풀</p>
            <h2>승인 문제 {approved.length}건</h2>
          </div>
          <span>당일 세션 확정 뒤 보관해도 그날 방송에는 유지됩니다.</span>
        </div>
        {approved.length === 0 ? (
          <div className={styles.empty}>승인된 문제가 없습니다.</div>
        ) : (
          <div className={styles.approvedList}>
            {approved.map((question) => (
              <ApprovedQuestion key={question.id} question={question} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlannerForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<LiveQuizQuestionInput>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/live-quiz/questions", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("create_failed");
      setDraft(EMPTY_DRAFT);
      setMessage("기획 문제가 승인 상태로 추가되었습니다.");
      router.refresh();
    } catch {
      setError("문제를 추가하지 못했습니다. 문제와 선택지를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.section} ${styles.planner}`}>
      <div className={styles.sectionHeading}>
        <div>
          <p>운영자 기획</p>
          <h2>문제 직접 추가</h2>
        </div>
        <span>저장 즉시 승인 문제 풀에 들어갑니다.</span>
      </div>
      <form onSubmit={submit}>
        <QuestionEditor value={draft} onChange={setDraft} radioName="planner" />
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            {busy ? "추가 중…" : "기획 문제 추가"}
          </button>
          {message ? <p className={styles.success}>{message}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}

function ReviewCard({ question }: { question: LiveQuizAdminQuestion }) {
  const router = useRouter();
  const [draft, setDraft] = useState<LiveQuizQuestionInput>({
    prompt: question.prompt,
    choices: question.choices,
    correctChoice: question.correctChoice,
    explanation: question.explanation,
    category: question.category,
  });
  const [reviewNote, setReviewNote] = useState("");
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    if (busyAction) return;
    if (action === "reject" && reviewNote.trim().length < 2) {
      setError("반려 이유를 두 글자 이상 적어 주세요.");
      return;
    }
    setBusyAction(action);
    setError(null);
    try {
      const body =
        action === "approve"
          ? { action, question: draft, reviewNote }
          : { action, reviewNote };
      const response = await fetch(
        `/api/admin/live-quiz/questions/${encodeURIComponent(question.id)}`,
        {
          method: "PATCH",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error("review_failed");
      router.refresh();
    } catch {
      setError("검수 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article className={styles.reviewCard}>
      <header className={styles.reviewMeta}>
        <div>
          <span>{submitterLabel(question.submitterType)}</span>
          <strong>{question.submitterName}</strong>
          {question.submitterContext ? <small>{question.submitterContext}</small> : null}
        </div>
        <time dateTime={question.createdAt}>
          {formatDateTime(question.createdAt)}
        </time>
      </header>

      <QuestionEditor
        value={draft}
        onChange={setDraft}
        radioName={`review-${question.id}`}
        compact
      />

      <label className={styles.noteField}>
        <span>검수 메모 / 반려 이유</span>
        <textarea
          value={reviewNote}
          rows={2}
          maxLength={500}
          placeholder="승인 시 수정 사항, 반려 시 이유를 적어 주세요."
          onChange={(event) => setReviewNote(event.target.value)}
        />
      </label>

      <div className={styles.reviewActions}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busyAction !== null}
          onClick={() => void review("approve")}
        >
          {busyAction === "approve" ? "승인 중…" : "수정 후 승인"}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={busyAction !== null}
          onClick={() => void review("reject")}
        >
          {busyAction === "reject" ? "반려 중…" : "반려"}
        </button>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </article>
  );
}

function ApprovedQuestion({ question }: { question: LiveQuizAdminQuestion }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (busy) return;
    if (!window.confirm("이 문제를 방송 문제 풀에서 보관 처리할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/live-quiz/questions/${encodeURIComponent(question.id)}`,
        {
          method: "PATCH",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "archive" }),
        },
      );
      if (!response.ok) throw new Error("archive_failed");
      router.refresh();
    } catch {
      setError("문제를 보관 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.approvedCard}>
      <div className={styles.approvedBody}>
        <div className={styles.approvedMeta}>
          <span className={styles.sourceChip}>{sourceLabel(question.source)}</span>
          {question.category ? <span>{question.category}</span> : null}
          <time dateTime={question.approvedAt ?? question.createdAt}>
            {formatDateTime(question.approvedAt ?? question.createdAt)}
          </time>
        </div>
        <h3>{question.prompt}</h3>
        <ol>
          {question.choices.map((choice, index) => (
            <li
              key={index}
              className={index === question.correctChoice ? styles.correctChoice : undefined}
            >
              <span>{OPTION_LABELS[index]}</span>
              {choice}
            </li>
          ))}
        </ol>
        {question.explanation ? <p>{question.explanation}</p> : null}
      </div>
      <div className={styles.approvedActions}>
        <button type="button" disabled={busy} onClick={() => void archive()}>
          {busy ? "처리 중…" : "보관"}
        </button>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </article>
  );
}

function QuestionEditor({
  value,
  onChange,
  radioName,
  compact = false,
}: {
  value: LiveQuizQuestionInput;
  onChange: (next: LiveQuizQuestionInput) => void;
  radioName: string;
  compact?: boolean;
}) {
  function updateChoice(index: number, choice: string) {
    const choices = [...value.choices] as [string, string, string, string];
    choices[index] = choice;
    onChange({ ...value, choices });
  }

  return (
    <div className={compact ? styles.editorCompact : styles.editor}>
      <div className={styles.editorTopRow}>
        <label>
          <span>분류</span>
          <input
            value={value.category}
            maxLength={40}
            placeholder="상식, 과학 등"
            onChange={(event) => onChange({ ...value, category: event.target.value })}
          />
        </label>
        <label className={styles.promptField}>
          <span>문제</span>
          <textarea
            value={value.prompt}
            rows={compact ? 2 : 3}
            maxLength={300}
            required
            onChange={(event) => onChange({ ...value, prompt: event.target.value })}
          />
        </label>
      </div>

      <fieldset className={styles.choiceFields}>
        <legend>선택지 · 왼쪽 원이 정답</legend>
        {value.choices.map((choice, index) => (
          <div key={index}>
            <label className={styles.answerRadio}>
              <input
                type="radio"
                checked={value.correctChoice === index}
                onChange={() => onChange({ ...value, correctChoice: index })}
                name={radioName}
              />
              <span>{OPTION_LABELS[index]}</span>
            </label>
            <input
              value={choice}
              maxLength={120}
              required
              aria-label={`${OPTION_LABELS[index]} 선택지`}
              onChange={(event) => updateChoice(index, event.target.value)}
            />
          </div>
        ))}
      </fieldset>

      <label className={styles.explanationField}>
        <span>한 줄 해설</span>
        <textarea
          value={value.explanation}
          rows={2}
          maxLength={500}
          onChange={(event) => onChange({ ...value, explanation: event.target.value })}
        />
      </label>
    </div>
  );
}

function submitterLabel(type: string): string {
  if (type === "student") return "학생 추천";
  if (type === "teacher") return "교사 추천";
  return "운영자";
}

function sourceLabel(source: string): string {
  if (source === "starter") return "기본 문제";
  if (source === "admin") return "운영자 기획";
  return "이용자 추천";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
