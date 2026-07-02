import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { getAvatarHome } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const home = await getAvatarHome(student);
  return NextResponse.json(home);
}
