import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  boardDetailCacheKey,
  invalidateBoardCache,
  STUDENT_HOME_CACHE_KEY,
} from "../lib/board-cache";
import { clearSessionToken, getUnifiedLoginRoute } from "../lib/session";
import type { BoardDetailResponse } from "../lib/types";

export function useInputBoard(slug: string) {
  const router = useRouter();
  const [data, setData] = useState<BoardDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    if (!slug) {
      setError("보드 링크가 올바르지 않아요.");
      return;
    }
    void apiFetch<BoardDetailResponse>(
      `/api/student/board/${encodeURIComponent(slug)}`,
      { headers: { "x-aura-revalidate": "1" } },
    )
      .then((response) => {
        if (active) setData(response);
      })
      .catch(async (cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setError(
          cause instanceof Error ? cause.message : "보드를 불러오지 못했어요.",
        );
      });
    return () => {
      active = false;
    };
  }, [slug, attempt, router]);
  const invalidate = useCallback(() => {
    invalidateBoardCache(boardDetailCacheKey(slug));
    invalidateBoardCache(BOARD_LIST_CACHE_KEY);
    invalidateBoardCache(STUDENT_HOME_CACHE_KEY);
  }, [slug]);
  return {
    data,
    error,
    retry: () => setAttempt((value) => value + 1),
    invalidate,
  };
}
