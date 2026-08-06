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

function settingsResponse(configs = defaultConfigs) {
  return new Response(
    JSON.stringify({ keys: [], configs, catalog: AI_MODEL_CATALOG }),
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

  it("shows provider credentials and six feature-specific model selectors", async () => {
    render(<LlmKeyForm />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/teacher/ai-settings", {
        cache: "no-store",
      }),
    );

    expect(screen.getByRole("tab", { name: /OpenAI/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Google/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /OpenCode-go/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "영역별 모델" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();

    for (const feature of AI_FEATURE_DEFINITIONS) {
      expect(screen.getByText(feature.label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("combobox")).toHaveLength(12);
    expect(screen.getByRole("combobox", { name: "학생 평어 공급자" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "독서 피드백 모델" })).toBeInTheDocument();
  });

  it("switches independent provider key panels", async () => {
    render(<LlmKeyForm />);
    await screen.findByRole("heading", { name: "영역별 모델" });

    fireEvent.click(screen.getByRole("tab", { name: /OpenAI/ }));
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /OpenCode-go/ }));
    expect(screen.getByPlaceholderText("oc-...")).toBeInTheDocument();
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
