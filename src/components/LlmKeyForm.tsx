"use client";

// Teacher LLM API Key 입력 폼 (/teacher/settings#llm 마운트).
// 붙여넣기 → 저장 → 서버가 즉시 각 사 API에 테스트 호출로 검증.
// 성공 시 "연결됨 ✓ sk-...xxxx" 배지, 실패 시 에러 메시지.
// Ollama 는 로컬 테스트용 — baseUrl + modelId 필드가 추가로 필요하다.
// OpenCode-go는 OpenAI 호환 API 키 + 모델 선택.
// 2026-05-17: opencode-go 추가 (로컬 CLI 아님, API 키 방식)

import { useEffect, useState } from "react";

type Provider = "claude" | "openai" | "gemini" | "ollama" | "opencode-go";

// opencode-go에서 사용할 수 있는 주요 모델 목록
const OPENCODE_MODELS = [
  { id: "opencode/deepseek-v4-flash-free", label: "DeepSeek Flash (무료)" },
  { id: "opencode/kimi-k2.6", label: "Kimi K2.6" },
  { id: "opencode/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "opencode/gpt-5.5-pro", label: "GPT 5.5 Pro" },
  { id: "opencode/gemini-3-flash", label: "Gemini 3 Flash" },
  { id: "opencode/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "opencode/qwen3.6-plus-free", label: "Qwen 3.6 Plus (무료)" },
  { id: "opencode/minimax-m2.5-free", label: "MiniMax M2.5 (무료)" },
];

type KeyStatus =
  | { present: false }
  | {
      present: true;
      provider: Provider;
      last4: string;
      baseUrl: string | null;
      modelId: string | null;
      verified: boolean;
      verifiedAt: string | null;
      lastError: string | null;
      updatedAt: string;
    };

const PROVIDER_LABEL: Record<Provider, string> = {
  claude: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
  ollama: "🧪 Ollama (로컬 테스트)",
  "opencode-go": "OpenCode-go",
};

const OLLAMA_DEFAULT_URL = "http://localhost:11434/v1";
const OLLAMA_DEFAULT_MODEL = "qwen2.5-coder:32b";
const OPENCODE_DEFAULT_MODEL = "opencode/deepseek-v4-flash-free";

export function LlmKeyForm() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [provider, setProvider] = useState<Provider>("claude");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_DEFAULT_URL);
  const [modelId, setModelId] = useState(OLLAMA_DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch("/api/teacher/llm-key", { cache: "no-store" });
      if (!res.ok) {
        setStatus({ present: false });
        return;
      }
      const data = (await res.json()) as KeyStatus;
      setStatus(data);
      if (data.present) {
        setProvider(data.provider);
        if (data.provider === "ollama") {
          setBaseUrl(data.baseUrl ?? OLLAMA_DEFAULT_URL);
          setModelId(data.modelId ?? OLLAMA_DEFAULT_MODEL);
        }
        if (data.provider === "opencode-go") {
          setModelId(data.modelId ?? OPENCODE_DEFAULT_MODEL);
        }
      }
    } catch {
      setStatus({ present: false });
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { provider, apiKey: apiKey.trim() };
      if (provider === "ollama") {
        body.baseUrl = baseUrl.trim();
        body.modelId = modelId.trim();
      }
      if (provider === "opencode-go") {
        body.modelId = modelId.trim();
      }
      const res = await fetch("/api/teacher/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`저장 실패: ${data.error ?? res.statusText}`);
      } else if (data.verified) {
        setMsg(
          provider === "ollama"
            ? "저장 완료. Ollama 엔드포인트 응답 확인됐습니다."
            : provider === "opencode-go"
              ? `저장 완료. OpenCode-go · ${modelId} 연결됐습니다.`
              : "저장 완료. 코딩 교실 보드에서 바로 사용할 수 있습니다.",
        );
        setApiKey("");
      } else {
        setMsg(
          `저장은 되었지만 검증 실패: ${data.lastError ?? "알 수 없는 오류"}. ${
            provider === "ollama"
              ? "Ollama 가 실행 중인지 / 모델이 설치됐는지 확인하세요."
              : "Key/결제 상태 확인 후 다시 저장하세요."
          }`,
        );
        setApiKey("");
      }
      setStatus(data);
    } catch (err) {
      setMsg(`저장 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("저장된 API Key를 삭제하시겠어요? 코딩 교실는 새 Key를 저장하기 전까지 사용할 수 없어요.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/teacher/llm-key", { method: "DELETE" });
      if (res.ok) {
        setStatus({ present: false });
        setMsg("삭제되었습니다.");
      } else {
        setMsg("삭제 실패");
      }
    } finally {
      setBusy(false);
    }
  }

  const keyPlaceholder =
    provider === "claude"
      ? "sk-ant-api03-..."
      : provider === "openai"
        ? "sk-proj-... 또는 sk-..."
        : provider === "gemini"
          ? "AIza..."
          : provider === "opencode-go"
            ? "oc-..."
            : "(선택) reverse-proxy 보호용 토큰";

  const submitDisabled =
    busy ||
    (provider === "ollama"
      ? baseUrl.trim().length < 7 || modelId.trim().length < 1
      : provider === "opencode-go"
        ? apiKey.trim().length < 4 || modelId.trim().length < 1
        : apiKey.trim().length < 8);

  return (
    <div className="llm-key-form">
      {status?.present && (
        <div className={`llm-key-status ${status.verified ? "is-ok" : "is-warn"}`}>
          <div className="llm-key-status-row">
            <span className="llm-key-status-dot" aria-hidden>
              {status.verified ? "●" : "▲"}
            </span>
            <span className="llm-key-status-text">
              {status.verified ? "연결됨" : "검증 실패"} ·{" "}
              {PROVIDER_LABEL[status.provider] ?? status.provider} ·{" "}
              {status.provider === "ollama"
                ? `${status.modelId ?? "?"} @ ${status.baseUrl ?? "?"}`
                : status.provider === "opencode-go"
                  ? `${status.modelId ?? "?"} · ...${status.last4}`
                  : `...${status.last4}`}
            </span>
            <button
              type="button"
              className="llm-key-delete"
              onClick={handleDelete}
              disabled={busy}
            >
              삭제
            </button>
          </div>
          {!status.verified && status.lastError && (
            <p className="llm-key-error">{status.lastError}</p>
          )}
          {status.verified && status.verifiedAt && (
            <p className="llm-key-hint-small">
              마지막 검증 {new Date(status.verifiedAt).toLocaleString("ko-KR")}
            </p>
          )}
        </div>
      )}

      <form className="llm-key-fields" onSubmit={handleSave}>
        <label className="llm-key-field">
          <span>사용할 AI</span>
          <select
            className="llm-key-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            disabled={busy}
          >
            <option value="claude">Claude (Anthropic) — 추천</option>
            <option value="openai">ChatGPT (OpenAI)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="ollama">🧪 Ollama (로컬 테스트 — 개발자 전용)</option>
            <option value="opencode-go">OpenCode-go</option>
          </select>
        </label>

        {provider === "ollama" && (
          <>
            <label className="llm-key-field">
              <span>Base URL</span>
              <input
                type="url"
                className="llm-key-input"
                placeholder={OLLAMA_DEFAULT_URL}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={busy}
                spellCheck={false}
              />
              <span className="llm-key-hint">
                로컬 Ollama: <code>http://localhost:11434/v1</code> · 외부 접속은
                ngrok/Cloudflare Tunnel URL
              </span>
            </label>
            <label className="llm-key-field">
              <span>Model ID</span>
              <input
                type="text"
                className="llm-key-input"
                placeholder={OLLAMA_DEFAULT_MODEL}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={busy}
                spellCheck={false}
              />
              <span className="llm-key-hint">
                <code>ollama pull qwen2.5-coder:32b</code> 등으로 먼저 모델을
                내려받아야 해요.
              </span>
            </label>
          </>
        )}

        {provider === "opencode-go" && (
          <label className="llm-key-field">
            <span>모델 선택</span>
            <select
              className="llm-key-select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={busy}
            >
              {OPENCODE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="llm-key-hint">
              OpenCode-go API로 호출할 모델을 선택하세요.
            </span>
          </label>
        )}

        <label className="llm-key-field">
          <span>API Key{provider === "ollama" && " (선택)"}</span>
          <input
            type="password"
            className="llm-key-input"
            placeholder={keyPlaceholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="llm-key-hint">
            {provider === "ollama"
              ? "로컬 Ollama는 Key가 필요 없습니다. reverse-proxy로 외부 노출 시만 입력."
              : provider === "opencode-go"
                ? "OpenCode-go API 키를 입력하세요. 키는 암호화 저장됩니다."
                : "Key는 서버에서 암호화 저장되며 학생 클라이언트에 노출되지 않습니다."}
          </span>
        </label>

        <button
          type="submit"
          className="llm-key-submit"
          disabled={submitDisabled}
        >
          {busy ? "저장 중…" : status?.present ? "다시 저장" : "저장 + 검증"}
        </button>
      </form>

      {msg && <p className="llm-key-msg">{msg}</p>}
    </div>
  );
}
