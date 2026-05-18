import type {
  AgentMode,
  AIAction,
  CanvasEditEvent,
  CanvasFile,
  CanvasOperation,
  CanvasPatch,
  CodeCanvas,
  DiffHunk,
  DiffLine,
  FileDiff,
} from "./types";

type ExtendedCanvasEditEvent = CanvasEditEvent & {
  from?: string;
  to?: string;
  language?: string;
};

/** Create a stable unique id for canvas operations. */
function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/** Return the index of a file in the canvas by path. */
function findFileIndex(canvas: CodeCanvas, path: string): number {
  return canvas.files.findIndex((file) => file.path === path);
}

/** Return a file in the canvas by path, if present. */
function findFile(canvas: CodeCanvas, path: string): CanvasFile | undefined {
  return canvas.files.find((file) => file.path === path);
}

/** Clone a canvas and all of its file records to keep operations pure. */
function cloneCanvas(canvas: CodeCanvas): CodeCanvas {
  return {
    ...canvas,
    files: canvas.files.map((file) => ({ ...file })),
    selection: canvas.selection ? { ...canvas.selection } : null,
  };
}

/** Check whether a text range is ordered and inside the given content. */
function validateRange(content: string, start: number, end: number): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return "Range offsets must be integers.";
  }
  if (start < 0 || end < 0) {
    return "Range offsets must be non-negative.";
  }
  if (start > end) {
    return "Range start must be less than or equal to range end.";
  }
  if (start > content.length || end > content.length) {
    return "Range is outside the file content.";
  }
  return null;
}

/** Check whether a single offset is inside the given content. */
function validateOffset(content: string, offset: number): string | null {
  if (!Number.isInteger(offset)) {
    return "Offset must be an integer.";
  }
  if (offset < 0 || offset > content.length) {
    return "Offset is outside the file content.";
  }
  return null;
}

/** Return a file extension based language for generated/restored files. */
function inferLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "html":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "jsx":
      return "jsx";
    case "py":
      return "python";
    case "md":
    case "mdx":
      return "markdown";
    case "json":
      return "json";
    default:
      return "text";
  }
}

/** Remove or clear a selection when the referenced file is no longer valid. */
function normalizeCanvasPointers(canvas: CodeCanvas): CodeCanvas {
  const files = canvas.files;
  const activeFile = files.some((file) => file.path === canvas.activeFile)
    ? canvas.activeFile
    : (files[0]?.path ?? "");
  const selection = canvas.selection && files.some((file) => file.path === canvas.selection?.path)
    ? canvas.selection
    : null;

  return { ...canvas, activeFile, selection };
}

/**
 * Apply one AI action to a canvas and return the updated canvas plus an undo/redo event.
 * The input canvas is never mutated; validation failures return the original canvas and an error.
 */
export function applyAction(
  canvas: CodeCanvas,
  action: AIAction,
): { canvas: CodeCanvas; event: CanvasEditEvent | null; error?: string } {
  const nextCanvas = cloneCanvas(canvas);

  switch (action.type) {
    case "insert": {
      const fileIndex = findFileIndex(nextCanvas, action.path);
      if (fileIndex === -1) return { canvas, event: null, error: `File not found: ${action.path}` };

      const file = nextCanvas.files[fileIndex];
      const rangeError = validateOffset(file.content, action.offset);
      if (rangeError) return { canvas, event: null, error: rangeError };

      const prevContent = file.content;
      const nextContent = `${prevContent.slice(0, action.offset)}${action.text}${prevContent.slice(action.offset)}`;
      nextCanvas.files[fileIndex] = { ...file, content: nextContent };

      return {
        canvas: nextCanvas,
        event: { kind: "insert", path: action.path, prevContent, nextContent },
      };
    }

    case "replace": {
      const fileIndex = findFileIndex(nextCanvas, action.path);
      if (fileIndex === -1) return { canvas, event: null, error: `File not found: ${action.path}` };

      const file = nextCanvas.files[fileIndex];
      const rangeError = validateRange(file.content, action.start, action.end);
      if (rangeError) return { canvas, event: null, error: rangeError };

      const prevContent = file.content;
      const nextContent = `${prevContent.slice(0, action.start)}${action.text}${prevContent.slice(action.end)}`;
      nextCanvas.files[fileIndex] = { ...file, content: nextContent };

      return {
        canvas: nextCanvas,
        event: { kind: "replace", path: action.path, prevContent, nextContent },
      };
    }

    case "delete": {
      const fileIndex = findFileIndex(nextCanvas, action.path);
      if (fileIndex === -1) return { canvas, event: null, error: `File not found: ${action.path}` };

      const file = nextCanvas.files[fileIndex];
      const rangeError = validateRange(file.content, action.start, action.end);
      if (rangeError) return { canvas, event: null, error: rangeError };

      const prevContent = file.content;
      const nextContent = `${prevContent.slice(0, action.start)}${prevContent.slice(action.end)}`;
      nextCanvas.files[fileIndex] = { ...file, content: nextContent };

      return {
        canvas: nextCanvas,
        event: { kind: "delete", path: action.path, prevContent, nextContent },
      };
    }

    case "create_file": {
      if (findFile(nextCanvas, action.path)) {
        return { canvas, event: null, error: `File already exists: ${action.path}` };
      }

      nextCanvas.files = [
        ...nextCanvas.files,
        { path: action.path, language: action.language, content: action.initialContent },
      ];
      nextCanvas.activeFile = action.path;
      nextCanvas.selection = null;

      const event: ExtendedCanvasEditEvent = {
        kind: "create_file",
        path: action.path,
        prevContent: "",
        nextContent: action.initialContent,
        language: action.language,
      };

      return { canvas: nextCanvas, event };
    }

    case "delete_file": {
      const fileIndex = findFileIndex(nextCanvas, action.path);
      if (fileIndex === -1) return { canvas, event: null, error: `File not found: ${action.path}` };

      const file = nextCanvas.files[fileIndex];
      nextCanvas.files = nextCanvas.files.filter((candidate) => candidate.path !== action.path);

      const event: ExtendedCanvasEditEvent = {
        kind: "delete_file",
        path: action.path,
        prevContent: file.content,
        nextContent: "",
        language: file.language,
      };

      return { canvas: normalizeCanvasPointers(nextCanvas), event };
    }

    case "rename_file": {
      const fileIndex = findFileIndex(nextCanvas, action.from);
      if (fileIndex === -1) return { canvas, event: null, error: `File not found: ${action.from}` };
      if (findFile(nextCanvas, action.to)) {
        return { canvas, event: null, error: `File already exists: ${action.to}` };
      }

      const file = nextCanvas.files[fileIndex];
      nextCanvas.files[fileIndex] = { ...file, path: action.to };
      nextCanvas.activeFile = nextCanvas.activeFile === action.from ? action.to : nextCanvas.activeFile;
      nextCanvas.selection = nextCanvas.selection?.path === action.from
        ? { ...nextCanvas.selection, path: action.to }
        : nextCanvas.selection;

      const event: ExtendedCanvasEditEvent = {
        kind: "rename_file",
        path: action.to,
        prevContent: file.content,
        nextContent: file.content,
        from: action.from,
        to: action.to,
        language: file.language,
      };

      return { canvas: nextCanvas, event };
    }
  }
}

/**
 * Validate one AI action against a canvas without mutating or applying the change.
 * The returned operation receives a fresh id and includes a failure reason when invalid.
 */
export function validateAction(canvas: CodeCanvas, action: AIAction): CanvasOperation {
  const result = applyAction(canvas, action);

  return {
    id: createId(),
    action,
    valid: !result.error,
    reason: result.error,
  };
}

/**
 * Validate all operations in a patch, including optimistic baseVersion conflict detection.
 * Operations are checked in order against a temporary canvas so dependent edits can validate.
 */
export function validatePatch(
  canvas: CodeCanvas,
  patch: CanvasPatch,
): { valid: boolean; operations: CanvasOperation[]; errors: string[] } {
  const errors: string[] = [];

  if (patch.baseVersion !== canvas.baseVersion) {
    errors.push(
      `Patch baseVersion mismatch: patch=${patch.baseVersion}, canvas=${canvas.baseVersion}`,
    );
  }

  let workingCanvas = canvas;
  const operations = patch.operations.map((operation) => {
    const result = applyAction(workingCanvas, operation.action);
    const validated: CanvasOperation = {
      id: operation.id,
      action: operation.action,
      valid: !result.error,
      reason: result.error,
    };

    if (!result.error) {
      workingCanvas = result.canvas;
    }

    return validated;
  });

  errors.push(
    ...operations
      .filter((operation) => !operation.valid)
      .map((operation) => operation.reason ?? "Invalid operation."),
  );

  return {
    valid: errors.length === 0,
    operations,
    errors,
  };
}

/**
 * Apply a patch to a canvas, optionally accepting only selected operation ids.
 * The canvas baseVersion is incremented once if every selected operation applies successfully.
 */
export function applyPatch(
  canvas: CodeCanvas,
  patch: CanvasPatch,
  acceptedOpIds?: string[],
): { canvas: CodeCanvas; events: CanvasEditEvent[]; error?: string } {
  const acceptedIds = acceptedOpIds ? new Set(acceptedOpIds) : null;
  const operations = acceptedIds
    ? patch.operations.filter((operation) => acceptedIds.has(operation.id))
    : patch.operations;

  let workingCanvas = canvas;
  const events: CanvasEditEvent[] = [];

  for (const operation of operations) {
    const result = applyAction(workingCanvas, operation.action);
    if (result.error) {
      return {
        canvas,
        events: [],
        error: `Operation ${operation.id} failed: ${result.error}`,
      };
    }

    workingCanvas = result.canvas;
    if (result.event) events.push(result.event);
  }

  return {
    canvas: { ...workingCanvas, baseVersion: workingCanvas.baseVersion + 1 },
    events,
  };
}

/** Split text into diffable lines while preserving line terminators. */
function splitLinesWithTerminators(content: string): string[] {
  if (content.length === 0) return [];
  const matches = content.match(/.*(?:\r\n|\n|\r|$)/g) ?? [];
  return matches.filter((line, index) => line.length > 0 || index < matches.length - 1);
}

/** Build one full-file hunk from old and new line arrays using LCS line diff. */
function buildLineDiffHunk(oldLines: string[], newLines: string[]): DiffHunk[] {
  if (oldLines.length === 0 && newLines.length === 0) return [];

  const lengths: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0),
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? lengths[oldIndex + 1][newIndex + 1] + 1
        : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let oldLineNumber = 1;
  let newLineNumber = 1;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({
        kind: "unchanged",
        text: oldLines[oldIndex],
        oldLine: oldLineNumber,
        newLine: newLineNumber,
      });
      oldIndex += 1;
      newIndex += 1;
      oldLineNumber += 1;
      newLineNumber += 1;
    } else if (newIndex < newLines.length && (oldIndex === oldLines.length || lengths[oldIndex][newIndex + 1] >= lengths[oldIndex + 1][newIndex])) {
      lines.push({ kind: "added", text: newLines[newIndex], oldLine: null, newLine: newLineNumber });
      newIndex += 1;
      newLineNumber += 1;
    } else if (oldIndex < oldLines.length) {
      lines.push({ kind: "removed", text: oldLines[oldIndex], oldLine: oldLineNumber, newLine: null });
      oldIndex += 1;
      oldLineNumber += 1;
    }
  }

  return [
    {
      oldStart: oldLines.length > 0 ? 1 : 0,
      oldLines: oldLines.length,
      newStart: newLines.length > 0 ? 1 : 0,
      newLines: newLines.length,
      lines,
    },
  ];
}

/**
 * Compute a line-oriented diff between two versions of one file.
 * This implementation is dependency-free and returns one full-file hunk when content differs.
 */
export function computeFileDiff(oldContent: string, newContent: string): DiffHunk[] {
  if (oldContent === newContent) return [];

  return buildLineDiffHunk(
    splitLinesWithTerminators(oldContent),
    splitLinesWithTerminators(newContent),
  );
}

/**
 * Compute diffs for every changed, added, or removed file between two canvases.
 * Unchanged files are omitted from the returned array.
 */
export function computeCanvasDiff(oldCanvas: CodeCanvas, newCanvas: CodeCanvas): FileDiff[] {
  const oldFiles = new Map(oldCanvas.files.map((file) => [file.path, file]));
  const newFiles = new Map(newCanvas.files.map((file) => [file.path, file]));
  const paths = Array.from(new Set([...oldFiles.keys(), ...newFiles.keys()])).sort();

  return paths.flatMap((path) => {
    const oldFile = oldFiles.get(path);
    const newFile = newFiles.get(path);
    const hunks = computeFileDiff(oldFile?.content ?? "", newFile?.content ?? "");

    return hunks.length > 0 ? [{ path, hunks }] : [];
  });
}

/**
 * Undo one canvas edit event by restoring previous content or reversing file lifecycle changes.
 * Extra metadata produced by applyAction is used for create/delete/rename events when available.
 */
export function undoEvent(canvas: CodeCanvas, event: CanvasEditEvent): CodeCanvas {
  const nextCanvas = cloneCanvas(canvas);
  const extended = event as ExtendedCanvasEditEvent;

  if (event.kind === "create_file") {
    nextCanvas.files = nextCanvas.files.filter((file) => file.path !== event.path);
    return normalizeCanvasPointers(nextCanvas);
  }

  if (event.kind === "delete_file") {
    if (!findFile(nextCanvas, event.path)) {
      nextCanvas.files = [
        ...nextCanvas.files,
        { path: event.path, language: extended.language ?? inferLanguage(event.path), content: event.prevContent },
      ];
    }
    nextCanvas.activeFile = event.path;
    return nextCanvas;
  }

  if (event.kind === "rename_file") {
    const from = extended.from ?? event.path;
    const to = extended.to ?? event.path;
    const fileIndex = findFileIndex(nextCanvas, to);
    if (fileIndex !== -1) {
      nextCanvas.files[fileIndex] = { ...nextCanvas.files[fileIndex], path: from, content: event.prevContent };
    }
    nextCanvas.activeFile = nextCanvas.activeFile === to ? from : nextCanvas.activeFile;
    nextCanvas.selection = nextCanvas.selection?.path === to ? { ...nextCanvas.selection, path: from } : nextCanvas.selection;
    return nextCanvas;
  }

  const fileIndex = findFileIndex(nextCanvas, event.path);
  if (fileIndex !== -1) {
    nextCanvas.files[fileIndex] = { ...nextCanvas.files[fileIndex], content: event.prevContent };
  }

  return nextCanvas;
}

/**
 * Redo one canvas edit event by restoring next content or replaying file lifecycle changes.
 * Extra metadata produced by applyAction is used for create/delete/rename events when available.
 */
export function redoEvent(canvas: CodeCanvas, event: CanvasEditEvent): CodeCanvas {
  const nextCanvas = cloneCanvas(canvas);
  const extended = event as ExtendedCanvasEditEvent;

  if (event.kind === "create_file") {
    if (!findFile(nextCanvas, event.path)) {
      nextCanvas.files = [
        ...nextCanvas.files,
        { path: event.path, language: extended.language ?? inferLanguage(event.path), content: event.nextContent },
      ];
    }
    nextCanvas.activeFile = event.path;
    return nextCanvas;
  }

  if (event.kind === "delete_file") {
    nextCanvas.files = nextCanvas.files.filter((file) => file.path !== event.path);
    return normalizeCanvasPointers(nextCanvas);
  }

  if (event.kind === "rename_file") {
    const from = extended.from ?? event.path;
    const to = extended.to ?? event.path;
    const fileIndex = findFileIndex(nextCanvas, from);
    if (fileIndex !== -1) {
      nextCanvas.files[fileIndex] = { ...nextCanvas.files[fileIndex], path: to, content: event.nextContent };
    }
    nextCanvas.activeFile = nextCanvas.activeFile === from ? to : nextCanvas.activeFile;
    nextCanvas.selection = nextCanvas.selection?.path === from ? { ...nextCanvas.selection, path: to } : nextCanvas.selection;
    return nextCanvas;
  }

  const fileIndex = findFileIndex(nextCanvas, event.path);
  if (fileIndex !== -1) {
    nextCanvas.files[fileIndex] = { ...nextCanvas.files[fileIndex], content: event.nextContent };
  }

  return nextCanvas;
}

/** Return the zero-based line index containing an offset. */
function lineIndexForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r\n|\n|\r/).length - 1;
}

/** Return heading/comment-like outline entries from the first ten lines of a file. */
function extractOutline(file: CanvasFile): string[] {
  const lines = file.content.split(/\r\n|\n|\r/).slice(0, 10);
  const entries = lines
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /^(#{1,6}\s+|\/\/|\/\*|\*|<!--|#\s|def\s+|class\s+|function\s+|export\s+(function|class|const|let|var)\s+)/.test(line))
    .map(({ line, number }) => `${file.path}:${number} ${line}`);

  return entries.length > 0 ? entries : [`${file.path}: ${lines[0]?.trim() ?? ""}`.trim()];
}

/**
 * Extract selected text, nearby context, and a lightweight outline for the active canvas file.
 * When there is no selection, the active file's full content is returned as selectedText.
 */
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

/**
 * Create an initial empty canvas appropriate for an agent mode.
 * Arcade starts with HTML, code starts with Python plus a README, and tutor/lesson use Markdown notes.
 */
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
