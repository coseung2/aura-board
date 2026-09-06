import { NextResponse } from "next/server";

/** Legacy role-switch cookies are retired; authorization lives in server guards. */
export function proxy() {
  return NextResponse.next();
}

// Keep the compatibility entry point out of normal page and API requests.
export const config = { matcher: ["/__retired-development-proxy"] };
