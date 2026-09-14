import "server-only";

import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import { canvaExportDesign, getAccessToken } from "@/lib/canva";
import {
  planTeacherLibraryPrint,
  type PrintSourcePage,
  type TeacherLibraryPrintOptions,
  type TeacherLibraryPrintPlan,
} from "@/lib/teacher-library-print-layout";

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const DEFAULT_IMAGE_DPI = 96;

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
  options: TeacherLibraryPrintOptions;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const hasCanva = args.items.some((item) => item.kind === "canva");
  const canvaToken = hasCanva ? await getAccessToken(args.userId) : null;
  if (hasCanva && !canvaToken) {
    throw new TeacherLibraryPdfError("canva_reconnect_required", 401);
  }

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
  const plan = planTeacherLibraryPrint(units, args.options);
  renderPrintPlan(document, units, plan, args.options.cropMarks);

  if (document.getPageCount() === 0) {
    throw new TeacherLibraryPdfError("pdf_has_no_pages", 422);
  }
  return document.save();
}

export async function inspectTeacherLibraryPrintSources(args: {
  userId: string;
  items: TeacherLibraryPdfItem[];
  baseUrl: string;
}): Promise<PrintSourcePage[]> {
  const hasCanva = args.items.some((item) => item.kind === "canva");
  const canvaToken = hasCanva ? await getAccessToken(args.userId) : null;
  if (hasCanva && !canvaToken) {
    throw new TeacherLibraryPdfError("canva_reconnect_required", 401);
  }

  const sources: PrintSourcePage[] = [];
  for (const item of args.items) {
    if (item.kind === "canva") {
      for (const url of await canvaPdfUrls(item, canvaToken)) {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new TeacherLibraryPdfError("canva_pdf_download_failed", 502);
        const pdf = await PDFDocument.load(await readLimited(response, MAX_DOWNLOAD_BYTES));
        if (pdf.getPageCount() === 0) throw new TeacherLibraryPdfError("canva_pdf_empty", 502);
        sources.push(...pdf.getPages().map((page) => page.getSize()));
      }
      continue;
    }

    if (!item.assetUrl) throw new TeacherLibraryPdfError("image_item_missing", 422);
    const response = await fetch(new URL(item.assetUrl, args.baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new TeacherLibraryPdfError("image_download_failed", 502);
    const metadata = await sharp(await readLimited(response, MAX_DOWNLOAD_BYTES), { pages: 1 }).metadata();
    if (!metadata.width || !metadata.height) throw new TeacherLibraryPdfError("image_dimensions_missing", 422);
    const density = metadata.density && metadata.density > 0 ? metadata.density : DEFAULT_IMAGE_DPI;
    sources.push({ width: (metadata.width * 72) / density, height: (metadata.height * 72) / density });
  }
  return sources;
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
  const metadata = await sharp(source, { pages: 1 }).metadata();
  const density = metadata.density && metadata.density > 0 ? metadata.density : DEFAULT_IMAGE_DPI;
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
    width: (embedded.width * 72) / density,
    height: (embedded.height * 72) / density,
    draw: (page, box) => page.drawImage(embedded, box),
  };
}

function renderPrintPlan(
  document: PDFDocument,
  units: RenderUnit[],
  plan: TeacherLibraryPrintPlan,
  cropMarks: boolean,
) {
  for (const plannedPage of plan.pages) {
    const page = document.addPage([plannedPage.width, plannedPage.height]);
    for (const placement of plannedPage.placements) {
      units[placement.sourceIndex].draw(page, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      });
      if (cropMarks) drawCropMarks(page, placement);
    }
  }
}

function drawCropMarks(page: PDFPage, box: DrawBox) {
  const offset = 0.7 * (72 / 25.4);
  const length = 3 * (72 / 25.4);
  const color = rgb(0.35, 0.35, 0.35);
  const thickness = 0.35;
  const segments = [
    [[box.x - offset - length, box.y], [box.x - offset, box.y]],
    [[box.x, box.y - offset - length], [box.x, box.y - offset]],
    [[box.x + box.width + offset, box.y], [box.x + box.width + offset + length, box.y]],
    [[box.x + box.width, box.y - offset - length], [box.x + box.width, box.y - offset]],
    [[box.x - offset - length, box.y + box.height], [box.x - offset, box.y + box.height]],
    [[box.x, box.y + box.height + offset], [box.x, box.y + box.height + offset + length]],
    [[box.x + box.width + offset, box.y + box.height], [box.x + box.width + offset + length, box.y + box.height]],
    [[box.x + box.width, box.y + box.height + offset], [box.x + box.width, box.y + box.height + offset + length]],
  ] as const;
  for (const [start, end] of segments) {
    page.drawLine({ start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, thickness, color });
  }
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
