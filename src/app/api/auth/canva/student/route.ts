import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  buildStudentCardDesignAuthorizationUrl,
  getCanvaClientId,
} from "@/lib/canva";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/my/wallet";
  return value;
}

export async function GET(req: Request) {
  if (!getCanvaClientId()) {
    return NextResponse.json(
      { error: "Canva API not configured. Set CANVA_CLIENT_ID in .env" },
      { status: 500 }
    );
  }

  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.redirect(new URL("/student/login?from=/my/wallet", req.url));
  }

  const { searchParams } = new URL(req.url);
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const url = await buildStudentCardDesignAuthorizationUrl(student.id, returnTo);
  return NextResponse.redirect(url);
}
