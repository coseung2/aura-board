import "server-only";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { canvaExportDesign, getAccessToken } from "@/lib/canva";

const A4 = { width: 595.28, height: 841.89 };
const A4_MARGIN = 28;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export type TeacherLibraryPdfItem = {
  kind: string;
  assetUrl: string | null;
  canvaDesignId: string | null;
};

export async function buildTeacherLibraryPdf(args: {
  userId: string;
  items: TeacherLibraryPdfItem[];
  baseUrl: string;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const hasCanva = args.items.some((item) => item.kind === "canva");
  const canvaToken = hasCanva ? await getAccessToken(args.userId) : null;
  if (hasCanva && !canvaToken) {
    throw new TeacherLibraryPdfError("canva_reconnect_required", 401);
  }

  for (const item of args.items) {
    if (item.kind === "canva") {
      if (!canvaToken || !item.canvaDesignId) {
        throw new TeacherLibraryPdfError("canva_item_invalid", 422);
      }
      const urls = await canvaExportDesign(canvaToken, item.canvaDesignId, "pdf");
      if (urls.length === 0) {
        throw new TeacherLibraryPdfError("canva_export_url_missing", 502);
      }
      for (const url of urls) await appendPdf(document, url);
      continue;
    }

    if (!item.assetUrl) {
      throw new TeacherLibraryPdfError("image_item_missing", 422);
    }
    await appendImage(document, new URL(item.assetUrl, args.baseUrl).toString());
  }

  if (document.getPageCount() === 0) {
    throw new TeacherLibraryPdfError("pdf_has_no_pages", 422);
  }
  return document.save();
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

async function appendImage(target: PDFDocument, url: string): Promise<void> {
  const response = await fetch(url, {
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

  const page = target.addPage([A4.width, A4.height]);
  const availableWidth = A4.width - A4_MARGIN * 2;
  const availableHeight = A4.height - A4_MARGIN * 2;
  const scale = Math.min(
    availableWidth / embedded.width,
    availableHeight / embedded.height,
  );
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, {
    x: (A4.width - width) / 2,
    y: (A4.height - height) / 2,
    width,
    height,
  });
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
