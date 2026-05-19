export const AGENT_MODES = ["arcade", "tutor", "code", "lesson"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  arcade: "게임",
  tutor: "학습",
  code: "코딩",
  lesson: "수업",
};

export const AGENT_MODE_DESCRIPTIONS: Record<AgentMode, string> = {
  arcade: "HTML 게임을 만들고 미리보기로 실행합니다.",
  tutor: "모르는 내용을 질문하고 설명을 받습니다.",
  code: "코드 작성, 리뷰, 디버깅을 돕습니다.",
  lesson: "수업 자료와 활동을 따라가도록 안내합니다.",
};

export const AGENT_STATUS = ["active", "completed", "abandoned"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];

export interface CanvasFile {
  path: string;
  language: string;
  content: string;
}

export interface CanvasSelection {
  path: string;
  startOffset: number;
  endOffset: number;
}

export interface CodeCanvas {
  files: CanvasFile[];
  activeFile: string;
  selection: CanvasSelection | null;
  baseVersion: number;
}

export interface AgentMessageDTO {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount: number | null;
  createdAt: string;
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
  canvas?: CodeCanvas | null;
}

export interface CreateSessionRequest {
  mode: AgentMode;
  boardId: string;
}

export interface SendCanvasMessageRequest {
  content: string;
  canvas: {
    files: Pick<CanvasFile, "path" | "language">[];
    activeFile: string;
    selection: CanvasSelection | null;
    selectedText: string;
    surroundingText: { before: string; after: string };
    outline: string[];
  };
}

export type AgentStreamEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "message_delta"; text: string }
  | { type: "code_delta"; text: string }
  | { type: "done"; stopReason: string; message: string; code: string }
  | { type: "error"; message: string };
