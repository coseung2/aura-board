import { NextResponse } from "next/server";
import { issueStudentCanvaPairCode } from "@/lib/canva-pair";
import { getCurrentStudent } from "@/lib/student-auth";

export async function POST() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await issueStudentCanvaPairCode(student.id));
}
