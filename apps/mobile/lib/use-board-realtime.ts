import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiFetch } from "./api";
import type { BoardDetailResponse } from "./types";
import { createBoardRealtimeRegistry, type BoardRealtimeClient, type BoardRealtimeStatus } from "./board-realtime-core";
import { createBoardSyncController } from "./board-sync-controller";
export * from "./board-realtime-core";

let moduleClient: BoardRealtimeClient | null = null;
let clientPromise: Promise<BoardRealtimeClient | null> | null = null;
let registry: ReturnType<typeof createBoardRealtimeRegistry> | null = null;
let generation = 0;

type ConfigResponse = { configured: false } | { configured: true; url: string; key: string };

function createMobileRealtimeClient(url: string, key: string): BoardRealtimeClient | null {
  try {
    // Runtime-safe in optional development bundles; normal store builds include
    // this dependency. Public configuration always comes from the API origin,
    // not a potentially obsolete broker baked into an older mobile build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@supabase/supabase-js");
    const createClient = mod?.createClient ?? mod?.default?.createClient;
    if (!createClient) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as BoardRealtimeClient;
  } catch { return null; }
}

/** Already-resolved public client. Initialization is asynchronous and shared. */
export function getMobileRealtimeClient(): BoardRealtimeClient | null { return moduleClient; }

export function ensureMobileRealtimeClient(): Promise<BoardRealtimeClient | null> {
  if (moduleClient) return Promise.resolve(moduleClient);
  if (clientPromise) return clientPromise;
  const startedGeneration = generation;
  const request = apiFetch<ConfigResponse>("/api/student/realtime-config", { retry: 0 })
    .then((config) => {
      if (startedGeneration !== generation || !config.configured || !config.url || !config.key) return null;
      moduleClient = createMobileRealtimeClient(config.url, config.key);
      return moduleClient;
    })
    .finally(() => {
      // A missing configuration is retryable too, not a permanent cached null.
      if (clientPromise === request) clientPromise = null;
    });
  clientPromise = request;
  return request;
}

export function resetBoardRealtimeForTests() {
  generation += 1;
  registry?.reset();
  registry = null;
  moduleClient = null;
  clientPromise = null;
}

/** One focused screen owns authoritative refreshes; the registry shares the
 * physical channel with any open comment or auxiliary consumers. */
export function useBoardRealtime({
  slug,
  onReload,
  enabled = true,
  fallbackPollMs = 0,
}: {
  slug: string;
  onReload: () => Promise<void> | void;
  enabled?: boolean;
  fallbackPollMs?: number;
}): { reload: (delayMs?: number) => void; status: BoardRealtimeStatus } {
  const [status, setStatus] = useState<BoardRealtimeStatus>("idle");
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const controllerRef = useRef<ReturnType<typeof createBoardSyncController> | null>(null);
  const reload = useCallback((delayMs?: number) => controllerRef.current?.reload(delayMs), []);

  useEffect(() => {
    if (!slug || !enabled) { setStatus("idle"); return; }
    const controller = createBoardSyncController({
      active: AppState.currentState == null || AppState.currentState === "active",
      fallbackPollMs,
      onReload: () => reloadRef.current(),
      onStatus: setStatus,
      subscribe: async (subscriber) => {
        const client = await ensureMobileRealtimeClient();
        if (!client) return null;
        registry ??= createBoardRealtimeRegistry(client);
        return registry.subscribe(slug, subscriber);
      },
    });
    controllerRef.current = controller;
    const listener = AppState.addEventListener("change", (state) => controller.setActive(state === "active"));
    return () => {
      listener.remove();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [slug, enabled, fallbackPollMs]);
  return { reload, status };
}

export async function fetchStudentBoard(slug: string): Promise<BoardDetailResponse> {
  return apiFetch<BoardDetailResponse>(`/api/student/board/${encodeURIComponent(slug)}`, { headers: { "x-aura-revalidate": "1" } });
}
