export const PDF_POINTS_PER_MM = 72 / 25.4;

export type TeacherLibraryPrintMode = "auto-original" | "fit-page" | "original-pages";
export type TeacherLibraryPaper = "a4";
export type TeacherLibraryOrientation = "portrait" | "landscape";
export type TeacherLibraryLastPageAlignment = "start" | "center";

export type TeacherLibraryPrintOptions = {
  mode: TeacherLibraryPrintMode;
  paper: TeacherLibraryPaper;
  orientation: TeacherLibraryOrientation;
  marginMm: number;
  gapMm: number;
  lastPageAlignment: TeacherLibraryLastPageAlignment;
  cropMarks: boolean;
};

export type PrintSourcePage = {
  width: number;
  height: number;
};

export type PrintPlacement = {
  sourceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export type PrintPlanPage = {
  width: number;
  height: number;
  placements: PrintPlacement[];
};

export type TeacherLibraryPrintPlan = {
  pages: PrintPlanPage[];
  warnings: Array<"source_scaled_down">;
};

export const DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS: TeacherLibraryPrintOptions = {
  mode: "auto-original",
  paper: "a4",
  orientation: "portrait",
  marginMm: 12.7,
  gapMm: 3.5,
  lastPageAlignment: "center",
  cropMarks: false,
};

const A4_PORTRAIT = { width: 210 * PDF_POINTS_PER_MM, height: 297 * PDF_POINTS_PER_MM };

export function planTeacherLibraryPrint(
  sources: PrintSourcePage[],
  options: TeacherLibraryPrintOptions,
): TeacherLibraryPrintPlan {
  if (sources.length === 0) return { pages: [], warnings: [] };
  if (options.mode === "original-pages") {
    return {
      pages: sources.map((source, sourceIndex) => ({
        width: source.width,
        height: source.height,
        placements: [{ sourceIndex, x: 0, y: 0, width: source.width, height: source.height, scale: 1 }],
      })),
      warnings: [],
    };
  }

  const paper = paperSize(options);
  const cropMarkClearanceMm = options.cropMarks ? 4 : 0;
  const margin = Math.max(options.marginMm, cropMarkClearanceMm) * PDF_POINTS_PER_MM;
  const gap = Math.max(options.gapMm, cropMarkClearanceMm * 2) * PDF_POINTS_PER_MM;
  const content = {
    x: margin,
    y: margin,
    width: Math.max(1, paper.width - margin * 2),
    height: Math.max(1, paper.height - margin * 2),
  };

  if (options.mode === "fit-page") {
    let scaled = false;
    const pages = sources.map((source, sourceIndex) => {
      const box = fitBox(source, content, true);
      if (box.scale < 1) scaled = true;
      return { width: paper.width, height: paper.height, placements: [{ sourceIndex, ...box }] };
    });
    return { pages, warnings: scaled ? ["source_scaled_down"] : [] };
  }

  const maxWidth = Math.max(...sources.map((source) => Math.min(source.width, content.width)));
  const maxHeight = Math.max(...sources.map((source) => Math.min(source.height, content.height)));
  const columns = Math.max(1, Math.floor((content.width + gap) / (maxWidth + gap)));
  const rows = Math.max(1, Math.floor((content.height + gap) / (maxHeight + gap)));
  const perPage = columns * rows;
  const cellWidth = (content.width - gap * (columns - 1)) / columns;
  const cellHeight = (content.height - gap * (rows - 1)) / rows;
  const pages: PrintPlanPage[] = [];
  let scaled = false;

  for (let start = 0; start < sources.length; start += perPage) {
    const count = Math.min(perPage, sources.length - start);
    const occupiedRows = Math.ceil(count / columns);
    const verticalOffset = options.lastPageAlignment === "center"
      ? (content.height - (occupiedRows * cellHeight + (occupiedRows - 1) * gap)) / 2
      : 0;
    const placements: PrintPlacement[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      const sourceIndex = start + offset;
      const source = sources[sourceIndex];
      const row = Math.floor(offset / columns);
      const column = offset % columns;
      const rowItemCount = Math.min(columns, count - row * columns);
      const horizontalOffset = options.lastPageAlignment === "center"
        ? (content.width - (rowItemCount * cellWidth + (rowItemCount - 1) * gap)) / 2
        : 0;
      const box = fitBox(source, {
        x: content.x + horizontalOffset + column * (cellWidth + gap),
        y: paper.height - content.y - verticalOffset - (row + 1) * cellHeight - row * gap,
        width: cellWidth,
        height: cellHeight,
      }, false);
      if (box.scale < 1) scaled = true;
      placements.push({ sourceIndex, ...box });
    }
    pages.push({ width: paper.width, height: paper.height, placements });
  }

  return { pages, warnings: scaled ? ["source_scaled_down"] : [] };
}

function paperSize(options: TeacherLibraryPrintOptions) {
  return options.orientation === "landscape"
    ? { width: A4_PORTRAIT.height, height: A4_PORTRAIT.width }
    : A4_PORTRAIT;
}

function fitBox(
  source: PrintSourcePage,
  target: { x: number; y: number; width: number; height: number },
  allowUpscale: boolean,
) {
  const scale = Math.min(
    allowUpscale ? Number.POSITIVE_INFINITY : 1,
    target.width / source.width,
    target.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
    scale,
  };
}
