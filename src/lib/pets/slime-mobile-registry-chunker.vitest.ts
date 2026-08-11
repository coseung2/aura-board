import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  mobileRegistryChunkerPath,
  runMobileRegistryChunker,
} from "../../../scripts/slime-mobile-registry-chunker.mjs";

describe("mobile generated registry chunker invocation", () => {
  it("invokes the stable production script path from the repository root", async () => {
    const repoRoot = path.resolve("fixture-repository");
    const execute = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    await runMobileRegistryChunker({ repoRoot, execute });

    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      [mobileRegistryChunkerPath(repoRoot)],
      { cwd: repoRoot },
    );
  });
});
