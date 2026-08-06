"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AI_FEATURE_DEFINITIONS,
  AI_MODEL_CATALOG,
  AI_PROVIDERS,
  DEFAULT_FEATURE_MODELS,
  modelsForProvider,
  type AiFeatureKey,
  type AiModelCatalogItem,
  type AiProvider,
} from "@/lib/ai/model-catalog";

type ProviderMeta = {
  id: AiProvider;
  label: string;
  description: string;
  keyPlaceholder: string;
  billingLabel: string;
  billingUrl: string;
};

const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT 계열 API",
    keyPlaceholder: "sk-...",
    billingLabel: "OpenAI Platform",
    billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
  },
  {
    id: "gemini",
    label: "Google",
    description: "Gemini · Gemma 계열 API",
    keyPlaceholder: "AIza...",
    billingLabel: "Google AI Studio",
    billingUrl: "https://aistudio.google.com/usage",
  },
  {
    id: "opencode-go",
    label: "OpenCode-go",
    description: "Go 구독의 코딩 모델 API",
    keyPlaceholder: "oc-...",
    billingLabel: "OpenCode Console",
    billingUrl: "https://opencode.ai/zen",
  },
] as const;

type KeyStatus = {
  provider: AiProvider;
  last4: string;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

type FeatureConfig = {
  feature: AiFeatureKey;
  provider: AiProvider;
  modelId: string;
};

type SettingsPayload = {
  keys: KeyStatus[];
  configs: FeatureConfig[];
  catalog?: AiModelCatalogItem[];
};

function providerLabel(provider: AiProvider): string {
  return PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultModel(provider: AiProvider, feature: AiFeatureKey): string {
  const recommended = AI_MODEL_CATALOG.find(
    (model) =>
      model.provider === provider && model.recommendedFor?.includes(feature),
  );
  return recommended?.id ?? modelsForProvider(provider)[0]?.id ?? "";
}

export function LlmKeyForm() {
  const [activeProvider, setActiveProvider] = useState<AiProvider>("gemini");
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [configs, setConfigs] = useState<FeatureConfig[]>(
    AI_FEATURE_DEFINITIONS.map(({ key }) => ({
      feature: key,
      ...DEFAULT_FEATURE_MODELS[key],
    })),
  );
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [providerBusy, setProviderBusy] = useState<AiProvider | null>(null);
  const [featureBusy, setFeatureBusy] = useState<AiFeatureKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMeta = PROVIDERS.find((item) => item.id === activeProvider)!;
  const activeKey = keys.find((key) => key.provider === activeProvider) ?? null;
  const keyByProvider = useMemo(
    () => new Map(keys.map((key) => [key.provider, key])),
    [keys],
  );

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/teacher/ai-settings", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as
        | SettingsPayload
        | { error?: string };
      if (!response.ok || !("configs" in body)) {
        throw new Error("error" in body && body.error ? body.error : "AI 설정을 불러오지 못했습니다.");
      }
      setKeys(body.keys);
      setConfigs(body.configs);
      const firstConnected = AI_PROVIDERS.find((provider) =>
        body.keys.some((key) => key.provider === provider),
      );
      if (firstConnected) setActiveProvider(firstConnected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveProviderKey(event: React.FormEvent) {
    event.preventDefault();
    if (providerBusy) return;
    setProviderBusy(activeProvider);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/teacher/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: activeProvider, apiKey: apiKey.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        keys?: KeyStatus[];
        key?: KeyStatus;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !body.keys) {
        throw new Error(body.detail ?? body.error ?? "API 키를 저장하지 못했습니다.");
      }
      setKeys(body.keys);
      setApiKey("");
      setMessage(
        body.key?.verified
          ? `${activeMeta.label} 연결을 확인했습니다.`
          : `${activeMeta.label} 키는 저장했지만 연결 검증에 실패했습니다.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "API 키를 저장하지 못했습니다.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function deleteProviderKey() {
    if (!activeKey || providerBusy) return;
    if (!window.confirm(`${activeMeta.label} API 연결을 해제할까요?`)) return;
    setProviderBusy(activeProvider);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/teacher/llm-key?provider=${encodeURIComponent(activeProvider)}`,
        { method: "DELETE", cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        keys?: KeyStatus[];
        error?: string;
      };
      if (!response.ok || !body.keys) {
        throw new Error(body.error ?? "API 연결을 해제하지 못했습니다.");
      }
      setKeys(body.keys);
      setMessage(`${activeMeta.label} 연결을 해제했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "API 연결을 해제하지 못했습니다.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function saveFeatureConfig(
    feature: AiFeatureKey,
    provider: AiProvider,
    modelId: string,
  ) {
    if (featureBusy) return;
    setFeatureBusy(feature);
    setMessage(null);
    setError(null);
    const previous = configs;
    setConfigs((current) =>
      current.map((config) =>
        config.feature === feature ? { feature, provider, modelId } : config,
      ),
    );
    try {
      const response = await fetch("/api/teacher/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, provider, modelId }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | SettingsPayload
        | { error?: string };
      if (!response.ok || !("configs" in body)) {
        throw new Error("error" in body && body.error ? body.error : "모델 설정을 저장하지 못했습니다.");
      }
      setConfigs(body.configs);
      const definition = AI_FEATURE_DEFINITIONS.find((item) => item.key === feature);
      const model = AI_MODEL_CATALOG.find(
        (item) => item.provider === provider && item.id === modelId,
      );
      setMessage(`${definition?.label ?? feature}: ${model?.label ?? modelId} 저장 완료`);
    } catch (cause) {
      setConfigs(previous);
      setError(cause instanceof Error ? cause.message : "모델 설정을 저장하지 못했습니다.");
    } finally {
      setFeatureBusy(null);
    }
  }

  function changeFeatureProvider(feature: AiFeatureKey, provider: AiProvider) {
    void saveFeatureConfig(feature, provider, defaultModel(provider, feature));
  }

  const connectedCount = keys.filter((key) => key.verified).length;

  return (
    <div className="ai-settings-stack" aria-busy={loading}>
      <section className="ai-settings-group" aria-labelledby="ai-provider-heading">
        <div className="ai-settings-group-head">
          <div>
            <h3 id="ai-provider-heading">API 연결</h3>
            <p>공급자별 키를 각각 저장해 여러 모델을 동시에 사용할 수 있습니다.</p>
          </div>
          <span className="ai-settings-count">
            {connectedCount}/{AI_PROVIDERS.length} 연결
          </span>
        </div>

        <div className="ai-provider-tabs" role="tablist" aria-label="AI 공급자">
          {PROVIDERS.map((provider) => {
            const status = keyByProvider.get(provider.id);
            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={activeProvider === provider.id}
                className={`ai-provider-tab ${activeProvider === provider.id ? "is-active" : ""}`}
                onClick={() => {
                  setActiveProvider(provider.id);
                  setApiKey("");
                  setMessage(null);
                  setError(null);
                }}
              >
                <span>{provider.label}</span>
                <span
                  className={`ai-provider-state ${status?.verified ? "is-on" : status ? "is-warn" : ""}`}
                >
                  {status?.verified ? "연결됨" : status ? "확인 필요" : "미연결"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ai-provider-panel" role="tabpanel">
          <div className="ai-provider-panel-head">
            <div>
              <strong>{activeMeta.label}</strong>
              <span>{activeMeta.description}</span>
            </div>
            {activeKey ? (
              <div className={`ai-provider-current ${activeKey.verified ? "is-ok" : "is-warn"}`}>
                <span>{activeKey.verified ? "검증 완료" : "검증 실패"}</span>
                <code>•••• {activeKey.last4}</code>
                <small>{formatDate(activeKey.verifiedAt ?? activeKey.updatedAt)}</small>
              </div>
            ) : null}
          </div>

          <form className="ai-provider-key-form" onSubmit={saveProviderKey}>
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={activeKey ? "새 키로 교체할 때만 입력" : activeMeta.keyPlaceholder}
                disabled={providerBusy !== null}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              className="settings-action-btn is-primary"
              disabled={providerBusy !== null || !apiKey.trim()}
            >
              {providerBusy === activeProvider
                ? "확인 중…"
                : activeKey
                  ? "새 키로 교체"
                  : "저장 + 검증"}
            </button>
            {activeKey ? (
              <button
                type="button"
                className="settings-action-btn is-danger"
                onClick={deleteProviderKey}
                disabled={providerBusy !== null}
              >
                연결 해제
              </button>
            ) : null}
          </form>
          {activeKey?.lastError ? (
            <p className="ai-settings-inline-error" role="alert">
              {activeKey.lastError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="ai-settings-group" aria-labelledby="ai-feature-heading">
        <div className="ai-settings-group-head">
          <div>
            <h3 id="ai-feature-heading">영역별 모델</h3>
            <p>기능의 성격과 비용에 맞게 공급자와 모델을 따로 선택합니다.</p>
          </div>
        </div>

        <div className="ai-feature-model-list">
          {AI_FEATURE_DEFINITIONS.map((definition) => {
            const config =
              configs.find((item) => item.feature === definition.key) ?? {
                feature: definition.key,
                ...DEFAULT_FEATURE_MODELS[definition.key],
              };
            const providerModels = modelsForProvider(config.provider);
            const model = providerModels.find((item) => item.id === config.modelId);
            const providerKey = keyByProvider.get(config.provider);
            return (
              <div className="ai-feature-model-row" key={definition.key}>
                <div className="ai-feature-model-copy">
                  <strong>{definition.label}</strong>
                  <span>{definition.description}</span>
                </div>
                <label className="ai-feature-select">
                  <span>공급자</span>
                  <select
                    aria-label={`${definition.label} 공급자`}
                    value={config.provider}
                    onChange={(event) =>
                      changeFeatureProvider(
                        definition.key,
                        event.target.value as AiProvider,
                      )
                    }
                    disabled={featureBusy !== null}
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ai-feature-select ai-feature-model-select">
                  <span>모델</span>
                  <select
                    aria-label={`${definition.label} 모델`}
                    value={config.modelId}
                    onChange={(event) =>
                      void saveFeatureConfig(
                        definition.key,
                        config.provider,
                        event.target.value,
                      )
                    }
                    disabled={featureBusy !== null}
                  >
                    {providerModels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <small>{model?.description}</small>
                </label>
                <div
                  className={`ai-feature-key-state ${providerKey?.verified ? "is-ok" : "is-warn"}`}
                >
                  {featureBusy === definition.key
                    ? "저장 중…"
                    : providerKey?.verified
                      ? `${providerLabel(config.provider)} 연결됨`
                      : `${providerLabel(config.provider)} 키 필요`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ai-settings-group" aria-labelledby="ai-usage-heading">
        <div className="ai-settings-group-head">
          <div>
            <h3 id="ai-usage-heading">Usage</h3>
            <p>아우라보드에서 발생한 요청과 토큰 사용량을 기능별로 집계합니다.</p>
          </div>
        </div>
        <div className="ai-metric-grid">
          <div><span>오늘 요청</span><strong>—</strong><small>집계 연결 예정</small></div>
          <div><span>이번 달 토큰</span><strong>—</strong><small>입력 + 출력</small></div>
          <div><span>최근 상태</span><strong>{connectedCount > 0 ? "연결됨" : "미연결"}</strong><small>{connectedCount}개 공급자 사용 가능</small></div>
        </div>
      </section>

      <section className="ai-settings-group" aria-labelledby="ai-billing-heading">
        <div className="ai-settings-group-head">
          <div>
            <h3 id="ai-billing-heading">Billing</h3>
            <p>청구와 실제 잔여 할당량은 각 공급자 콘솔에서 관리합니다.</p>
          </div>
        </div>
        <div className="ai-billing-provider-list">
          {PROVIDERS.map((provider) => {
            const status = keyByProvider.get(provider.id);
            const featureCount = configs.filter(
              (config) => config.provider === provider.id,
            ).length;
            return (
              <div className="ai-billing-provider-row" key={provider.id}>
                <div>
                  <strong>{provider.label}</strong>
                  <span>
                    {status?.verified ? "연결됨" : "미연결"} · {featureCount}개 영역 사용
                  </span>
                </div>
                <a
                  className="settings-action-btn"
                  href={provider.billingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {provider.billingLabel}
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {message ? <p className="ai-settings-message" role="status">{message}</p> : null}
      {error ? <p className="ai-settings-error" role="alert">{error}</p> : null}
    </div>
  );
}
