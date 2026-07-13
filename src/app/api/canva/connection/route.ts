import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  disconnectTeacherCanva,
  isCanvaConnected,
} from "@/lib/canva";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET() {
  const teacher = await getCurrentUser().catch(() => null);
  if (!teacher) return privateJson({ error: "Unauthorized" }, 401);
  const connected = await isCanvaConnected(teacher.id);
  return privateJson({ connected, actor: "teacher" });
}

export async function DELETE(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin) {
    return privateJson({ error: "Invalid request origin" }, 403);
  }
  const teacher = await getCurrentUser().catch(() => null);
  if (!teacher) return privateJson({ error: "Unauthorized" }, 401);

  try {
    const disconnected = await disconnectTeacherCanva(teacher.id);
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
