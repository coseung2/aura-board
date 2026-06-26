import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "./api";
import type { BoardDetailResponse } from "./types";

/**
 * 학생 보드 화면 공통 realtime hook.
 *
 * - `board:{slug}` Supabase broadcast channel 을 구독 시도한다. Supabase env
 *   가 모바일 번들에 없으면 graceful no-op (refetch-on-focus 만 동작).
 * - broadcast 가 도착하면 `reload()` 를 호출해 부모에서 스냅샷을 다시 받게
 *   한다. 학생 보드 API 한 번 더 = 정확성 우선, 이후 broadcast 가 활발해지면
 *   카드별 patch 로 최적화 가능.
 */
export function useBoardRealtime({
  slug,
  onReload,
}: {
  slug: string;
  onReload: () => Promise<void> | void;
}) {
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;

  const reload = useCallback(() => {
    return Promise.resolve(reloadRef.current());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        // 모바일 번들에 @supabase/supabase-js 가 정적으로 포함돼 있지 않을 수 있어
        // dynamic require 로 안전하게 시도. 실패하면 broadcast 없이 동작.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("@supabase/supabase-js");
        const createClient = (mod?.createClient ?? mod?.default?.createClient) as
          | ((url: string, key: string, opts: object) => unknown)
          | undefined;
        if (!createClient) return;
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        }) as {
          channel: (name: string) => {
            on: (
              type: "broadcast",
              opts: { event: string },
              cb: (payload: unknown) => void,
            ) => unknown;
            subscribe: (cb?: (status: string) => void) => unknown;
          };
          removeChannel: (ch: unknown) => Promise<unknown>;
        };
        if (cancelled) return;
        const ch = client.channel(`board:${slug}`);
        ch.on("broadcast", { event: "card_changed" }, () => void reload());
        ch.on("broadcast", { event: "board_changed" }, () => void reload());
        ch.on("broadcast", { event: "queue_changed" }, () => void reload());
        ch.subscribe();
        channel = ch as unknown as { unsubscribe: () => void };
      } catch {
        // broadcast 미가용 — refetch on focus 가 1차 보장선.
      }
    })();
    return () => {
      cancelled = true;
      try {
        channel?.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [slug, reload]);

  return { reload };
}

export async function fetchStudentBoard(slug: string): Promise<BoardDetailResponse> {
  return apiFetch<BoardDetailResponse>(`/api/student/board/${encodeURIComponent(slug)}`);
}
