import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { createReloadRunner } from "../lib/board-realtime-core";

/** Refresh only the visible route on focus/foreground. This is not polling;
 * editing screens must preserve their drafts when applying refreshed data. */
export function useFocusedRefresh(refresh: () => Promise<void> | void, scopeKey = "") {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useFocusEffect(useCallback(() => {
    let active = AppState.currentState == null || AppState.currentState === "active";
    const runner = createReloadRunner(() => { if (active) return refreshRef.current(); });
    if (active) runner.reload(0);
    const subscription = AppState.addEventListener("change", (state) => {
      const wasActive = active;
      active = state === "active";
      if (active && !wasActive) runner.reload(0);
    });
    return () => { active = false; runner.dispose(); subscription.remove(); };
  }, [scopeKey]));
}
