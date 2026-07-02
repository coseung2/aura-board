import "server-only";

import { NextResponse } from "next/server";
import { decodeStudentAuthState, exchangeCode, exchangeStudentCode } from "./canva";
import { getCurrentStudent } from "./student-auth";

function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function handleCanvaConnectCallback(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const studentState = state ? decodeStudentAuthState(state) : null;
    const returnTo = safeReturnTo(studentState?.returnTo);
    const url = new URL(returnTo, req.url);
    url.searchParams.set("canva", oauthError);
    return NextResponse.redirect(url);
  }

  if (!code || !state) {
    const student = await getCurrentStudent().catch(() => null);
    if (student) {
      return NextResponse.redirect(
        new URL("/api/auth/canva/student?returnTo=/my/wallet", req.url),
      );
    }
    const url = new URL("/", req.url);
    url.searchParams.set("canva", "missing_oauth_params");
    return NextResponse.redirect(url);
  }

  const studentState = decodeStudentAuthState(state);
  const success = studentState
    ? await exchangeStudentCode(studentState.id, code)
    : await exchangeCode(state, code);
  if (!success) {
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  const returnTo = safeReturnTo(studentState?.returnTo);
  return NextResponse.redirect(new URL(returnTo, req.url));
}
