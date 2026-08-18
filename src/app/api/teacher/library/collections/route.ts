import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";

const BodySchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonPrivateNoStore({ error: "bad_request" }, { status: 400 });

  const collection = await db.teacherLibraryCollection.upsert({
    where: { userId_name: { userId: user.id, name: parsed.data.name } },
    create: { userId: user.id, name: parsed.data.name },
    update: { updatedAt: new Date() },
  });
  return jsonPrivateNoStore(
    {
      collection: {
        id: collection.id,
        name: collection.name,
        itemCount: 0,
        createdAt: collection.createdAt.toISOString(),
        updatedAt: collection.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
