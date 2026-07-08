// Client-only fetch helpers for the morning inspection features
// (cleaning inspector, shoe inspector, teacher morning dashboard).
//
// These are intentionally isolated from any server/db code so the backend
// contract can be implemented independently. All routes below are PROPOSED;
// see the integration notes for the full contract.
//
// Every helper throws an Error with a server-provided `error` message when the
// response is not ok, so callers can surface it directly.

import { uploadFile } from "./upload-client";

export type StudentRef = {
  id: string;
  name: string;
  number: number | null;
};

// ---- Cleaning inspection ----------------------------------------------

export type CleaningFinding = {
  dirty: boolean;
  photoUrl: string | null;
  note: string | null;
  recordedAt: string | null;
  recordedByName: string | null;
};

export type CleaningRosterEntry = {
  student: StudentRef;
  seatLabel: string | null;
  finding: CleaningFinding | null;
};

export type CleaningRosterResponse = {
  date: string;
  inspector: { id: string; name: string } | null;
  roster: CleaningRosterEntry[];
};

export type CleaningFindingInput = {
  studentId: string;
  dirty: boolean;
  note?: string | null;
  photoUrl?: string | null;
};

// GET /api/classrooms/:id/inspections/cleaning
export async function fetchCleaningRoster(
  classroomId: string,
  date?: string | null,
): Promise<CleaningRosterResponse> {
  const url = new URL(`/api/classrooms/${classroomId}/inspections/cleaning`, window.location.origin);
  if (date) {
    url.searchParams.set("date", date);
  }
  const res = await fetch(url.pathname + url.search, {
   cache: "no-store",
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as CleaningRosterResponse;
}

// POST /api/classrooms/:id/inspections/cleaning  { findings: CleaningFindingInput[] }
export async function saveCleaningFindings(
  classroomId: string,
  findings: CleaningFindingInput[],
  date?: string | null,
): Promise<{ savedAt: string }> {
  const res = await fetch(`/api/classrooms/${classroomId}/inspections/cleaning`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      findings,
      date: date ?? null,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as { savedAt: string };
}

// ---- Shoe inspection --------------------------------------------------

export type ShoeFinding = {
  notArranged: boolean;
  recordedAt: string | null;
  recordedByName: string | null;
};

export type ShoeRosterEntry = {
  student: StudentRef;
  finding: ShoeFinding | null;
};

export type ShoeRosterResponse = {
  date: string;
  inspector: { id: string; name: string } | null;
  roster: ShoeRosterEntry[];
};

export type ShoeFindingInput = {
  studentId: string;
  notArranged: boolean;
};

// GET /api/classrooms/:id/inspections/shoes
export async function fetchShoeRoster(
  classroomId: string,
  date?: string | null,
): Promise<ShoeRosterResponse> {
  const url = new URL(`/api/classrooms/${classroomId}/inspections/shoes`, window.location.origin);
  if (date) {
    url.searchParams.set("date", date);
  }
  const res = await fetch(url.pathname + url.search, {
   cache: "no-store",
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as ShoeRosterResponse;
}

// POST /api/classrooms/:id/inspections/shoes  { findings: ShoeFindingInput[] }
export async function saveShoeFindings(
  classroomId: string,
  findings: ShoeFindingInput[],
  date?: string | null,
): Promise<{ savedAt: string }> {
  const res = await fetch(`/api/classrooms/${classroomId}/inspections/shoes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ findings, date: date ?? null }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as { savedAt: string };
}

// ---- Shared evidence upload -------------------------------------------

export async function uploadInspectionEvidence(
  _classroomId: string,
  file: File,
): Promise<{ url: string }> {
  const uploaded = await uploadFile(file);
  return { url: uploaded.previewUrl ?? uploaded.url };
}

// ---- Teacher morning summary ------------------------------------------

export type MorningMissingAssignment = {
  student: StudentRef;
  tasks: Array<{ id: string; title: string; dueDate: string | null }>;
};
export type MorningMissingAssignmentBoard = {
  student: StudentRef;
  boards: Array<{ id: string; title: string; dueDate: string | null }>;
};


export type MorningCleaningItem = {
  student: StudentRef;
  seatLabel: string | null;
  photoUrl: string | null;
  note: string | null;
  recordedByName: string | null;
};

export type MorningShoeItem = {
  student: StudentRef;
  recordedByName: string | null;
};

export type MorningSummary = {
  date: string;
  classroomName: string;
  kpis: {
    totalStudents: number;
    missingAssignmentCount: number;
    missingAssignmentBoardCount: number;
    cleaningDirtyCount: number;
    shoeNotArrangedCount: number;
  };
  missingAssignments: MorningMissingAssignment[];
  cleaningFindings: MorningCleaningItem[];
  missingAssignmentBoards: MorningMissingAssignmentBoard[];
  shoeFindings: MorningShoeItem[];
  // 독서왕 leaderboard. Optional because the backend adds this in parallel;
  // the dashboard renders defensively when it is absent.
  readingChampions?: ReadingChampion[];
};

// ---- Reading champions (독서왕) --------------------------------------
// Surfaced on the teacher morning dashboard. Scoring formula is TBD on the
// backend; the UI only presents the score, it does not encode policy.
export type ReadingChampion = {
  student: StudentRef;
  totalScore: number;
  entryCount: number;
  latestTitle: string | null;
  latestBookType: "comic" | "story" | null;
};

// GET /api/classrooms/:id/morning-summary
export async function fetchMorningSummary(
  classroomId: string,
  date?: string,
): Promise<MorningSummary> {
  const query = date ? `?date=${date}` : '';
  const res = await fetch(`/api/classrooms/${classroomId}/morning-summary${query}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as MorningSummary;
}

async function errorMessage(res: Response): Promise<string> {
  const msg = (await res.json().catch(() => ({}))).error;
  return typeof msg === "string" ? msg : `요청 실패 (${res.status})`;
}
