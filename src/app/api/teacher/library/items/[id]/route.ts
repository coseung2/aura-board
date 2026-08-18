import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";

type Params = { params: Promise<{ id: string }> };
const PatchSchema = z.object({ collectionId: z.string().min(1).nullable() });

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonPrivateNoStore({ error: "bad_request" }, { status: 400 });

  const item = await db.teacherLibraryItem.findFirst({ where: { id, userId: user.id } });
  if (!item) return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  if (parsed.data.collectionId) {
    const collection = await db.teacherLibraryCollection.findFirst({
      where: { id: parsed.data.collectionId, userId: user.id },
      select: { id: true },
    });
    if (!collection) return jsonPrivateNoStore({ error: "collection_not_found" }, { status: 404 });
  }
  await db.teacherLibraryItem.update({
    where: { id },
    data: { collectionId: parsed.data.collectionId },
  });
  return jsonPrivateNoStore({ ok: true });
}
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await db.teacherLibraryItem.findFirst({ where: { id, userId: user.id } });
  if (!item) return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  await db.teacherLibraryItem.delete({ where: { id } });
  await enqueueBlobDeletion(
    [item.assetUrl, item.previewUrl],
    "teacher-library.item.delete",
    "TeacherLibraryItem",
    id,
  );
  return jsonPrivateNoStore({ ok: true });
}
