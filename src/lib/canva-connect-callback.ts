import "server-only";

import { NextResponse } from "next/server";
import {
  decodeCanvaAuthState,
  exchangeCode,
  exchangeStudentCode,
} from "./canva";
import { getCurrentStudent } from "./student-auth";
import { getCurrentUser } from "./auth";

function safeReturnTo(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value === "/" || value === "/landing") return fallback;
  return value;
}

export async function handleCanvaConnectCallback(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const canvaState = state ? decodeCanvaAuthState(state) : null;
    const returnTo = safeReturnTo(
      canvaState?.returnTo,
      canvaState?.kind === "student" ? "/my/wallet" : "/dashboard",
    );
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
    const url = new URL("/dashboard", req.url);
    url.searchParams.set("canva", "missing_oauth_params");
    return NextResponse.redirect(url);
  }

  const canvaState = decodeCanvaAuthState(state);
  if (!canvaState) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }
  if (canvaState.kind === "teacher") {
    const teacher = await getCurrentUser().catch(() => null);
    if (!teacher || teacher.id !== canvaState.id) {
      return NextResponse.json({ error: "OAuth session mismatch" }, { status: 403 });
    }
  } else {
    const student = await getCurrentStudent().catch(() => null);
    if (!student || student.id !== canvaState.id) {
      return NextResponse.json({ error: "OAuth session mismatch" }, { status: 403 });
    }
  }
  const success =
    canvaState.kind === "student"
      ? await exchangeStudentCode(canvaState.id, code)
      : await exchangeCode(canvaState.id, code);
  if (!success) {
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  const returnTo = safeReturnTo(
    canvaState?.returnTo,
    canvaState?.kind === "student" ? "/my/wallet" : "/dashboard",
  );
  return NextResponse.redirect(new URL(returnTo, req.url));
}
