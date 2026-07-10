import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";

export async function GET() {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json(await getStudentHomePayload(student));
  } catch (error) {
    console.error("[GET /api/student/me]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
