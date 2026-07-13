import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  disconnectStudentCanva,
  disconnectTeacherCanva,
  isCanvaConnected,
  isStudentCanvaConnected,
} from "@/lib/canva";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function currentActor() {
  const teacher = await getCurrentUser().catch(() => null);
  if (teacher) return { kind: "teacher" as const, id: teacher.id };
  const student = await getCurrentStudent().catch(() => null);
  if (student) return { kind: "student" as const, id: student.id };
  return null;
}

export async function GET() {
  const actor = await currentActor();
  if (!actor) return privateJson({ error: "Unauthorized" }, 401);
  const connected =
    actor.kind === "teacher"
      ? await isCanvaConnected(actor.id)
      : await isStudentCanvaConnected(actor.id);
  return privateJson({ connected, actor: actor.kind });
}

export async function DELETE(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin) {
    return privateJson({ error: "Invalid request origin" }, 403);
  }
  const actor = await currentActor();
  if (!actor) return privateJson({ error: "Unauthorized" }, 401);

  try {
    const disconnected =
      actor.kind === "teacher"
        ? await disconnectTeacherCanva(actor.id)
        : await disconnectStudentCanva(actor.id);
    if (!disconnected) {
      return privateJson(
        { error: "Canva에서 연결을 해제하지 못했습니다. 잠시 후 다시 시도해주세요." },
        502,
      );
    }
    return privateJson({ ok: true, connected: false });
  } catch (error) {
    console.error("[DELETE /api/canva/connection]", error);
    return privateJson(
      { error: "Canva 연결 해제 중 오류가 발생했습니다." },
      500,
    );
  }
}
