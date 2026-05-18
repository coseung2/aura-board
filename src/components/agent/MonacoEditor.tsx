"use client";

import { useCallback, useMemo, useRef } from "react";
import Editor, { DiffEditor, type DiffOnMount, type OnMount } from "@monaco-editor/react";

import type { CanvasFile, CodeCanvas } from "@/lib/agent/types";

interface MonacoEditorProps {
  canvas: CodeCanvas;
  onCanvasChange: (canvas: CodeCanvas) => void;
  readonly?: boolean;
  originalCanvas?: CodeCanvas;
}

const languageByExtension: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sh: "shell",
  bash: "shell",
};

function getLanguageFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? languageByExtension[extension] ?? "plaintext" : "plaintext";
}

function getUniquePath(basePath: string, files: CanvasFile[]) {
  const existingPaths = new Set(files.map((file) => file.path));

  if (!existingPaths.has(basePath)) {
    return basePath;
  }

  const lastDotIndex = basePath.lastIndexOf(".");
  const name = lastDotIndex > 0 ? basePath.slice(0, lastDotIndex) : basePath;
  const extension = lastDotIndex > 0 ? basePath.slice(lastDotIndex) : "";

  let index = 2;
  let candidate = `${name}-${index}${extension}`;
  while (existingPaths.has(candidate)) {
    index += 1;
    candidate = `${name}-${index}${extension}`;
  }

  return candidate;
}

export default function MonacoEditor({
  canvas,
  onCanvasChange,
  readonly = false,
  originalCanvas,
}: MonacoEditorProps) {
  const canvasRef = useRef(canvas);
  const onCanvasChangeRef = useRef(onCanvasChange);
  canvasRef.current = canvas;
  onCanvasChangeRef.current = onCanvasChange;

  const activeFile = useMemo(
    () => canvas.files.find((file) => file.path === canvas.activeFile) ?? canvas.files[0] ?? null,
    [canvas.activeFile, canvas.files],
  );

  const originalActiveFile = useMemo(
    () =>
      originalCanvas?.files.find((file) => file.path === activeFile?.path) ??
      originalCanvas?.files.find((file) => file.path === originalCanvas.activeFile) ??
      null,
    [activeFile?.path, originalCanvas],
  );

  const emitCanvas = useCallback((nextCanvas: CodeCanvas) => {
    canvasRef.current = nextCanvas;
    onCanvasChangeRef.current(nextCanvas);
  }, []);

  const handleSelectFile = useCallback(
    (path: string) => {
      emitCanvas({ ...canvasRef.current, activeFile: path });
    },
    [emitCanvas],
  );

  const handleAddFile = useCallback(() => {
    if (readonly) return;

    const enteredPath = window.prompt("새 파일 이름을 입력하세요", "untitled.tsx")?.trim();
    if (!enteredPath) return;

    const currentCanvas = canvasRef.current;
    const path = getUniquePath(enteredPath, currentCanvas.files);
    const newFile: CanvasFile = {
      path,
      language: getLanguageFromPath(path),
      content: "",
    };

    emitCanvas({
      ...currentCanvas,
      files: [...currentCanvas.files, newFile],
      activeFile: path,
      selection: null,
    });
  }, [emitCanvas, readonly]);

  const handleDeleteFile = useCallback(
    (path: string) => {
      if (readonly) return;

      const currentCanvas = canvasRef.current;
      if (currentCanvas.files.length <= 1) return;

      const deleteIndex = currentCanvas.files.findIndex((file) => file.path === path);
      if (deleteIndex === -1) return;

      const nextFiles = currentCanvas.files.filter((file) => file.path !== path);
      const nextActiveFile =
        currentCanvas.activeFile === path
          ? nextFiles[Math.max(0, deleteIndex - 1)]?.path ?? nextFiles[0].path
          : currentCanvas.activeFile;

      emitCanvas({
        ...currentCanvas,
        files: nextFiles,
        activeFile: nextActiveFile,
        selection: currentCanvas.selection?.path === path ? null : currentCanvas.selection,
      });
    },
    [emitCanvas, readonly],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (readonly || !activeFile) return;

      const nextContent = value ?? "";
      const currentCanvas = canvasRef.current;
      const nextFiles = currentCanvas.files.map((file) =>
        file.path === activeFile.path ? { ...file, content: nextContent } : file,
      );

      emitCanvas({ ...currentCanvas, files: nextFiles });
    },
    [activeFile, emitCanvas, readonly],
  );

  const trackSelection = useCallback((editor: Parameters<OnMount>[0]) => {
    return editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel();
      const currentCanvas = canvasRef.current;
      const path = currentCanvas.activeFile;

      if (!model || !path) return;

      const startOffset = model.getOffsetAt(event.selection.getStartPosition());
      const endOffset = model.getOffsetAt(event.selection.getEndPosition());

      emitCanvas({
        ...currentCanvas,
        selection: {
          path,
          startOffset,
          endOffset,
        },
      });
    });
  }, [emitCanvas]);

  const handleEditorMount = useCallback<OnMount>(
    (editor) => {
      trackSelection(editor);
    },
    [trackSelection],
  );

  const handleDiffEditorMount = useCallback<DiffOnMount>(
    (editor) => {
      const modifiedEditor = editor.getModifiedEditor();
      trackSelection(modifiedEditor);

      if (!readonly) {
        modifiedEditor.onDidChangeModelContent(() => {
          handleEditorChange(modifiedEditor.getValue());
        });
      }
    },
    [handleEditorChange, readonly, trackSelection],
  );

  if (!activeFile) {
    return (
      <div className="monaco-canvas monaco-canvas-empty">
        <p>표시할 파일이 없습니다.</p>
        {!readonly && (
          <button type="button" className="monaco-canvas-empty-button" onClick={handleAddFile}>
            파일 추가
          </button>
        )}
      </div>
    );
  }

  const isDiffMode = Boolean(originalCanvas);

  return (
    <div className="monaco-canvas">
      <aside className="monaco-canvas-tabs" aria-label="파일 목록">
        <div className="monaco-canvas-tabs-head">
          <span>Files</span>
          {!readonly && (
            <button
              type="button"
              className="monaco-canvas-icon-button"
              onClick={handleAddFile}
              aria-label="새 파일 추가"
              title="새 파일 추가"
            >
              +
            </button>
          )}
        </div>

        <div className="monaco-canvas-tab-list">
          {canvas.files.map((file) => {
            const isActive = file.path === activeFile.path;

            return (
              <div
                key={file.path}
                className={`monaco-canvas-tab ${isActive ? "monaco-canvas-tab-active" : ""}`}
              >
                <button
                  type="button"
                  className="monaco-canvas-tab-button"
                  onClick={() => handleSelectFile(file.path)}
                  title={file.path}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="monaco-canvas-tab-name">{file.path}</span>
                  <span className="monaco-canvas-tab-language">{file.language || "plaintext"}</span>
                </button>

                {!readonly && canvas.files.length > 1 && (
                  <button
                    type="button"
                    className="monaco-canvas-tab-delete"
                    onClick={() => handleDeleteFile(file.path)}
                    aria-label={`${file.path} 삭제`}
                    title="파일 삭제"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="monaco-canvas-editor" aria-label={isDiffMode ? "코드 diff 에디터" : "코드 에디터"}>
        {isDiffMode ? (
          <DiffEditor
            key={`diff:${activeFile.path}`}
            original={originalActiveFile?.content ?? ""}
            modified={activeFile.content}
            language={activeFile.language || "plaintext"}
            onMount={handleDiffEditorMount}
            options={{
              readOnly: readonly,
              domReadOnly: readonly,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        ) : (
          <Editor
            key={activeFile.path}
            value={activeFile.content}
            language={activeFile.language || "plaintext"}
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            options={{
              readOnly: readonly,
              domReadOnly: readonly,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontSize: 13,
              tabSize: 2,
            }}
          />
        )}
      </section>
    </div>
  );
}

export type { MonacoEditorProps };
