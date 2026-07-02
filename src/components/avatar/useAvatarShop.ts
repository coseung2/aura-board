"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvatarShopResponse } from "./types";

type State =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: AvatarShopResponse; error: null }
  | { status: "error"; data: null; error: string };

export function useAvatarShop() {
  const [state, setState] = useState<State>({
    status: "loading",
    data: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });
    try {
      const res = await fetch("/api/avatar/shop", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          status: "error",
          data: null,
          error: typeof body.error === "string" ? body.error : "상점 정보를 불러올 수 없어요",
        });
        return;
      }
      const data = (await res.json()) as AvatarShopResponse;
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
