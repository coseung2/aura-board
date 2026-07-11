"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { QuizGenerateModal } from "@/components/quiz/QuizGenerateModal";
import { QuizReportModal } from "@/components/quiz/QuizReportModal";
import { QuizDraftEditor } from "@/components/quiz/QuizDraftEditor";
import { useQuizRealtime } from "@/features/quiz/useQuizRealtime";
import type { QuizRealtimeSnapshot } from "@/features/quiz/realtime";
import type { QuizDraftQuestion } from "@/types/quiz";

export type QuizQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
};

export type QuizData = {
  id: string;
  title: string;
  roomCode: string;
  status: "waiting" | "active" | "finished";
  currentQuestionIndex: number;
  questions: QuizQuestion[];
  players: { id: string; nickname: string; score: number }[];
};

type Props = { boardId: string; quizzes: QuizData[] };
type LLMSettings = {
  provider: "openai" | "anthropic" | "gemini";
  apiKey: string;
};

const OPT_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
const OPT_LABELS = ["A", "B", "C", "D"];

export function QuizBoard({ boardId, quizzes: initial }: Props) {
  const [quizzes, setQuizzes] = useState<QuizData[]>(initial);
  const [showLLM, setShowLLM] = useState(false);
  const [llm, setLlm] = useState<LLMSettings>({
    provider: "openai",
    apiKey: "",
  });
  const [showGenerate, setShowGenerate] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editing, setEditing] = useState<QuizDraftQuestion[] | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dist, setDist] = useState<Record<string, number>>({});

  const quiz = quizzes[0] ?? null;

  const sorted = useMemo(
    () => [...(quiz?.players ?? [])].sort((a, b) => b.score - a.score),
    [quiz?.players],
  );

  const applySnapshot = useCallback((snapshot: QuizRealtimeSnapshot) => {
    setQuizzes((previous) =>
      previous.map((item) =>
        item.id === snapshot.quizId
          ? {
              ...item,
              status: snapshot.status,
              currentQuestionIndex: snapshot.currentQuestionIndex,
              players: snapshot.players,
            }
          : item,
      ),
    );
    setDist(snapshot.distribution);
  }, []);

  const { onlineCount, realtimeReady } = useQuizRealtime({
    quizId: quiz?.id ?? null,
    onSnapshot: applySnapshot,
  });

  useEffect(() => {
    const pm = document.cookie.match(/llm_provider=([^;]+)/);
    const km = document.cookie.match(/llm_api_key=([^;]+)/);
    if (pm || km) {
      setLlm({
        provider: (pm?.[1] as LLMSettings["provider"]) ?? "openai",
        apiKey: km ? decodeURIComponent(km[1]) : "",
      });
    }
  }, []);

  function saveLLM(settings: LLMSettings) {
    setLlm(settings);
    document.cookie = `llm_provider=${settings.provider};path=/;max-age=31536000;SameSite=Lax`;
    document.cookie = `llm_api_key=${encodeURIComponent(settings.apiKey)};path=/;max-age=31536000;SameSite=Lax`;
  }

  function handleCreated(nq: { id: string } & Record<string, unknown>) {
    const answerToIndex: Record<string, number> = {
      A: 0,
      B: 1,
      C: 2,
      D: 3,
    };
    const raw = nq as unknown as {
      id: string;
      title: string;
      roomCode: string;
      status: "waiting" | "active" | "finished";
      currentQ: number;
      questions: Array<{
        id: string;
        question: string;
        optionA: string;
        optionB: string;
        optionC: string;
        optionD: string;
        answer: string;
        timeLimit: number;
      }>;
    };
    const normalized: QuizData = {
      id: raw.id,
      title: raw.title,
      roomCode: raw.roomCode,
      status: raw.status,
      currentQuestionIndex: raw.currentQ,
      questions: raw.questions.map((qn) => ({
        id: qn.id,
        text: qn.question,
        options: [qn.optionA, qn.optionB, qn.optionC, qn.optionD],
        correctIndex: answerToIndex[qn.answer] ?? 0,
        timeLimit: qn.timeLimit,
      })),
      players: [],
    };
    setQuizzes([normalized]);
  }

  function openEditor() {
    if (!quiz) return;
    setEditing(
      quiz.questions.map((q) => ({
        question: q.text,
        optionA: q.options[0] ?? "",
        optionB: q.options[1] ?? "",
        optionC: q.options[2] ?? "",
        optionD: q.options[3] ?? "",
        answer: ["A", "B", "C", "D"][q.correctIndex] ?? "A",
      })),
    );
  }

  async function saveEdits(edited: QuizDraftQuestion[]) {
    if (!quiz) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/questions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questions: edited }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as {
        quiz: { id: string } & Record<string, unknown>;
        snapshot?: QuizRealtimeSnapshot | null;
      };
      handleCreated(payload.quiz);
      if (payload.snapshot) applySnapshot(payload.snapshot);
      setEditing(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSavingEdit(false);
    }
  }

  async function action(nextAction: "start" | "next" | "finish") {
    if (!quiz) return;
    try {
      const res = await fetch(`/api/quiz/${quiz.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: nextAction }),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        snapshot?: QuizRealtimeSnapshot | null;
      };
      if (payload.snapshot) applySnapshot(payload.snapshot);
    } catch (error) {
      console.error(error);
    }
  }

  if (!quiz) {
    return (
      <div className="board-canvas-wrap">
        <div className="quiz-board">
          <div className="quiz-empty">
            <div className="quiz-empty-icon">📄</div>
            <div className="quiz-empty-title">아직 만들어진 퀴즈가 없습니다</div>
            <div className="quiz-actions">
              <button
                type="button"
                className="quiz-btn quiz-btn-secondary"
                onClick={() => setShowLLM(true)}
              >
                LLM 설정
              </button>
              <button
                type="button"
                className="quiz-btn quiz-btn-primary"
                onClick={() => setShowGenerate(true)}
                disabled={!llm.apiKey}
              >
                + 퀴즈 만들기
              </button>
            </div>
            {!llm.apiKey && (
              <div className="quiz-empty-hint">
                먼저 LLM 설정에서 API 키를 저장하세요.
              </div>
            )}
          </div>
          {showLLM && (
            <LLMModal
              settings={llm}
              onSave={(settings) => {
                saveLLM(settings);
                setShowLLM(false);
              }}
              onClose={() => setShowLLM(false)}
            />
          )}
          {showGenerate && (
            <QuizGenerateModal
              boardId={boardId}
              onClose={() => setShowGenerate(false)}
              onCreated={handleCreated}
            />
          )}
        </div>
      </div>
    );
  }

  const curQ = quiz.questions[quiz.currentQuestionIndex] ?? null;
  const isActive = quiz.status === "active";
  const isFinished = quiz.status === "finished";

  return (
    <div className="board-canvas-wrap">
      <div className="quiz-board">
        <div className="quiz-room-code">
          <span className="quiz-room-code-label">참가 코드</span>
          <span
            className="quiz-room-code-value"
            onClick={() => {
              navigator.clipboard.writeText(quiz.roomCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {quiz.roomCode}
          </span>
          <span className="quiz-room-code-copied">
            {copied ? "복사됨!" : ""}
          </span>
          <QuizUrl roomCode={quiz.roomCode} />
          <div className="quiz-qr-area">QR Code</div>
        </div>

        <div className="quiz-info-card">
          <div className="quiz-info-title">{quiz.title || "퀴즈"}</div>
          <div className="quiz-info-meta">
            <span>문제 {quiz.questions.length}개</span>
            <span>
              {realtimeReady
                ? `현재 접속 ${onlineCount}명`
                : `참가 등록 ${quiz.players.length}명`}
            </span>
            <span className={`quiz-status-badge quiz-status-${quiz.status}`}>
              {isActive ? "진행 중" : isFinished ? "종료됨" : "대기 중"}
            </span>
          </div>
        </div>

        <div className="quiz-actions">
          {quiz.status === "waiting" && (
            <>
              <button
                type="button"
                className="quiz-btn quiz-btn-success"
                onClick={() => action("start")}
              >
                시작
              </button>
              <button
                type="button"
                className="quiz-btn quiz-btn-secondary"
                onClick={openEditor}
              >
                편집
              </button>
            </>
          )}
          {isActive && curQ && (
            <>
              <button
                type="button"
                className="quiz-btn quiz-btn-primary"
                onClick={() => action("next")}
              >
                다음 문제
              </button>
              <button
                type="button"
                className="quiz-btn quiz-btn-danger"
                onClick={() => action("finish")}
              >
                종료
              </button>
            </>
          )}
          {isFinished && (
            <button
              type="button"
              className="quiz-btn quiz-btn-primary"
              onClick={() => setShowReport(true)}
            >
              리포트 보기
            </button>
          )}
        </div>

        {isActive && curQ && (
          <div className="quiz-question">
            <div className="quiz-question-number">
              문제 {quiz.currentQuestionIndex + 1} / {quiz.questions.length}
            </div>
            <div className="quiz-question-text">{curQ.text}</div>
            <Distribution dist={dist} correctIndex={curQ.correctIndex} />
          </div>
        )}

        <PlayerList players={sorted} />

        {isFinished && <Leaderboard players={sorted} />}

        {showReport && (
          <QuizReportModal
            quizId={quiz.id}
            onClose={() => setShowReport(false)}
          />
        )}
        {editing && (
          <>
            <div
              className="modal-backdrop"
              onClick={() => !savingEdit && setEditing(null)}
            />
            <div
              className="quiz-modal"
              role="dialog"
              aria-modal="true"
              aria-label="퀴즈 편집"
            >
              <div className="quiz-modal-header">
                <h2 className="quiz-modal-title">퀴즈 편집</h2>
                <button
                  type="button"
                  className="quiz-modal-close"
                  onClick={() => !savingEdit && setEditing(null)}
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div className="quiz-modal-body">
                <QuizDraftEditor
                  questions={editing}
                  onChange={setEditing}
                  onBack={() => setEditing(null)}
                  onSave={saveEdits}
                  saving={savingEdit}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const Distribution = memo(function Distribution({
  dist,
  correctIndex,
}: {
  dist: Record<string, number>;
  correctIndex: number;
}) {
  const total = useMemo(
    () => Object.values(dist).reduce((sum, value) => sum + value, 0) || 1,
    [dist],
  );
  return (
    <div className="quiz-distribution">
      {OPT_LABELS.map((label, index) => {
        const count = dist[label] ?? 0;
        return (
          <div key={label} className="quiz-dist-row">
            <div
              className="quiz-dist-label"
              style={{ background: OPT_COLORS[index] }}
            >
              {label}
            </div>
            <div className="quiz-dist-bar-wrap">
              <div
                className={`quiz-dist-bar ${index === correctIndex ? "correct" : ""}`}
                style={{
                  width: `${(count / total) * 100}%`,
                  background: OPT_COLORS[index],
                }}
              />
            </div>
            <span className="quiz-dist-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
});

const PlayerList = memo(function PlayerList({
  players,
}: {
  players: { id: string; nickname: string; score: number }[];
}) {
  return (
    <div className="quiz-player-list">
      <div className="quiz-player-list-header">
        <span>참가자</span>
        <span className="quiz-player-count">{players.length}명</span>
      </div>
      <div className="quiz-player-grid">
        {players.map((player) => (
          <div key={player.id} className="quiz-player-chip">
            <span>{player.nickname}</span>
            <span className="quiz-player-score">{player.score}점</span>
          </div>
        ))}
        {players.length === 0 && (
          <span style={{ color: "var(--color-text-faint)", fontSize: 13 }}>
            아직 참가자가 없습니다
          </span>
        )}
      </div>
    </div>
  );
});

function Leaderboard({
  players,
}: {
  players: { id: string; nickname: string; score: number }[];
}) {
  const top = players.slice(0, 3);
  return (
    <div className="quiz-leaderboard">
      <div className="quiz-leaderboard-title">최종 순위</div>
      {top.length >= 2 && (
        <div className="quiz-podium">
          <div className="quiz-podium-slot">
            <div className="quiz-podium-name">{top[1]?.nickname}</div>
            <div className="quiz-podium-bar quiz-podium-bar-2">2</div>
            <div className="quiz-podium-score">{top[1]?.score}점</div>
          </div>
          <div className="quiz-podium-slot">
            <div className="quiz-podium-name">{top[0]?.nickname}</div>
            <div className="quiz-podium-bar quiz-podium-bar-1">1</div>
            <div className="quiz-podium-score">{top[0]?.score}점</div>
          </div>
          {top[2] && (
            <div className="quiz-podium-slot">
              <div className="quiz-podium-name">{top[2].nickname}</div>
              <div className="quiz-podium-bar quiz-podium-bar-3">3</div>
              <div className="quiz-podium-score">{top[2].score}점</div>
            </div>
          )}
        </div>
      )}
      <div className="quiz-leaderboard-list">
        {players.map((player, index) => (
          <div key={player.id} className="quiz-leaderboard-row">
            <span className="quiz-leaderboard-rank">
              {index === 0
                ? "🥇"
                : index === 1
                  ? "🥈"
                  : index === 2
                    ? "🥉"
                    : `${index + 1}`}
            </span>
            <span className="quiz-leaderboard-name">{player.nickname}</span>
            <span className="quiz-leaderboard-score">{player.score}점</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LLMModal({
  settings,
  onSave,
  onClose,
}: {
  settings: LLMSettings;
  onSave: (settings: LLMSettings) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal llm-settings-modal">
        <div className="modal-header">
          <h2 className="modal-title">LLM 설정</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="llm-settings-field">
            <label className="llm-settings-label">AI 제공자</label>
            <select
              className="modal-select"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as LLMSettings["provider"])
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div className="llm-settings-field">
            <label className="llm-settings-label">API Key</label>
            <input
              className="modal-input"
              type="password"
              placeholder={
                provider === "openai"
                  ? "sk-..."
                  : provider === "anthropic"
                    ? "sk-ant-..."
                    : "AIza..."
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="button"
              className="modal-btn-submit"
              disabled={!apiKey.trim()}
              onClick={() => onSave({ provider, apiKey })}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function QuizUrl({ roomCode }: { roomCode: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(`${window.location.origin}/quiz/${roomCode}`);
  }, [roomCode]);
  return <span className="quiz-room-code-url">{url}</span>;
}
