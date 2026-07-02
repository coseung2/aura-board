// Client-only fetch helpers for the student 독서(reading reflection) feature.
//
// Isolated from server/db code so the backend contract for
// GET/POST /api/student/reading can be implemented independently.
// Helpers throw an Error carrying the server `error` message on non-ok
// responses so callers can surface it directly.

export type BookType = "comic" | "story";

export type ReadingEntry = {
  id: string;
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
  aiScore: number | null;
  aiFeedback: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReadingEntryInput = {
  bookType: BookType;
  title: string;
  author: string;
  reflection: string;
};

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

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const msg = body.message ?? body.error;
  return typeof msg === "string" ? msg : `요청 실패 (${res.status})`;
}
