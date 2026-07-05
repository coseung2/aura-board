import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  buildStudentCardDesignAuthorizationUrl,
  getCanvaClientId,
} from "@/lib/canva";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/my/wallet";
  if (value === "/" || value === "/landing") return "/my/wallet";
  return value;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  if (!getCanvaClientId()) {
    return NextResponse.json(
      { error: "Canva API not configured. Set CANVA_CLIENT_ID in .env" },
      { status: 500 }
    );
  }

  const student = await getCurrentStudent();
  if (!student) {
    const startPath = `/api/auth/canva/student?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(
      new URL(`/student/login?from=${encodeURIComponent(startPath)}`, req.url)
    );
  }

  const url = await buildStudentCardDesignAuthorizationUrl(student.id, returnTo);
  return NextResponse.redirect(url);
}
