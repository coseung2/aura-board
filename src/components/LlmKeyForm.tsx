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
  const [modalProvider, setModalProvider] = useState<AiProvider | null>(null);
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
  const [modalError, setModalError] = useState<string | null>(null);

  const keyByProvider = useMemo(
    () => new Map(keys.map((key) => [key.provider, key])),
    [keys],
  );
  const connectedProviders = useMemo(
    () => PROVIDERS.filter((provider) => keyByProvider.has(provider.id)),
    [keyByProvider],
  );
  const availableProviders = useMemo(
    () => PROVIDERS.filter((provider) => !keyByProvider.has(provider.id)),
    [keyByProvider],
  );
  const modalMeta = modalProvider
    ? PROVIDERS.find((item) => item.id === modalProvider) ?? null
    : null;
  const modalKey = modalProvider ? keyByProvider.get(modalProvider) ?? null : null;
  const connectedCount = keys.filter((key) => key.verified).length;

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function openConnectModal(provider: AiProvider = availableProviders[0]?.id ?? "gemini") {
    setModalProvider(provider);
    setApiKey("");
    setModalError(null);
  }

  function openManageModal(provider: AiProvider) {
    setModalProvider(provider);
    setApiKey("");
    setModalError(null);
  }

  function closeModal() {
    if (providerBusy) return;
    setModalProvider(null);
    setApiKey("");
    setModalError(null);
  }

  async function saveProviderKey(event: React.FormEvent) {
    event.preventDefault();
    if (!modalProvider || !modalMeta || providerBusy) return;
    setProviderBusy(modalProvider);
    setMessage(null);
    setModalError(null);
    try {
      const response = await fetch("/api/teacher/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: modalProvider, apiKey: apiKey.trim() }),
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
          ? `${modalMeta.label} 연결을 확인했습니다.`
          : `${modalMeta.label} 키는 저장했지만 연결 검증에 실패했습니다.`,
      );
      if (body.key?.verified) {
        setModalProvider(null);
      }
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : "API 키를 저장하지 못했습니다.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function deleteProviderKey() {
    if (!modalProvider || !modalMeta || !modalKey || providerBusy) return;
    if (!window.confirm(`${modalMeta.label} API 연결을 해제할까요?`)) return;
    setProviderBusy(modalProvider);
    setMessage(null);
    setModalError(null);
    try {
      const response = await fetch(
        `/api/teacher/llm-key?provider=${encodeURIComponent(modalProvider)}`,
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
      setMessage(`${modalMeta.label} 연결을 해제했습니다.`);
      setModalProvider(null);
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : "API 연결을 해제하지 못했습니다.");
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

  return (
    <div className="ai-settings-stack" aria-busy={loading}>
      <section className="ai-settings-group" aria-labelledby="ai-provider-heading">
        <div className="ai-settings-group-head ai-provider-table-head">
          <div>
            <h3 id="ai-provider-heading">API 연결</h3>
          </div>
          <div className="ai-provider-table-labels" aria-hidden="true">
            <span>연결</span>
            <span>청구</span>
          </div>
        </div>

        <div className="ai-settings-group-body">
          <div className="ai-provider-table" role="table" aria-label="공급자 연결 및 청구">
            {PROVIDERS.map((provider) => {
              const status = keyByProvider.get(provider.id);
              const connected = Boolean(status);
              const verified = Boolean(status?.verified);
              return (
                <div className="ai-provider-table-row" role="row" key={provider.id}>
                  <div className="ai-provider-table-provider" role="cell">
                    <strong>{provider.label}</strong>
                    <span>{provider.description}</span>
                  </div>
                  <div className="ai-provider-table-connection" role="cell">
                    {connected ? (
                      <button
                        type="button"
                        className="ai-provider-connection-btn"
                        onClick={() => openManageModal(provider.id)}
                        aria-label={`${provider.label} ${verified ? "연결됨" : "확인 필요"}`}
                      >
                        <span
                          className={`ai-provider-status-dot ${verified ? "is-on" : "is-warn"}`}
                          aria-hidden="true"
                        />
                        <code>•••• {status?.last4}</code>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-action-btn"
                        onClick={() => openConnectModal(provider.id)}
                      >
                        연결
                      </button>
                    )}
                  </div>
                  <div className="ai-provider-table-billing" role="cell">
                    <a
                      className="settings-action-btn"
                      href={provider.billingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {provider.billingLabel}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

<section className="ai-settings-group" aria-labelledby="ai-feature-heading">
        <div className="ai-settings-group-head ai-feature-group-head">
          <div>
            <h3 id="ai-feature-heading">영역별 모델</h3>
          </div>
          <div className="ai-feature-column-labels" aria-hidden="true">
            <span>공급자</span>
            <span>모델</span>
          </div>
        </div>

        <div className="ai-settings-group-body">
        <div className="ai-feature-model-list">
          {AI_FEATURE_DEFINITIONS.map((definition) => {
            const config =
              configs.find((item) => item.feature === definition.key) ?? {
                feature: definition.key,
                ...DEFAULT_FEATURE_MODELS[definition.key],
              };
            const providerModels = modelsForProvider(config.provider);
            return (
              <div className="ai-feature-model-row" key={definition.key}>
                <div className="ai-feature-model-copy">
                  <strong>{definition.label}</strong>
                  <span>{definition.description}</span>
                </div>
                <label className="ai-feature-select">
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
                </label>
              </div>
            );
          })}
        </div>
        </div>
      </section>

      {message ? <p className="ai-settings-message" role="status">{message}</p> : null}
      {error ? <p className="ai-settings-error" role="alert">{error}</p> : null}

      {modalProvider && modalMeta ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="add-card-modal ai-connect-modal" role="dialog" aria-modal="true" aria-labelledby="ai-connect-title">
            <div className="modal-header">
              <h3 className="modal-title" id="ai-connect-title">
                {modalKey ? `${modalMeta.label} 연결 관리` : "공급자 연결"}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={providerBusy !== null}
                aria-label="닫기"
              />
            </div>
            <div className="modal-body">
              {!modalKey ? (
                <label className="ai-connect-field">
                  <span>공급자</span>
                  <select
                    value={modalProvider}
                    onChange={(event) => {
                      setModalProvider(event.target.value as AiProvider);
                      setApiKey("");
                      setModalError(null);
                    }}
                    disabled={providerBusy !== null}
                  >
                    {(availableProviders.length > 0 ? availableProviders : PROVIDERS).map(
                      (provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : (
                <div className="ai-connect-current">
                  <strong>{modalMeta.label}</strong>
                  <span>{modalMeta.description}</span>
                  <div
                    className={`ai-provider-current ${
                      modalKey.verified ? "is-ok" : "is-warn"
                    }`}
                  >
                    <span>{modalKey.verified ? "검증 완료" : "검증 실패"}</span>
                    <code>•••• {modalKey.last4}</code>
                    <small>{formatDate(modalKey.verifiedAt ?? modalKey.updatedAt)}</small>
                  </div>
                </div>
              )}

              <form className="ai-connect-form" onSubmit={saveProviderKey}>
                <label className="ai-connect-field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      modalKey ? "새 키로 교체할 때만 입력" : modalMeta.keyPlaceholder
                    }
                    disabled={providerBusy !== null}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="modal-actions ai-connect-actions">
                  {modalKey ? (
                    <button
                      type="button"
                      className="settings-action-btn is-danger"
                      onClick={deleteProviderKey}
                      disabled={providerBusy !== null}
                    >
                      연결 해제
                    </button>
                  ) : (
                    <span className="ai-connect-spacer" />
                  )}
                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={closeModal}
                    disabled={providerBusy !== null}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="settings-action-btn is-primary"
                    disabled={providerBusy !== null || !apiKey.trim()}
                  >
                    {providerBusy === modalProvider
                      ? "확인 중…"
                      : modalKey
                        ? "새 키로 교체"
                        : "저장 + 검증"}
                  </button>
                </div>
              </form>

              {modalKey?.lastError ? (
                <p className="ai-settings-inline-error" role="alert">
                  {modalKey.lastError}
                </p>
              ) : null}
              {modalError ? (
                <p className="ai-settings-inline-error" role="alert">
                  {modalError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
