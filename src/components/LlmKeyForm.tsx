"use client";

// Teacher LLM API Key ?? ? (/teacher/settings#llm ???).
// ???? ? ?? ? ??? ?? ? ? API? ??? ??? ??.
// v1: Gemini / OpenCode-go ? ??.
// 2026-07-08: claude/openai/ollama ?? ?? ? ? ???? ??.

import { useEffect, useState } from "react";

type Provider = "gemini" | "opencode-go";

// opencode-go?? ??? ? ?? ?? ?? ??
const OPENCODE_MODELS = [
  { id: "deepseek-v4-flash", label: "DeepSeek Flash" },
  { id: "kimi-k2.6", label: "Kimi K2.6" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "gpt-5.5-pro", label: "GPT 5.5 Pro" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "qwen3.6-plus", label: "Qwen 3.6 Plus" },
  { id: "minimax-m2.5", label: "MiniMax M2.5" },
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
  gemini: "Gemini (Google)",
  "opencode-go": "OpenCode-go",
};

const OPENCODE_DEFAULT_MODEL = "deepseek-v4-flash";

export function LlmKeyForm() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [provider, setProvider] = useState<Provider>("opencode-go");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(OPENCODE_DEFAULT_MODEL);
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

  // OpenCode-go? ???? ?? ??? ??
  useEffect(() => {
    if (provider === "opencode-go") {
      setModelId(OPENCODE_DEFAULT_MODEL);
    }
  }, [provider]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { provider };
      // API ?? ??? ???? ?? (??? ?? ? ??)
      if (apiKey.trim()) {
        body.apiKey = apiKey.trim();
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
          provider === "opencode-go"
            ? `저장 완료. OpenCode-go · ${modelId} 연결되었습니다.`
            : "저장 완료. 코딩 교실 보드에서 바로 사용할 수 있습니다.",
        );
        setApiKey("");
      } else {
        setMsg(
          `저장은 되었지만 검증 실패: ${data.lastError ?? "의 수 없는 오류"}. Key/결제 상태 확인 후 다시 저장하세요.`,
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
    if (!confirm("저장된 API Key를 삭제하시겠어요? 코딩 교실은 새 Key를 저장하기 전까지 사용할 수 없어요.")) return;
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

  const keyPlaceholder = provider === "gemini" ? "AIza..." : "oc-...";

  const submitDisabled =
    busy ||
    (provider === "opencode-go"
      ? modelId.trim().length < 1 || (apiKey.trim().length < 4 && !status?.present)
      : apiKey.trim().length < 8 && !status?.present);

  return (
    <>
      <form className="llm-key-fields" onSubmit={handleSave}>
        <label className="llm-key-field">
          <span>사용할 AI</span>
          <select
            className="llm-key-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            disabled={busy}
          >
            <option value="gemini">Gemini (Google)</option>
            <option value="opencode-go">OpenCode-go</option>
          </select>
        </label>

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
          <span>API Key</span>
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
            {provider === "opencode-go"
              ? "OpenCode-go API 키를 입력하세요. 키는 암호화 저장되습니다."
              : "Key는 서버에서 암호화 저장되고 학생 클라이언트에는 노출되지 않습니다."}
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
    </>
  );
}
