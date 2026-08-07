import { afterEach, describe, expect, it } from "vitest";
import { withApplicationPoolLimits } from "./db-config";

const originalConnectionLimit = process.env.PRISMA_CONNECTION_LIMIT;
const originalPoolTimeout = process.env.PRISMA_POOL_TIMEOUT_SECONDS;

afterEach(() => {
  if (originalConnectionLimit === undefined) delete process.env.PRISMA_CONNECTION_LIMIT;
  else process.env.PRISMA_CONNECTION_LIMIT = originalConnectionLimit;
  if (originalPoolTimeout === undefined) delete process.env.PRISMA_POOL_TIMEOUT_SECONDS;
  else process.env.PRISMA_POOL_TIMEOUT_SECONDS = originalPoolTimeout;
});

describe("withApplicationPoolLimits", () => {
  it("adds production-safe application defaults", () => {
    const result = new URL(
      withApplicationPoolLimits("postgresql://user:pass@db.example.test/app")!,
    );
    expect(result.searchParams.get("connection_limit")).toBe("15");
    expect(result.searchParams.get("pool_timeout")).toBe("30");
  });

  it("preserves explicit URL settings", () => {
    const result = new URL(
      withApplicationPoolLimits(
        "postgresql://user:pass@db.example.test/app?connection_limit=7&pool_timeout=9",
      )!,
    );
    expect(result.searchParams.get("connection_limit")).toBe("7");
    expect(result.searchParams.get("pool_timeout")).toBe("9");
  });

  it("allows bounded environment overrides", () => {
    process.env.PRISMA_CONNECTION_LIMIT = "18";
    process.env.PRISMA_POOL_TIMEOUT_SECONDS = "45";
    const result = new URL(
      withApplicationPoolLimits("postgresql://user:pass@db.example.test/app")!,
    );
    expect(result.searchParams.get("connection_limit")).toBe("18");
    expect(result.searchParams.get("pool_timeout")).toBe("45");
  });
});
