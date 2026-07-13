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
const A4_GAP = 10;
const AUTO_MAX_CELLS = 16;

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

    const hasCanvaItems = items.some((item) => item.type === "canva");
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

    const mergedPdf = await PDFDocument.create();
    let canvaFound = false;

    if (layout === "original") {
      for (const item of items) {
        try {
          if (item.type === "canva") {
            if (!token) continue;
            const result = await appendCanvaPdfPages(mergedPdf, item.url, token, req.url);
            canvaFound = canvaFound || result.canvaFound;
          } else {
            await appendImagePageFromUrl(mergedPdf, item.url, req.url);
          }
        } catch (e) {
          console.error("[Export] item failed:", e);
        }
      }
    } else {
      const units: RenderUnit[] = [];
      for (const item of items) {
        try {
          if (item.type === "canva") {
            if (!token) continue;
            const result = await collectCanvaPdfUnits(mergedPdf, item.url, token, req.url);
            canvaFound = canvaFound || result.canvaFound;
            units.push(...result.units);
          } else {
            const unit = await collectImageUnit(mergedPdf, item.url, req.url);
            if (unit) units.push(unit);
          }
        } catch (e) {
          console.error("[Export] item failed:", e);
        }
      }

      if (layout === "a4-auto") appendUnitsAsAutoA4Grid(mergedPdf, units);
      else appendUnitsAsA4Pages(mergedPdf, units);
    }

    if (mergedPdf.getPageCount() === 0) {
      if (hasCanvaItems && !canvaFound && items.every((item) => item.type === "canva")) {
        return NextResponse.json({ error: "No valid Canva designs found" }, { status: 422 });
      }
      return NextResponse.json({ error: "No pages in merged PDF" }, { status: 500 });
    }

    const pdfBytes = await mergedPdf.save();

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

async function appendCanvaPdfPages(
  mergedPdf: PDFDocument,
  canvaUrl: string,
  token: string,
  baseUrl: string,
): Promise<{ canvaFound: boolean; pageCount: number }> {
  const designId = await resolveCanvaDesignId(canvaUrl);
  if (!designId) return { canvaFound: false, pageCount: 0 };

  let pageCount = 0;
  const exportUrls = await canvaExportDesign(token, designId, "pdf");
  for (const pdfUrl of exportUrls) {
    pageCount += await appendPdfFromUrl(mergedPdf, pdfUrl, baseUrl);
  }

  return { canvaFound: true, pageCount };
}

async function appendPdfFromUrl(
  mergedPdf: PDFDocument,
  pdfUrl: string,
  baseUrl: string,
): Promise<number> {
  const res = await fetch(resolveFetchUrl(pdfUrl, baseUrl));
  if (!res.ok) return 0;
  const buffer = await res.arrayBuffer();
  const sourcePdf = await PDFDocument.load(buffer);
  const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
  for (const page of pages) {
    mergedPdf.addPage(page);
  }
  return pages.length;
}

async function collectCanvaPdfUnits(
  mergedPdf: PDFDocument,
  canvaUrl: string,
  token: string,
  baseUrl: string,
): Promise<{ canvaFound: boolean; units: RenderUnit[] }> {
  const designId = await resolveCanvaDesignId(canvaUrl);
  if (!designId) return { canvaFound: false, units: [] };

  const units: RenderUnit[] = [];
  const exportUrls = await canvaExportDesign(token, designId, "pdf");
  for (const pdfUrl of exportUrls) {
    units.push(...(await collectPdfUnitsFromUrl(mergedPdf, pdfUrl, baseUrl)));
  }

  return { canvaFound: true, units };
}

async function collectPdfUnitsFromUrl(
  mergedPdf: PDFDocument,
  pdfUrl: string,
  baseUrl: string,
): Promise<RenderUnit[]> {
  const res = await fetch(resolveFetchUrl(pdfUrl, baseUrl));
  if (!res.ok) return [];

  const buffer = await res.arrayBuffer();
  const sourcePdf = await PDFDocument.load(buffer);
  const pageIndices = sourcePdf.getPageIndices();
  const embeddedPages = await mergedPdf.embedPdf(buffer, pageIndices);

  return embeddedPages.map((embeddedPage) => ({
    width: embeddedPage.width,
    height: embeddedPage.height,
    draw: (page, box) => {
      page.drawPage(embeddedPage, box);
    },
  }));
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

function appendUnitsAsAutoA4Grid(mergedPdf: PDFDocument, units: RenderUnit[]) {
  let index = 0;
  while (index < units.length) {
    const remaining = units.slice(index);
    const grid = pickAutoGrid(remaining);
    const page = mergedPdf.addPage([A4.width, A4.height]);
    const contentWidth = A4.width - A4_MARGIN * 2;
    const contentHeight = A4.height - A4_MARGIN * 2;
    const cellWidth = (contentWidth - A4_GAP * (grid.columns - 1)) / grid.columns;
    const cellHeight = (contentHeight - A4_GAP * (grid.rows - 1)) / grid.rows;

    for (let i = 0; i < grid.count; i += 1) {
      const unit = units[index + i];
      const row = Math.floor(i / grid.columns);
      const column = i % grid.columns;
      const cell = {
        x: A4_MARGIN + column * (cellWidth + A4_GAP),
        y: A4.height - A4_MARGIN - (row + 1) * cellHeight - row * A4_GAP,
        width: cellWidth,
        height: cellHeight,
      };
      unit.draw(page, fitIntoBox(unit.width, unit.height, cell));
    }

    index += grid.count;
  }
}

function pickAutoGrid(units: RenderUnit[]): { columns: number; rows: number; count: number } {
  const maxCount = Math.min(units.length, AUTO_MAX_CELLS);
  let best = { columns: 1, rows: 1, count: 1, score: Number.NEGATIVE_INFINITY };
  const contentWidth = A4.width - A4_MARGIN * 2;
  const contentHeight = A4.height - A4_MARGIN * 2;

  for (let columns = 1; columns <= 4; columns += 1) {
    for (let rows = 1; rows <= 8; rows += 1) {
      const cells = columns * rows;
      if (cells > AUTO_MAX_CELLS) continue;

      const count = Math.min(cells, units.length);
      if (count === 0) continue;

      const cellWidth = (contentWidth - A4_GAP * (columns - 1)) / columns;
      const cellHeight = (contentHeight - A4_GAP * (rows - 1)) / rows;
      if (cellWidth < 90 || cellHeight < 90) continue;

      const sampled = units.slice(0, count);
      let totalDrawArea = 0;
      let shapeScore = 0;
      for (const unit of sampled) {
        const fitted = fitSize(unit.width, unit.height, cellWidth, cellHeight);
        totalDrawArea += fitted.width * fitted.height;
        shapeScore += compareAspect(cellWidth / cellHeight, unit.width / unit.height);
      }

      const fillScore = totalDrawArea / (contentWidth * contentHeight);
      const countScore = count / maxCount;
      const emptyPenalty = ((cells - count) / cells) * 0.12;
      const score = fillScore * 0.55 + countScore * 0.45 + (shapeScore / count) * 0.1 - emptyPenalty;

      if (score > best.score) {
        best = { columns, rows, count, score };
      }
    }
  }

  return { columns: best.columns, rows: best.rows, count: best.count };
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

function compareAspect(cellAspect: number, sourceAspect: number): number {
  const distance = Math.abs(Math.log(cellAspect / sourceAspect));
  return Math.max(0, 1 - distance / 2);
}

function resolveFetchUrl(rawUrl: string, baseUrl: string): string {
  return new URL(rawUrl, baseUrl).toString();
}
