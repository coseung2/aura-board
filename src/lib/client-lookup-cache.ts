"use client";

export const CLASSROOM_LIST_CHANGED_EVENT = "aura:classroom-list-changed";
export const ROSTER_CHANGED_EVENT = "aura:roster-changed";

const CLASSROOMS_TTL_MS = 60_000;
const STUDENTS_TTL_MS = 120_000;
const BREAKOUT_TEMPLATES_TTL_MS = 30 * 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type Student = {
  id: string;
  name: string;
  number: number | null;
  gender?: string | null;
};

type ToolkitClassroom = {
  id: string;
  name: string;
  studentCount: number | null;
};

type BreakoutTemplate = {
  id: string;
  key: string;
  name: string;
  description: string;
  tier: "free" | "pro";
  requiresPro: boolean;
  scope: "system" | "teacher" | "school";
  recommendedVisibility: "own-only" | "peek-others";
  defaultGroupCount: number;
  defaultGroupCapacity: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function now() {
  return Date.now();
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

async function fetchCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: { force?: boolean } = {},
): Promise<T> {
  if (!options.force) {
    const cached = getCached<T>(key);
    if (cached) return cached;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const pending = load()
    .then((value) => {
      cache.set(key, { value, expiresAt: now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

function invalidateByPrefix(prefix: string) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of Array.from(inflight.keys())) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export async function fetchToolkitClassrooms(
  options: { force?: boolean } = {},
) {
  return fetchCached<ToolkitClassroom[]>(
    "toolkit-classrooms",
    CLASSROOMS_TTL_MS,
    async () => {
      const res = await fetch("/api/toolkit/classrooms", { cache: "no-store" });
      if (!res.ok) throw new Error("학급 목록을 불러오지 못했어요.");
      const data = (await res.json()) as { classrooms?: ToolkitClassroom[] };
      return data.classrooms ?? [];
    },
    options,
  );
}

export async function fetchClassroomStudents<T extends Student = Student>(
  classroomId: string,
  options: { force?: boolean } = {},
) {
  return fetchCached<T[]>(
    `classroom-students:${classroomId}`,
    STUDENTS_TTL_MS,
    async () => {
      const res = await fetch(`/api/classroom/${classroomId}/students`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { students?: T[] };
      return data.students ?? [];
    },
    options,
  );
}

export async function fetchBreakoutTemplates(
  options: { force?: boolean } = {},
) {
  return fetchCached<BreakoutTemplate[]>(
    "breakout-templates",
    BREAKOUT_TEMPLATES_TTL_MS,
    async () => {
      const res = await fetch("/api/breakout/templates", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { templates?: BreakoutTemplate[] };
      return data.templates ?? [];
    },
    options,
  );
}

export function notifyClassroomListChanged() {
  invalidateByPrefix("toolkit-classrooms");
  window.dispatchEvent(new CustomEvent(CLASSROOM_LIST_CHANGED_EVENT));
}

export function notifyRosterChanged(classroomId: string) {
  invalidateByPrefix(`classroom-students:${classroomId}`);
  window.dispatchEvent(
    new CustomEvent(ROSTER_CHANGED_EVENT, { detail: { classroomId } }),
  );
}

export function onClassroomListChanged(callback: () => void) {
  window.addEventListener(CLASSROOM_LIST_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CLASSROOM_LIST_CHANGED_EVENT, callback);
}

export function onRosterChanged(
  classroomId: string | null | undefined,
  callback: () => void,
) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ classroomId?: string }>).detail;
    if (!classroomId || detail?.classroomId === classroomId) callback();
  };
  window.addEventListener(ROSTER_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ROSTER_CHANGED_EVENT, handler);
}
