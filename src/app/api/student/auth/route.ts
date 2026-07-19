import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { createStudentSession } from "@/lib/student-auth";
import { extractIp, hashIp } from "@/lib/rate-limit";
import { limitStudentLogin } from "@/lib/rate-limit-routes";

const AuthSchema = z.object({
  token: z.string().trim().min(1).max(256),
}).strict();

// Student code login is an explicit identity switch. Clear Auth.js teacher
// cookies too, otherwise getCurrentStudent() will ignore the new student cookie
// and /student will bounce back to /login.
const AUTHJS_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

function isAuthJsCookie(name: string) {
  return AUTHJS_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`),
  );
}

function authCookieNeedsSecureDelete(name: string) {
  return name.startsWith("__Secure-") || name.startsWith("__Host-");
}

export async function POST(req: Request) {
  let credentialHash = "unparsed";
  try {
    const body = await req.json();
    const { token } = AuthSchema.parse(body);
    credentialHash = hashIp(token.toUpperCase());

    const limit = await limitStudentLogin(
      hashIp(extractIp(req)),
      credentialHash,
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, limit.retryAfter)) },
        },
      );
    }

    // Try qrToken first, then textCode
    let student = await db.student.findUnique({ where: { qrToken: token } });
    if (!student) {
      student = await db.student.findUnique({ where: { textCode: token.toUpperCase() } });
    }

    if (!student) {
      return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    }

    // The cookie is for web sessions; mobile stores sessionToken and reuses it
    // with Authorization: Bearer <token>.
    const sessionToken = await createStudentSession(student.id, student.classroomId);

    const cookieStore = await cookies();
    const authCookieNames = new Set(AUTHJS_COOKIE_PREFIXES);
    for (const cookie of cookieStore.getAll()) {
      if (isAuthJsCookie(cookie.name)) authCookieNames.add(cookie.name);
    }

    const response = NextResponse.json({
      success: true,
      redirect: "/student",
      sessionToken,
      student: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
    });
    for (const name of authCookieNames) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        secure: authCookieNeedsSecureDelete(name),
        sameSite: "lax",
      });
    }
    return response;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    console.error("[POST /api/student/auth]", {
      credentialHash,
      error: e instanceof Error ? e.name : "unknown",
    });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
