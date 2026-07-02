"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvatarMeResponse } from "./types";

type State =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: AvatarMeResponse; error: null }
  | { status: "error"; data: null; error: string };

export function useAvatarMe() {
  const [state, setState] = useState<State>({
    status: "loading",
    data: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });
    try {
      const res = await fetch("/api/avatar/me", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          status: "error",
          data: null,
          error: typeof body.error === "string" ? body.error : "캐릭터 정보를 불러올 수 없어요",
        });
        return;
      }
      const data = (await res.json()) as AvatarMeResponse;
      setState({ status: "ok", data, error: null });
    } catch {
      setState({
        status: "error",
        data: null,
        error: "네트워크 오류가 발생했어요",
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
