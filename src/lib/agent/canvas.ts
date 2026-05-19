import type { AgentMode, CanvasFile, CodeCanvas } from "./types";

function findFile(canvas: CodeCanvas, path: string): CanvasFile | undefined {
  return canvas.files.find((file) => file.path === path);
}

function lineIndexForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r\n|\n|\r/).length - 1;
}

function extractOutline(file: CanvasFile): string[] {
  const lines = file.content.split(/\r\n|\n|\r/).slice(0, 10);
  const entries = lines
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) =>
      /^(#{1,6}\s+|\/\/|\/\*|\*|<!--|#\s|def\s+|class\s+|function\s+|export\s+(function|class|const|let|var)\s+)/.test(
        line,
      ),
    )
    .map(({ line, number }) => `${file.path}:${number} ${line}`);

  return entries.length > 0 ? entries : [`${file.path}: ${lines[0]?.trim() ?? ""}`.trim()];
}

export function extractSelectionContext(
  canvas: CodeCanvas,
  contextLines = 3,
): { selectedText: string; surroundingText: { before: string; after: string }; outline: string[] } {
  const activePath = canvas.selection?.path ?? canvas.activeFile;
  const file = findFile(canvas, activePath) ?? canvas.files[0];

  if (!file) {
    return { selectedText: "", surroundingText: { before: "", after: "" }, outline: [] };
  }

  const outline = canvas.files.flatMap(extractOutline);

  if (!canvas.selection || canvas.selection.path !== file.path) {
    return {
      selectedText: file.content,
      surroundingText: { before: "", after: "" },
      outline,
    };
  }

  const start = Math.max(0, Math.min(canvas.selection.startOffset, file.content.length));
  const end = Math.max(start, Math.min(canvas.selection.endOffset, file.content.length));
  const lines = file.content.split(/\r\n|\n|\r/);
  const startLine = lineIndexForOffset(file.content, start);
  const endLine = lineIndexForOffset(file.content, end);
  const beforeStart = Math.max(0, startLine - contextLines);
  const afterEnd = Math.min(lines.length, endLine + contextLines + 1);

  return {
    selectedText: file.content.slice(start, end),
    surroundingText: {
      before: lines.slice(beforeStart, startLine).join("\n"),
      after: lines.slice(endLine + 1, afterEnd).join("\n"),
    },
    outline,
  };
}

export function createEmptyCanvas(mode: AgentMode): CodeCanvas {
  if (mode === "arcade") {
    return {
      files: [{ path: "index.html", language: "html", content: "" }],
      activeFile: "index.html",
      selection: null,
      baseVersion: 0,
    };
  }

  if (mode === "code") {
    return {
      files: [
        { path: "main.py", language: "python", content: "" },
        { path: "README.md", language: "markdown", content: "" },
      ],
      activeFile: "main.py",
      selection: null,
      baseVersion: 0,
    };
  }

  return {
    files: [{ path: "note.md", language: "markdown", content: "" }],
    activeFile: "note.md",
    selection: null,
    baseVersion: 0,
  };
}
