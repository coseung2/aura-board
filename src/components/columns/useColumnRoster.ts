"use client";

import { useEffect, useState } from "react";
import type { CardData } from "../DraggableCard";
import {
  fetchClassroomStudents,
  onRosterChanged,
} from "@/lib/client-lookup-cache";

export type RosterEntry = {
  id: string;
  name: string;
  number: number | null;
};

type Options = {
  classroomId?: string | null;
  canEdit: boolean;
};

export function useColumnRoster({ classroomId, canEdit }: Options) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);

  useEffect(() => {
    if (!canEdit || !classroomId) return;
    let cancelled = false;
    const load = async (force = false) => {
      try {
        const nextRoster = await fetchClassroomStudents<RosterEntry>(
          classroomId,
          { force },
        );
        if (!cancelled) setRoster(nextRoster);
      } catch {
        /* roster fetch best-effort */
      }
    };
    void load();
    const unsubscribe = onRosterChanged(classroomId, () => void load(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [canEdit, classroomId]);

  /** Dedupes author ids across CardAuthor multi-rows and the legacy
   *  singleton studentAuthorId. If the roster is still loading, falls back
   *  to author displayNames inlined on the cards (no number-order sort). */
  function authorsForSection(sectionCards: CardData[]): RosterEntry[] {
    const ids = new Set<string>();
    for (const c of sectionCards) {
      if (c.studentAuthorId) ids.add(c.studentAuthorId);
      for (const a of c.authors ?? []) {
        if (a.studentId) ids.add(a.studentId);
      }
    }
    if (ids.size === 0) return [];
    if (roster.length === 0) {
      const map = new Map<string, RosterEntry>();
      for (const c of sectionCards) {
        for (const a of c.authors ?? []) {
          if (a.studentId && !map.has(a.studentId)) {
            map.set(a.studentId, {
              id: a.studentId,
              name: a.displayName,
              number: null,
            });
          }
        }
        if (c.studentAuthorId && !map.has(c.studentAuthorId)) {
          map.set(c.studentAuthorId, {
            id: c.studentAuthorId,
            name: c.studentAuthorName ?? "",
            number: null,
          });
        }
      }
      return Array.from(map.values()).filter((s) => s.name);
    }
    return roster
      .filter((s) => ids.has(s.id))
      .sort((a, b) => {
        if (a.number == null && b.number == null)
          return a.name.localeCompare(b.name, "ko");
        if (a.number == null) return 1;
        if (b.number == null) return -1;
        return a.number - b.number;
      });
  }

  /** Extract "N번 Name" columns seeded from a classroom roster. Returns
   *  null when the roster hasn't loaded or the title isn't a match. */
  function studentForSectionTitle(title: string): RosterEntry | null {
    if (roster.length === 0) return null;
    const m = title.match(/^(\d+)번\s*(.+)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const name = m[2].trim();
      const hit = roster.find((s) => s.number === num && s.name === name);
      if (hit) return hit;
    }
    const exact = roster.find((s) => s.name === title.trim());
    return exact ?? null;
  }

  return { roster, authorsForSection, studentForSectionTitle };
}
