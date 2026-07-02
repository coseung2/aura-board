import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { setAvatarGalleryVisibility } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const raw = body as { visible?: unknown };
  if (typeof raw.visible !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await setAvatarGalleryVisibility(student, raw.visible);
  return NextResponse.json({ ok: true, galleryVisible: result.galleryVisible });
}
