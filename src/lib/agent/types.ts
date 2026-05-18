// Agent Service types (Phase 0, 2026-05-17 → Canvas Architecture, 2026-05-18).
// 학생 전용 AI 채팅 세션 + 캔버스 상태 모델.
// VibeSession(슬롯 기반)과 별개로 arcade/tutor/code/lesson 모드를 지원.

export const AGENT_MODES = ["arcade", "tutor", "code", "lesson"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  arcade: "🎮 게임",
  tutor: "📚 학습",
  code: "💻 코딩",
  lesson: "📖 수업",
};

export const AGENT_MODE_DESCRIPTIONS: Record<AgentMode, string> = {
  arcade: "게임을 만들고 친구들과 공유해요",
  tutor: "모르는 문제를 질문하고 배워요",
  code: "자유롭게 코드를 작성해요",
  lesson: "선생님이 준비한 수업을 따라가요",
};

export const AGENT_STATUS = ["active", "completed", "abandoned"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];

/* ── 캔버스 상태 모델 ─────────────────────────────────────────────── */

/** 캔버스 안의 단일 파일 */
export interface CanvasFile {
  path: string;
  language: string;
  content: string;
}

/** 사용자 선택 영역 */
export interface CanvasSelection {
  path: string;
  startOffset: number;
  endOffset: number;
}

/** 에디터 히스토리 (undo/redo용) */
export interface CanvasEditEvent {
  kind: "insert" | "replace" | "delete" | "create_file" | "delete_file" | "rename_file";
  path: string;
  /** Undo를 위한 이전 상태 스냅샷 */
  prevContent: string;
  /** Redo를 위한 이후 상태 스냅샷 */
  nextContent: string;
}

/** 전체 캔버스 상태 */
export interface CodeCanvas {
  files: CanvasFile[];
  activeFile: string;
  selection: CanvasSelection | null;
  /** baseVersion은 patch 충돌 감지용 — 서버가 관리 */
  baseVersion: number;
}

/* ── AI 편집 명령 (structured output) ─────────────────────────────── */

export type AIAction =
  | { type: "insert"; path: string; offset: number; text: string }
  | { type: "replace"; path: string; start: number; end: number; text: string }
  | { type: "delete"; path: string; start: number; end: number }
  | { type: "create_file"; path: string; language: string; initialContent: string }
  | { type: "delete_file"; path: string }
  | { type: "rename_file"; from: string; to: string };

export interface CanvasOperation {
  id: string;
  action: AIAction;
  /** 검증 결과 */
  valid: boolean;
  reason?: string;
}

/* ── Patch (변경 제안) ────────────────────────────────────────────── */

export type CanvasPatchStatus = "proposed" | "accepted" | "rejected" | "partial";

export interface CanvasPatch {
  id: string;
  sessionId: string;
  baseVersion: number;
  operations: CanvasOperation[];
  summary: string; // AI가 생성한 한 줄 설명
  status: CanvasPatchStatus;
  acceptedOps: string[]; // 부분 수락 시 operation id 목록
  createdAt: string;
}

/* ── Diff 표시용 ──────────────────────────────────────────────────── */

export type DiffLineKind = "added" | "removed" | "unchanged";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}

/* ── 채팅 ↔ 캔버스 분리 ──────────────────────────────────────────── */

export interface AgentMessageDTO {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount: number | null;
  createdAt: string;
  /** 이 메시지가 생성한 patch id (있을 경우) */
  canvasPatchId?: string;
}

export interface AgentSessionDTO {
  id: string;
  mode: AgentMode;
  title: string;
  status: AgentStatus;
  tokenCount: number;
  messageCount: number;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: AgentMessageDTO[];
  /** 저장된 캔버스 상태 (있을 경우) */
  canvas?: CodeCanvas | null;
  /** 패치 히스토리 */
  patches?: CanvasPatch[];
}

// Create session request
export interface CreateSessionRequest {
  mode: AgentMode;
  boardId: string;
}

// Structured output request 캔버스 선택 영역 포함
export interface SendCanvasMessageRequest {
  content: string;
  canvas: {
    files: Pick<CanvasFile, "path" | "language">[];
    activeFile: string;
    selection: CanvasSelection | null;
    /** 선택 영역 내용 (편의상 서버가 추출) */
    selectedText: string;
    /** 선택 영역 주변 맥락 (앞/뒤 N줄) */
    surroundingText: { before: string; after: string };
    /** 파일 구조 요약 (긴 파일용) */
    outline: string[];
  };
}

// SSE event types for streaming
export type AgentStreamEvent =
  | { type: "session"; id: string }
  | { type: "message_delta"; text: string }
  | { type: "code_delta"; text: string }
  | { type: "done"; stopReason: string; message: string; code: string }
  // Structured output 지원
  | { type: "actions"; actions: AIAction[] }
  | { type: "patch_proposed"; patch: CanvasPatch }
  | { type: "error"; message: string };
