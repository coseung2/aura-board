import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { createStudentSession } from "@/lib/student-auth";

const AuthSchema = z.object({
  token: z.string().min(1),
});

// 학생 코드 로그인은 명시적 신원 전환이므로 NextAuth(교사) 세션 쿠키를 같이
// 정리한다. 그러지 않으면 getCurrentStudent() 의 교사 게이트가 학생 쿠키를
// 무시해 /student → /student/login 루프가 발생.
const AUTHJS_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = AuthSchema.parse(body);

    // Try qrToken first, then textCode
    let student = await db.student.findUnique({ where: { qrToken: token } });
    if (!student) {
      student = await db.student.findUnique({ where: { textCode: token.toUpperCase() } });
    }

    if (!student) {
      return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    }

    // Cookie는 웹 세션용, sessionToken은 모바일 앱이 SecureStore에 보관해
    // 이후 요청에 `Authorization: Bearer <token>` 으로 재사용.
    const sessionToken = await createStudentSession(student.id, student.classroomId);

    const cookieStore = await cookies();
    for (const name of AUTHJS_COOKIES) {
      if (cookieStore.has(name)) {
        cookieStore.delete({ name, path: "/" });
      }
    }

    return NextResponse.json({
      success: true,
      redirect: "/student",
      sessionToken,
      student: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/student/auth]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
