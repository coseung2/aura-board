import "server-only";

import { PDFDocument, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import { canvaExportDesign, getAccessToken } from "@/lib/canva";
import type { TeacherLibraryPdfLayout } from "@/lib/teacher-library-types";

const A4 = { width: 595.28, height: 841.89 };
const A4_MARGIN = 36;
const A4_GAP = 10;
const AUTO_MAX_CELLS = 16;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

type DrawBox = { x: number; y: number; width: number; height: number };
type RenderUnit = {
  width: number;
  height: number;
  draw: (page: PDFPage, box: DrawBox) => void;
};

export type TeacherLibraryPdfItem = {
  kind: string;
  assetUrl: string | null;
  canvaDesignId: string | null;
};

export async function buildTeacherLibraryPdf(args: {
  userId: string;
  items: TeacherLibraryPdfItem[];
  baseUrl: string;
  layout: TeacherLibraryPdfLayout;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const hasCanva = args.items.some((item) => item.kind === "canva");
  const canvaToken = hasCanva ? await getAccessToken(args.userId) : null;
  if (hasCanva && !canvaToken) {
    throw new TeacherLibraryPdfError("canva_reconnect_required", 401);
  }

  if (args.layout === "original") {
    for (const item of args.items) {
      if (item.kind === "canva") {
        for (const url of await canvaPdfUrls(item, canvaToken)) await appendPdf(document, url);
      } else {
        const unit = await imageUnit(document, item, args.baseUrl);
        const page = document.addPage([unit.width, unit.height]);
        unit.draw(page, { x: 0, y: 0, width: unit.width, height: unit.height });
      }
    }
  } else {
    const units: RenderUnit[] = [];
    for (const item of args.items) {
      if (item.kind === "canva") {
        for (const url of await canvaPdfUrls(item, canvaToken)) {
          units.push(...(await collectPdfUnits(document, url)));
        }
      } else {
        units.push(await imageUnit(document, item, args.baseUrl));
      }
    }
    if (args.layout === "a4-auto") appendUnitsAsAutoA4Grid(document, units);
    else appendUnitsAsA4Pages(document, units);
  }

  if (document.getPageCount() === 0) {
    throw new TeacherLibraryPdfError("pdf_has_no_pages", 422);
  }
  return document.save();
}

async function canvaPdfUrls(
  item: TeacherLibraryPdfItem,
  token: string | null,
): Promise<string[]> {
  if (!token || !item.canvaDesignId) {
    throw new TeacherLibraryPdfError("canva_item_invalid", 422);
  }
  const urls = await canvaExportDesign(token, item.canvaDesignId, "pdf");
  if (urls.length === 0) {
    throw new TeacherLibraryPdfError("canva_export_url_missing", 502);
  }
  return urls;
}

async function appendPdf(target: PDFDocument, url: string): Promise<void> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new TeacherLibraryPdfError("canva_pdf_download_failed", 502);
  }
  const bytes = await readLimited(response, MAX_DOWNLOAD_BYTES);
  const source = await PDFDocument.load(bytes);
  const pages = await target.copyPages(source, source.getPageIndices());
  if (pages.length === 0) throw new TeacherLibraryPdfError("canva_pdf_empty", 502);
  pages.forEach((page) => target.addPage(page));
}

async function collectPdfUnits(target: PDFDocument, url: string): Promise<RenderUnit[]> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new TeacherLibraryPdfError("canva_pdf_download_failed", 502);
  const bytes = await readLimited(response, MAX_DOWNLOAD_BYTES);
  const source = await PDFDocument.load(bytes);
  if (source.getPageCount() === 0) throw new TeacherLibraryPdfError("canva_pdf_empty", 502);
  const pages = await target.embedPdf(bytes, source.getPageIndices());
  return pages.map((embedded) => ({
    width: embedded.width,
    height: embedded.height,
    draw: (page, box) => page.drawPage(embedded, box),
  }));
}

async function imageUnit(
  target: PDFDocument,
  item: TeacherLibraryPdfItem,
  baseUrl: string,
): Promise<RenderUnit> {
  if (!item.assetUrl) throw new TeacherLibraryPdfError("image_item_missing", 422);
  const response = await fetch(new URL(item.assetUrl, baseUrl), {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new TeacherLibraryPdfError("image_download_failed", 502);
  const source = await readLimited(response, MAX_DOWNLOAD_BYTES);
  let embedded;
  try {
    embedded = await target.embedJpg(source);
  } catch {
    try {
      embedded = await target.embedPng(source);
    } catch {
      const png = await sharp(source).rotate().png().toBuffer();
      embedded = await target.embedPng(png);
    }
  }

  return {
    width: embedded.width,
    height: embedded.height,
    draw: (page, box) => page.drawImage(embedded, box),
  };
}

function appendUnitsAsA4Pages(document: PDFDocument, units: RenderUnit[]) {
  for (const unit of units) {
    const page = document.addPage([A4.width, A4.height]);
    unit.draw(page, fitIntoBox(unit.width, unit.height, {
      x: A4_MARGIN,
      y: A4_MARGIN,
      width: A4.width - A4_MARGIN * 2,
      height: A4.height - A4_MARGIN * 2,
    }));
  }
}

function appendUnitsAsAutoA4Grid(document: PDFDocument, units: RenderUnit[]) {
  let index = 0;
  while (index < units.length) {
    const grid = pickAutoGrid(units.slice(index));
    const page = document.addPage([A4.width, A4.height]);
    const contentWidth = A4.width - A4_MARGIN * 2;
    const contentHeight = A4.height - A4_MARGIN * 2;
    const cellWidth = (contentWidth - A4_GAP * (grid.columns - 1)) / grid.columns;
    const cellHeight = (contentHeight - A4_GAP * (grid.rows - 1)) / grid.rows;
    for (let cellIndex = 0; cellIndex < grid.count; cellIndex += 1) {
      const unit = units[index + cellIndex];
      const row = Math.floor(cellIndex / grid.columns);
      const column = cellIndex % grid.columns;
      unit.draw(page, fitIntoBox(unit.width, unit.height, {
        x: A4_MARGIN + column * (cellWidth + A4_GAP),
        y: A4.height - A4_MARGIN - (row + 1) * cellHeight - row * A4_GAP,
        width: cellWidth,
        height: cellHeight,
      }));
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
      const cellWidth = (contentWidth - A4_GAP * (columns - 1)) / columns;
      const cellHeight = (contentHeight - A4_GAP * (rows - 1)) / rows;
      if (cellWidth < 90 || cellHeight < 90) continue;
      const fill = units.slice(0, count).reduce((sum, unit) => {
        const fitted = fitSize(unit.width, unit.height, cellWidth, cellHeight);
        return sum + fitted.width * fitted.height;
      }, 0) / (contentWidth * contentHeight);
      const score = fill * 0.55 + (count / maxCount) * 0.45 - ((cells - count) / cells) * 0.12;
      if (score > best.score) best = { columns, rows, count, score };
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
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > limit) throw new TeacherLibraryPdfError("download_too_large", 413);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new TeacherLibraryPdfError("download_too_large", 413);
  return bytes;
}

export class TeacherLibraryPdfError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "TeacherLibraryPdfError";
  }
}
