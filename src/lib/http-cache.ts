import { NextResponse } from "next/server";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
} as const;

export function jsonPrivateNoStore<T>(
  body: T,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return NextResponse.json(body, { ...init, headers });
}
