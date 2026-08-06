import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_FEATURE_DEFINITIONS,
  AI_MODEL_CATALOG,
  DEFAULT_FEATURE_MODELS,
} from "@/lib/ai/model-catalog";
import { LlmKeyForm } from "./LlmKeyForm";

const fetchMock = vi.fn();

const defaultConfigs = AI_FEATURE_DEFINITIONS.map(({ key }) => ({
  feature: key,
  ...DEFAULT_FEATURE_MODELS[key],
}));

function settingsResponse(
  configs = defaultConfigs,
  keys: Array<Record<string, unknown>> = [],
) {
  return new Response(
    JSON.stringify({ keys, configs, catalog: AI_MODEL_CATALOG }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("LlmKeyForm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/teacher/ai-settings" && (!init?.method || init.method === "GET")) {
        return settingsResponse();
      }
      if (url === "/api/teacher/ai-settings" && init?.method === "PUT") {
        const next = JSON.parse(String(init.body)) as {
          feature: (typeof defaultConfigs)[number]["feature"];
          provider: (typeof defaultConfigs)[number]["provider"];
          modelId: string;
        };
        return settingsResponse(
          defaultConfigs.map((config) =>
            config.feature === next.feature ? { ...config, ...next } : config,
          ),
        );
      }
      return new Response(JSON.stringify({ error: "unexpected_request" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows provider connection/billing table, connect modal, and feature selectors", async () => {
    render(<LlmKeyForm />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/teacher/ai-settings", {
        cache: "no-store",
      }),
    );

    expect(screen.getByRole("heading", { name: "API 연결" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "영역별 모델" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "청구" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "공급자 연결 및 청구" })).toBeInTheDocument();
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Google").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenCode-go").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "연결" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "OpenAI Platform" })).toBeInTheDocument();

    for (const feature of AI_FEATURE_DEFINITIONS) {
      expect(screen.getByText(feature.label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("combobox")).toHaveLength(12);
    expect(screen.getByRole("combobox", { name: "학생 평어 공급자" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "독서 피드백 모델" })).toBeInTheDocument();
    expect(screen.queryByText("대량·저지연 작업용 경량 모델")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "연결" })[0]);
    expect(screen.getByRole("dialog", { name: "공급자 연결" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
  });

  it("shows connection status and opens manage modal for connected providers", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/teacher/ai-settings" && (!init?.method || init.method === "GET")) {
        return settingsResponse(defaultConfigs, [
          {
            provider: "gemini",
            last4: "JQ04",
            verified: true,
            verifiedAt: "2026-07-05T07:11:00.000Z",
            lastError: null,
            updatedAt: "2026-07-05T07:11:00.000Z",
          },
        ]);
      }
      return new Response(JSON.stringify({ error: "unexpected_request" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    render(<LlmKeyForm />);
    expect(await screen.findByText("•••• JQ04")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google 연결됨" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "연결" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Google 연결됨" }));
    expect(screen.getByRole("dialog", { name: "Google 연결 관리" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("새 키로 교체할 때만 입력")).toBeInTheDocument();
  });

  it("saves a recommended model when a feature provider changes", async () => {
    render(<LlmKeyForm />);
    const providerSelect = await screen.findByRole("combobox", {
      name: "학생 평어 공급자",
    });

    fireEvent.change(providerSelect, { target: { value: "openai" } });

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/teacher/ai-settings" && init?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
        feature: "feedback",
        provider: "openai",
        modelId: "gpt-5.6-terra",
      });
    });
  });
});
