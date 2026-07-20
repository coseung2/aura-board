import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../lib/api";

export type RecapSong = {
  key: string;
  title: string;
  linkImage: string | null;
  videoId: string | null;
  plays: number;
  firstSubmitter: string | null;
};

export type RecapSubmitter = {
  id: string | null;
  name: string;
  plays: number;
  uniqueSongs: number;
};

export type RecapData = {
  period: { from: string; to: string; label: string };
  totals: {
    plays: number;
    uniqueSongs: number;
    uniqueSubmitters: number;
    totalMinutes: number;
  };
  topSongs: RecapSong[];
  topSubmitters: RecapSubmitter[];
  submittersHidden?: boolean;
  byDay: Array<{ date: string; plays: number }>;
  spotlight: { topSong: RecapSong | null; topSubmitter: RecapSubmitter | null };
};

export function useDJRecapData({
  open,
  boardId,
  month,
}: {
  open: boolean;
  boardId: string;
  month: string;
}) {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await apiFetch<RecapData>(
          `/api/dj/recap?boardId=${encodeURIComponent(boardId)}&month=${encodeURIComponent(month)}`,
        );
        if (!cancelled) setData(response);
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError) setError(`불러오기 실패 (${e.status})`);
          else setError(e instanceof Error ? e.message : "불러올 수 없어요");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, month]);

  return { data, loading, error };
}

export function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month
    .split("-")
    .map((part) => parseInt(part, 10));
  const date = new Date(year!, (monthNumber ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${parseInt(monthNumber!, 10)}월`;
}
