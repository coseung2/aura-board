import { NextResponse } from "next/server";
import { decodeStudentAuthState, exchangeCode, exchangeStudentCode } from "@/lib/canva";

function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
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
