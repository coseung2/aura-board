import { describe, expect, it } from "vitest";

import {
  AI_FEATURES,
  AI_MODEL_CATALOG,
  AI_PROVIDERS,
  DEFAULT_FEATURE_MODELS,
  findCatalogModel,
} from "./model-catalog";

describe("AI model catalog", () => {
  it("has a valid default model for every feature", () => {
    for (const feature of AI_FEATURES) {
      const selection = DEFAULT_FEATURE_MODELS[feature];
      expect(AI_PROVIDERS).toContain(selection.provider);
      expect(findCatalogModel(selection.provider, selection.modelId)).toBeDefined();
    }
  });

  it("does not expose duplicate provider/model pairs", () => {
    const ids = AI_MODEL_CATALOG.map(
      (model) => `${model.provider}:${model.id}`,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps OpenCode-go entries on the chat-completions compatible catalog", () => {
    const opencodeIds = AI_MODEL_CATALOG.filter(
      (model) => model.provider === "opencode-go",
    ).map((model) => model.id);

    expect(opencodeIds).toContain("deepseek-v4-flash");
    expect(opencodeIds).toContain("kimi-k2.7-code");
    expect(opencodeIds).not.toContain("gpt-5.1-codex");
  });
});
