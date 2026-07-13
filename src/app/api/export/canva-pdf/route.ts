import { NextResponse } from "next/server";
import { PDFDocument, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { limitCanvaExport } from "@/lib/rate-limit-routes";
import {
  getAccessToken,
  isCanvaConnected,
  canvaExportDesign,
  resolveCanvaDesignId,
} from "@/lib/canva";

type ExportItem =
  | { type: "canva"; url: string }
  | { type: "image"; url: string; title?: string | null };

type ExportLayout = "original" | "a4-fit" | "a4-auto";

type ExportRequest = {
  items: ExportItem[];
  layout: ExportLayout;
};

type DrawBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RenderUnit = {
  width: number;
  height: number;
  draw: (page: PDFPage, box: DrawBox) => void;
};

const A4 = { width: 595.28, height: 841.89 };
const A4_MARGIN = 36;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const rateLimit = await limitCanvaExport(user.id);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "rate_limited", message: "잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body = await req.json();
    const { items, layout } = normalizeExportRequest(body);
    if (items.length === 0) {
      return NextResponse.json({ error: "No export items provided" }, { status: 400 });
    }
    if (items.length > 1) {
      return NextResponse.json(
        {
          error: "exactly_one_export_item_required",
          message: "Exactly one export item is required.",
        },
        { status: 400 },
      );
    }

    const item = items[0];

    const hasCanvaItems = item.type === "canva";
    let token: string | null = null;
    if (hasCanvaItems) {
      if (!(await isCanvaConnected(user.id))) {
        return NextResponse.json(
          { error: "canva_not_connected", message: "Canva 계정을 연결해주세요." },
          { status: 401 }
        );
      }

      token = await getAccessToken(user.id);
      if (!token) {
        return NextResponse.json(
          { error: "canva_token_expired", message: "Canva 인증이 만료되었습니다. 다시 연결해주세요." },
          { status: 401 }
        );
      }
    }

    if (item.type === "canva") {
      if (!token) {
        return NextResponse.json({ error: "canva_token_expired" }, { status: 401 });
      }

      const designId = await resolveCanvaDesignId(item.url);
      if (!designId) {
        return NextResponse.json({ error: "No valid Canva designs found" }, { status: 422 });
      }

      let exportUrls: string[];
      try {
        exportUrls = await canvaExportDesign(token, designId, "pdf");
      } catch (e) {
        console.error("[Export] Canva PDF export failed:", e);
        return NextResponse.json(
          { error: "canva_pdf_export_failed", message: "Canva PDF export failed." },
          { status: 502 },
        );
      }

      if (exportUrls.length === 0) {
        return NextResponse.json(
          {
            error: "canva_pdf_export_url_missing",
            message: "Canva PDF export did not return a download URL.",
          },
          { status: 502 },
        );
      }
      if (exportUrls.length > 1) {
        return NextResponse.json(
          {
            error: "canva_pdf_export_multiple_urls",
            message: "Canva PDF export returned multiple download URLs.",
          },
          { status: 502 },
        );
      }

      const pdfUrl = exportUrls[0];
      if (typeof pdfUrl !== "string" || !pdfUrl.trim()) {
        return NextResponse.json(
          {
            error: "canva_pdf_export_url_missing",
            message: "Canva PDF export did not return a valid download URL.",
          },
          { status: 502 },
        );
      }

      let pdfResponse: Response;
      try {
        pdfResponse = await fetch(resolveFetchUrl(pdfUrl, req.url));
      } catch (e) {
        console.error("[Export] Canva PDF download failed:", e);
        return NextResponse.json(
          { error: "canva_pdf_download_failed", message: "Canva PDF download failed." },
          { status: 502 },
        );
      }

      if (!pdfResponse.ok) {
        return NextResponse.json(
          { error: "canva_pdf_download_failed", message: "Canva PDF download failed." },
          { status: 502 },
        );
      }

      return new NextResponse(await pdfResponse.arrayBuffer(), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=canva_export.pdf",
        },
      });
    }

    const pdf = await PDFDocument.create();
    try {
      if (layout === "original") {
        await appendImagePageFromUrl(pdf, item.url, req.url);
      } else {
        const unit = await collectImageUnit(pdf, item.url, req.url);
        if (unit) appendUnitsAsA4Pages(pdf, [unit]);
      }
    } catch (e) {
      console.error("[Export] image item failed:", e);
    }

    if (pdf.getPageCount() === 0) {
      return NextResponse.json({ error: "No pages in merged PDF" }, { status: 500 });
    }

    const pdfBytes = await pdf.save();
    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=canva_export.pdf",
      },
    });
  } catch (e) {
    console.error("[POST /api/export/canva-pdf]", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function normalizeExportRequest(body: unknown): ExportRequest {
  if (!body || typeof body !== "object") return { items: [], layout: "original" };
  const record = body as { items?: unknown; urls?: unknown };
  const layout = normalizeLayout((body as { layout?: unknown }).layout);

  if (Array.isArray(record.items)) {
    const items = record.items
      .map(normalizeExportItem)
      .filter((item): item is ExportItem => item !== null);
    return { items, layout };
  }

  if (Array.isArray(record.urls)) {
    const items = record.urls
      .filter((url): url is string => typeof url === "string" && !!url.trim())
      .map((url): ExportItem => ({ type: "canva", url }));
    return { items, layout };
  }

  return { items: [], layout };
}

function normalizeExportItem(item: unknown): ExportItem | null {
  if (!item || typeof item !== "object") return null;
  const value = item as { type?: unknown; url?: unknown; title?: unknown };
  if (value.type !== "canva" && value.type !== "image") return null;
  if (typeof value.url !== "string" || !value.url.trim()) return null;
  return {
    type: value.type,
    url: value.url,
    title: typeof value.title === "string" ? value.title : null,
  } as ExportItem;
}

function normalizeLayout(value: unknown): ExportLayout {
  if (value === "a4-fit" || value === "a4-auto" || value === "original") return value;
  return "original";
}

async function appendImagePageFromUrl(
  mergedPdf: PDFDocument,
  imageUrl: string,
  baseUrl: string,
) {
  const unit = await collectImageUnit(mergedPdf, imageUrl, baseUrl);
  if (!unit) return;

  const page = mergedPdf.addPage([unit.width, unit.height]);
  unit.draw(page, { x: 0, y: 0, width: unit.width, height: unit.height });
}

async function collectImageUnit(
  mergedPdf: PDFDocument,
  imageUrl: string,
  baseUrl: string,
): Promise<RenderUnit | null> {
  const res = await fetch(resolveFetchUrl(imageUrl, baseUrl));
  if (!res.ok) return null;

  const bytes = new Uint8Array(await res.arrayBuffer());
  let image;
  try {
    image = await mergedPdf.embedJpg(bytes);
  } catch {
    try {
      image = await mergedPdf.embedPng(bytes);
    } catch {
      const png = await sharp(bytes).rotate().png().toBuffer();
      image = await mergedPdf.embedPng(png);
    }
  }

  return {
    width: image.width,
    height: image.height,
    draw: (page, box) => {
      page.drawImage(image, box);
    },
  };
}

function appendUnitsAsA4Pages(mergedPdf: PDFDocument, units: RenderUnit[]) {
  for (const unit of units) {
    const page = mergedPdf.addPage([A4.width, A4.height]);
    const box = fitIntoBox(unit.width, unit.height, {
      x: A4_MARGIN,
      y: A4_MARGIN,
      width: A4.width - A4_MARGIN * 2,
      height: A4.height - A4_MARGIN * 2,
    });
    unit.draw(page, box);
  }
}

function fitIntoBox(sourceWidth: number, sourceHeight: number, box: DrawBox): DrawBox {
  const fitted = fitSize(sourceWidth, sourceHeight, box.width, box.height);
  return {
    x: box.x + (box.width - fitted.width) / 2,
    y: box.y + (box.height - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
  };
}

function fitSize(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

function resolveFetchUrl(rawUrl: string, baseUrl: string): string {
  return new URL(rawUrl, baseUrl).toString();
}
