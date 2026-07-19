import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { getPetHome } from "@/lib/pets/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(await getPetHome(student));
}
