import { getCurrentUser } from "@/lib/auth";
import { getAccessToken, isCanvaConnected, canvaListFolderItems } from "@/lib/canva";
import { jsonPrivateNoStore } from "@/lib/http-cache";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    if (!(await isCanvaConnected(user.id))) {
      return jsonPrivateNoStore({ error: "canva_not_connected" }, { status: 401 });
    }

    const token = await getAccessToken(user.id);
    if (!token) {
      return jsonPrivateNoStore({ error: "canva_token_expired" }, { status: 401 });
    }

    const items = await canvaListFolderItems(token, id);
    return jsonPrivateNoStore({ items });
  } catch (e) {
    console.error("[GET /api/canva/folders/:id/items]", e);
    return jsonPrivateNoStore({ error: "Failed to list folder" }, { status: 500 });
  }
}
