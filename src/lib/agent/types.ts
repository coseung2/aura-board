// Agent Service types (Phase 0, 2026-05-17).
// 학생 전용 AI 채팅 세션. VibeSession(슬롯 기반)과 별개로
// arcade(게임) / tutor(학습) / code(코딩) / lesson(수업) 모드를 지원.

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
}

export interface AgentMessageDTO {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

// Create session request
export interface CreateSessionRequest {
  mode: AgentMode;
  boardId: string;
}

// Send message request
export interface SendMessageRequest {
  content: string;
}

// SSE event types for streaming
export type AgentStreamEvent =
  | { type: "session"; id: string }
  | { type: "message_delta"; text: string }
  | { type: "code_delta"; text: string }
  | { type: "done"; stopReason: string; message: string; code: string }
  | { type: "error"; message: string };
