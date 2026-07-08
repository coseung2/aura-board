import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAccessToken,
  isCanvaConnected,
  canvaCreateFolder,
  canvaMoveItem,
  canvaGetDesign,
  resolveCanvaDesignId,
} from "@/lib/canva";

/**
 * POST /api/canva/organize
 * Body: { sectionTitle: string, canvaUrls: string[] }
 * Creates a Canva folder named sectionTitle, then moves all designs into it.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    if (!(await isCanvaConnected(user.id))) {
      return NextResponse.json({ error: "canva_not_connected" }, { status: 401 });
    }

    const token = await getAccessToken(user.id);
    if (!token) {
      return NextResponse.json({ error: "canva_token_expired" }, { status: 401 });
    }

    const { sectionTitle, canvaUrls } = await req.json();
    if (!sectionTitle || !canvaUrls?.length) {
      return NextResponse.json({ error: "sectionTitle and canvaUrls required" }, { status: 400 });
    }

    // 1. Create folder
    const folder = await canvaCreateFolder(token, sectionTitle);

    // 2. Resolve design IDs and move each into the folder
    const results: { url: string; designId: string | null; moved: boolean; title?: string; error?: string }[] = [];

    for (const url of canvaUrls) {
      const designId = await resolveCanvaDesignId(url);
      if (!designId) {
        results.push({ url, designId: null, moved: false, error: "ID 추출 실패" });
        continue;
      }

      try {
        let designTitle: string | undefined;
        try {
          const design = await canvaGetDesign(token, designId);
          designTitle = design.title;
        } catch {
          // canvaGetDesign fails for team members' designs
          designTitle = undefined;
        }
        const moved = await canvaMoveItem(token, designId, folder.id);
        results.push({
          url,
          designId,
          moved,
          title: designTitle,
          error: moved ? undefined : (designTitle ? "move returned false" : "팀 멤버 디자인 - Canva API 제약으로 이동 불가"),
        });
      } catch (e: any) {
        console.warn("[POST /api/canva/organize] design move failed", {
          url,
          designId,
          errorMessage: e.message ?? String(e),
        });
        results.push({ url, designId, moved: false, error: e.message });
      }
    }

    const movedCount = results.filter((r) => r.moved).length;

    return NextResponse.json({
      folder,
      results,
      summary: `${movedCount}/${canvaUrls.length}개 디자인을 "${folder.name}" 폴더로 이동했습니다.`,
    });
  } catch (e) {
    console.error("[POST /api/canva/organize]", e);
    return NextResponse.json({ error: "Organize failed" }, { status: 500 });
  }
}
