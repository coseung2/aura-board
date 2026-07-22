// Aura-board 모바일 앱 API 클라이언트.
// - 모든 요청에 `Authorization: Bearer <token>` 자동 첨부 (student-auth.ts 참조).
// - base URL 은 EXPO_PUBLIC_API_BASE env 로 주입 (EAS build time). 기본은 프로덕션.
// - 쿠키를 쓰지 않으므로 CORS preflight 자체가 native fetch 에선 non-issue.

import Constants from "expo-constants";
import { Platform } from "react-native";
import { loadParentToken, loadSessionToken } from "./session";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function getApiBase(): string {
  // 1) EAS build time env, 2) expo-constants extra, 3) local Expo dev,
  // 4) production fallback.
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromExtra =
    (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;
  if (fromExtra) return fromExtra.replace(/\/$/, "");
  if (__DEV__) {
    // Android emulators reach the host machine through 10.0.2.2. A USB-connected
    // phone reaches it through `adb reverse tcp:3000 tcp:3000`; use IPv4
    // loopback so Android does not select an unmapped IPv6 localhost address.
    // A physical device on Wi-Fi can override this with EXPO_PUBLIC_API_BASE
    // (for example a LAN address).
    return Platform.OS === "android" && !Constants.isDevice
      ? "http://10.0.2.2:3000"
      : "http://127.0.0.1:3000";
  }
  // Start on the canonical origin so a cross-origin redirect cannot discard
  // the mobile Bearer token.
  return "https://aura-board.com";
}

type FetchOpts = RequestInit & {
  json?: unknown;
  skipAuth?: boolean;
  /** true 이면 학생 토큰 대신 학부모 토큰을 Authorization 헤더에 사용. */
  parentAuth?: boolean;
};

/**
 * 인증 붙인 fetch. 401 이 떨어지면 호출자가 세션 만료 취급(로그인으로 되돌림).
 *
 * SSE(EventStream)처럼 스트리밍이 필요한 호출은 이걸 쓰지 말고
 * `openSse(path, body)` 를 사용. fetch body 스트림은 RN 에서 지원이 들쭉날쭉해서
 * EventSource polyfill 대신 직접 chunk parsing.
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const { json, skipAuth, parentAuth, headers, ...rest } = opts;
  const hdrs: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };

  if (json !== undefined) {
    hdrs["Content-Type"] = "application/json";
  }

  if (!skipAuth) {
    const token = await (parentAuth ? loadParentToken() : loadSessionToken());
    if (token) hdrs["Authorization"] = `Bearer ${token}`;
  }

  const url = path.startsWith("http") ? path : `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...rest,
    headers: hdrs,
    body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | undefined),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export function getApiUrl(path: string): string {
  return path.startsWith("http") ? path : `${getApiBase()}${path}`;
}

/**
 * 학부모 인증이 필요한 API 호출용 편의 헬퍼.
 * `Authorization: Bearer <parent token>` 을 자동으로 첨부한다.
 */
export async function parentApiFetch<T = unknown>(
  path: string,
  opts: Omit<FetchOpts, "parentAuth"> = {},
): Promise<T> {
  return apiFetch<T>(path, { ...opts, parentAuth: true });
}

/**
 * SSE chunk parser. vibe-arcade sessions 스트리밍용.
 * onEvent 는 `data: {json}` 의 JSON 을 순서대로 받는다.
 */
export async function streamSse(opts: {
  path: string;
  body: unknown;
  onEvent: (event: unknown) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await loadSessionToken();
  const res = await fetch(`${getApiBase()}${opts.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new ApiError(res.status, errText);
  }
  // res.body 는 RN 에서 ReadableStream. 일부 버전에선 text 만 지원 → fallback.
  if (!res.body || typeof (res.body as ReadableStream).getReader !== "function") {
    const text = await res.text();
    parseSseChunk(text, opts.onEvent);
    return;
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // 이벤트는 빈 줄(\n\n) 으로 구분.
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const raw of parts) {
      parseSseChunk(raw, opts.onEvent);
    }
  }
  if (buf.trim()) parseSseChunk(buf, opts.onEvent);
}

function parseSseChunk(chunk: string, onEvent: (event: unknown) => void) {
  const lines = chunk.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      onEvent(JSON.parse(payload));
    } catch {
      onEvent({ type: "raw", text: payload });
    }
  }
}
