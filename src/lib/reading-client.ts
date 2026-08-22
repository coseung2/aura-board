// Client-only fetch helpers for the student 독서(reading reflection) feature.
//
// Isolated from server/db code so the backend contract for
// GET/POST /api/student/reading can be implemented independently.
// Helpers throw an Error carrying the server `error` message on non-ok
// responses so callers can surface it directly.

export type BookType = "comic" | "story";

export type ReadingFeedbackStatus =
  | "pending"
  | "processing"
  | "generated"
  | "failed";

export type ReadingEvaluationFields = {
  aiScore: number | null;
  aiFeedback: string | null;
  aiFeedbackStatus: ReadingFeedbackStatus;
  aiFeedbackModel: string | null;
  aiFeedbackError: string | null;
  evaluatedAt: string | null;
};

export type ReadingEntry = ReadingEvaluationFields & {
  id: string;
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingEntryInput = {
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
};

export class ReadingFeedbackError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = "ReadingFeedbackError";
  }
}

// GET /api/student/reading -> { entries: ReadingEntry[], count: number }
export async function fetchReadingEntries(): Promise<{
  entries: ReadingEntry[];
  count: number;
}> {
  const res = await fetch("/api/student/reading", { cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as { entries: ReadingEntry[]; count: number };
}

// POST /api/student/reading { bookType, title, author, reflection } -> { entry }
export async function saveReadingEntry(
  input: ReadingEntryInput,
): Promise<{ entry: ReadingEntry }> {
  const res = await fetch("/api/student/reading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as { entry: ReadingEntry };
}

export async function generateReadingFeedback(
  readingLogId: string,
): Promise<{ evaluation: ReadingEvaluationFields }> {
  const res = await fetch(`/api/student/reading/${encodeURIComponent(readingLogId)}/feedback`, {
    method: "POST",
  });
  if (!res.ok) throw await feedbackError(res);
  return (await res.json()) as { evaluation: ReadingEvaluationFields };
}

export async function fetchReadingFeedback(
  readingLogId: string,
): Promise<{ evaluation: ReadingEvaluationFields }> {
  const res = await fetch(`/api/student/reading/${encodeURIComponent(readingLogId)}/feedback`, {
    cache: "no-store",
  });
  if (!res.ok) throw await feedbackError(res);
  return (await res.json()) as { evaluation: ReadingEvaluationFields };
}

async function feedbackError(res: Response): Promise<ReadingFeedbackError> {
  const body = await res.json().catch(() => ({}));
  const message = body.message ?? body.error;
  return new ReadingFeedbackError(
    typeof message === "string" ? message : `요청 실패 (${res.status})`,
    res.status,
    typeof body.error === "string" ? body.error : null,
  );
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const msg = body.message ?? body.error;
  return typeof msg === "string" ? msg : `요청 실패 (${res.status})`;
}
