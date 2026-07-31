import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedVideoSource,
  buildFfmpegChildEnv,
  buildFfmpegFrameArgs,
  materializeVideoSource,
  parseArgs,
  processWithConcurrency,
  runBackfill,
  runFfmpeg,
  validateWriteEnv,
  type FfmpegChild,
  type VideoSourcePolicy,
} from "../../../scripts/backfill-video-thumbnails";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
  vi.restoreAllMocks();
});

const POLICY: VideoSourcePolicy = {
  supabaseOrigin: "https://project.supabase.co",
  bucket: "aura-board-uploads",
  legacyOrigins: ["https://legacy.example.test"],
};

const SUPABASE_SOURCE =
  "https://project.supabase.co/storage/v1/object/public/aura-board-uploads/uploads/video.mp4";

const VALID_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "aura-board-uploads",
} satisfies NodeJS.ProcessEnv;

async function makeTempPath(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "aura-backfill-test-"));
  tempDirectories.push(directory);
  return path.join(directory, name);
}

describe("video thumbnail backfill arguments", () => {
  it("defaults to dry-run", () => {
    const args = parseArgs([]);
    expect(args).toEqual({
      write: false,
      dryRun: true,
      force: false,
      loadEnvFiles: false,
      limit: 500,
      concurrency: 1,
      downloadTimeoutMs: 300_000,
      ffmpegTimeoutMs: 120_000,
      maxSourceBytes: 1_073_741_824,
      maxFfmpegStdoutBytes: 67_108_864,
    });
  });

  it("keeps --dry-run accepted and non-writing", () => {
    expect(parseArgs(["--dry-run"])).toMatchObject({ write: false, dryRun: true });
  });

  it("enables writes only with --write", () => {
    expect(parseArgs(["--write"])).toMatchObject({ write: true, dryRun: false });
  });

  it("strictly parses supported flags and values", () => {
    expect(
      parseArgs([
        "--write", "--force", "--load-env-files", "--limit=12", "--concurrency", "2",
        "--download-timeout-ms=100", "--ffmpeg-timeout-ms", "200", "--max-source-bytes=300",
        "--max-ffmpeg-stdout-bytes=400",
      ]),
    ).toMatchObject({
      write: true,
      dryRun: false,
      force: true,
      loadEnvFiles: true,
      limit: 12,
      concurrency: 2,
      downloadTimeoutMs: 100,
      ffmpegTimeoutMs: 200,
      maxSourceBytes: 300,
      maxFfmpegStdoutBytes: 400,
    });
  });

  it.each([
    [["--unknown"], "unknown argument"],
    [["--limit"], "missing value"],
    [["--limit=0"], "invalid value"],
    [["--limit=1", "--limit", "2"], "duplicate argument"],
    [["--dry-run", "--dry-run"], "duplicate argument"],
    [["--write", "--write"], "duplicate argument"],
    [["--write", "--dry-run"], "mutually exclusive"],
    [["--dry-run", "--write"], "mutually exclusive"],
    [["--write=true"], "does not accept a value"],
    [["--concurrency=3"], "at most 2"],
  ])("rejects invalid arguments %#", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("write-mode environment validation", () => {
  it("accepts a fully valid environment", () => {
    expect(validateWriteEnv({ ...VALID_ENV })).toEqual({
      supabaseOrigin: "https://project.supabase.co",
      bucket: "aura-board-uploads",
      legacyOrigins: [],
    });
  });

  it("parses explicit legacy origins", () => {
    expect(
      validateWriteEnv({
        ...VALID_ENV,
        AURA_LEGACY_VIDEO_SOURCE_ORIGINS: "https://legacy.example.test, https://old.example.test",
      }).legacyOrigins,
    ).toEqual(["https://legacy.example.test", "https://old.example.test"]);
  });

  it.each([
    [{ DATABASE_URL: "" }, "DATABASE_URL"],
    [{ SUPABASE_SERVICE_ROLE_KEY: "  " }, "SUPABASE_SERVICE_ROLE_KEY"],
    [{ SUPABASE_URL: undefined }, "SUPABASE_URL is required"],
    [{ SUPABASE_URL: "http://project.supabase.co" }, "must use https"],
    [{ SUPABASE_URL: "https://user:pw@project.supabase.co" }, "must not contain credentials"],
    [{ SUPABASE_URL: "https://project.supabase.co/?a=1" }, "query or hash"],
    [{ SUPABASE_URL: "https://project.supabase.co/#x" }, "query or hash"],
    [{ SUPABASE_URL: "not-a-url" }, "valid absolute URL"],
    [{ SUPABASE_STORAGE_BUCKET: undefined }, "must be set explicitly"],
    [
      { SUPABASE_STORAGE_BUCKET: "one", AURA_STORAGE_BUCKET: "two" },
      "disagree",
    ],
    [
      { AURA_LEGACY_VIDEO_SOURCE_ORIGINS: "http://legacy.example.test" },
      "bare https origins",
    ],
    [
      { AURA_LEGACY_VIDEO_SOURCE_ORIGINS: "https://legacy.example.test/videos" },
      "bare https origins",
    ],
    [{ AURA_LEGACY_VIDEO_SOURCE_ORIGINS: "legacy.example.test" }, "invalid origin"],
  ])("fails fast on invalid environment %#", (overrides, message) => {
    expect(() => validateWriteEnv({ ...VALID_ENV, ...overrides })).toThrow(message);
  });

  it("never echoes the offending value", () => {
    expect(() =>
      validateWriteEnv({ ...VALID_ENV, SUPABASE_URL: "http://secret-host.internal" }),
    ).toThrow(/^SUPABASE_URL must use https$/);
  });
});

describe("video source allowlist", () => {
  it("allows the exact Supabase origin and bucket prefix", () => {
    expect(assertAllowedVideoSource(SUPABASE_SOURCE, POLICY).href).toBe(SUPABASE_SOURCE);
  });

  it("allows an explicitly allowlisted legacy source with a signed query", () => {
    const legacy = "https://legacy.example.test/video.mp4?token=abc";
    expect(assertAllowedVideoSource(legacy, POLICY).href).toBe(legacy);
  });

  it.each([
    ["https://project.supabase.co.evil.test/storage/v1/object/public/aura-board-uploads/v.mp4", "not allowlisted"],
    ["https://evil.test/storage/v1/object/public/aura-board-uploads/v.mp4", "not allowlisted"],
    ["https://legacy.example.test.evil.test/v.mp4", "not allowlisted"],
    ["http://project.supabase.co/storage/v1/object/public/aura-board-uploads/v.mp4", "must use https"],
    ["https://project.supabase.co/storage/v1/object/public/other-bucket/v.mp4", "outside the configured Supabase bucket"],
    ["https://project.supabase.co/storage/v1/object/public/aura-board-uploadsX/v.mp4", "outside the configured Supabase bucket"],
    [`${SUPABASE_SOURCE}?token=abc`, "must not contain a query"],
    [`${SUPABASE_SOURCE}#frag`, "must not contain a hash"],
    ["https://user:pw@project.supabase.co/storage/v1/object/public/aura-board-uploads/v.mp4", "must not contain credentials"],
    ["/uploads/video.mp4", "absolute https URL"],
    ["./video.mp4", "absolute https URL"],
    ["file:///etc/passwd", "must use https"],
  ])("rejects %s", (source, message) => {
    expect(() => assertAllowedVideoSource(source, POLICY)).toThrow(message);
  });
});

describe("streamed video materialization", () => {
  it("refuses to fetch a source outside the allowlist", async () => {
    const fetchImpl = vi.fn();
    await expect(
      materializeVideoSource("https://evil.test/video.mp4", {
        timeoutMs: 1_000,
        maxBytes: 5,
        policy: POLICY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("not allowlisted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses manual redirect handling and rejects any 3xx", async () => {
    const tempPath = await makeTempPath("redirect.mp4");
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.test/v.mp4" } }),
    );
    await expect(
      materializeVideoSource(SUPABASE_SOURCE, {
        timeoutMs: 1_000,
        maxBytes: 5,
        tempPath,
        policy: POLICY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("redirected: HTTP 302");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    await expect(stat(tempPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("streams a body to the destination file", async () => {
    const tempPath = await makeTempPath("video.mp4");
    const response = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    await materializeVideoSource(SUPABASE_SOURCE, {
      timeoutMs: 1_000,
      maxBytes: 3,
      tempPath,
      policy: POLICY,
      fetchImpl: async () => response,
    });
    expect(await readFile(tempPath)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("removes the partial file when the streamed body exceeds the limit", async () => {
    const tempPath = await makeTempPath("partial.mp4");
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
      { status: 200 },
    );

    await expect(
      materializeVideoSource(SUPABASE_SOURCE, {
        timeoutMs: 1_000,
        maxBytes: 5,
        tempPath,
        policy: POLICY,
        fetchImpl: async () => response,
      }),
    ).rejects.toThrow("exceeds 5 bytes");
    await expect(stat(tempPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects Content-Length over the limit without leaving a file", async () => {
    const tempPath = await makeTempPath("declared-too-large.mp4");
    const response = new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-length": "6" },
    });

    await expect(
      materializeVideoSource(SUPABASE_SOURCE, {
        timeoutMs: 1_000,
        maxBytes: 5,
        tempPath,
        policy: POLICY,
        fetchImpl: async () => response,
      }),
    ).rejects.toThrow("exceeds 5 bytes");
    await expect(stat(tempPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

type FakeProcess = FfmpegChild & {
  emitStdout(chunk: Buffer): void;
  emitClose(code: number): void;
  kills: number;
};

function createFakeProcess(): FakeProcess {
  const stdoutListeners: Array<(chunk: Buffer) => void> = [];
  const closeListeners: Array<(code: number) => void> = [];
  const fake: FakeProcess = {
    kills: 0,
    stdout: {
      on(_event, listener) {
        stdoutListeners.push(listener);
        return fake.stdout;
      },
    },
    stderr: { resume: () => undefined },
    on(event, listener) {
      if (event === "close") closeListeners.push(listener as unknown as (code: number) => void);
      return fake;
    },
    kill() {
      fake.kills += 1;
      return true;
    },
    emitStdout(chunk) {
      stdoutListeners.forEach((listener) => listener(chunk));
    },
    emitClose(code) {
      closeListeners.forEach((listener) => listener(code));
    },
  };
  return fake;
}

describe("ffmpeg execution guards", () => {
  it("allows only local file and pipe protocols for frame extraction", () => {
    expect(buildFfmpegFrameArgs("/tmp/video.mp4", 1)).toEqual(
      expect.arrayContaining(["-protocol_whitelist", "file,pipe"]),
    );
  });

  it("does not pass database or Supabase credentials to FFmpeg", () => {
    expect(
      buildFfmpegChildEnv({
        PATH: "/usr/bin",
        LANG: "C.UTF-8",
        DATABASE_URL: "secret-database-url",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
      }),
    ).toEqual({ PATH: "/usr/bin", LANG: "C.UTF-8" });
  });

  it("returns captured output on success", async () => {
    const fake = createFakeProcess();
    const result = runFfmpeg({
      executable: "ffmpeg",
      args: ["-version"],
      timeoutMs: 1_000,
      captureOutput: true,
      spawnImpl: () => fake,
    });
    fake.emitStdout(Buffer.from([1, 2]));
    fake.emitClose(0);
    expect(await result).toEqual(Buffer.from([1, 2]));
    expect(fake.kills).toBe(0);
  });

  it("kills the child and fails when stdout exceeds the cap", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = createFakeProcess();
    const result = runFfmpeg({
      executable: "ffmpeg",
      args: [],
      timeoutMs: 10_000,
      captureOutput: true,
      maxStdoutBytes: 3,
      spawnImpl: () => fake,
    });
    fake.emitStdout(Buffer.from([1, 2]));
    fake.emitStdout(Buffer.from([3, 4]));
    expect(await result).toBeNull();
    expect(fake.kills).toBe(1);
  });

  it("kills the child and fails on timeout", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeProcess();
      const result = runFfmpeg({
        executable: "ffmpeg",
        args: [],
        timeoutMs: 50,
        captureOutput: true,
        spawnImpl: () => fake,
      });
      vi.advanceTimersByTime(50);
      expect(await result).toBeNull();
      expect(fake.kills).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("video thumbnail backfill concurrency", () => {
  it("rejects an invalid worker count", async () => {
    await expect(processWithConcurrency([1], 0, async () => undefined)).rejects.toThrow(
      "positive integer",
    );
  });

  it("never runs more than the requested number of items", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const processing = processWithConcurrency([1, 2, 3, 4], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });

    await viWaitFor(() => expect(active).toBe(2));
    releases.shift()!();
    await viWaitFor(() => expect(releases.length).toBe(2));
    releases.shift()!();
    await viWaitFor(() => expect(releases.length).toBe(2));
    releases.splice(0).forEach((release) => release());
    await processing;
    expect(peak).toBe(2);
  });
});

function createDb(attachments: Array<{ id: string; cardId: string; url: string }>) {
  const updates: string[] = [];
  return {
    updates,
    db: {
      cardAttachment: {
        findMany: async () => attachments,
        update: async (options: { where: { id: string } }) => {
          updates.push(options.where.id);
          return undefined;
        },
      },
      $disconnect: async () => undefined,
    },
  };
}

describe("backfill run outcomes", () => {
  it("rejects write mode without a source policy before querying", async () => {
    const findMany = vi.fn(async () => []);
    const db = {
      cardAttachment: {
        findMany,
        update: vi.fn(async () => undefined),
      },
      $disconnect: async () => undefined,
    };

    await expect(
      runBackfill(parseArgs(["--write"]), db, null, async () => null),
    ).rejects.toThrow("source policy is required");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("never touches the database in dry-run mode", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { db, updates } = createDb([{ id: "a1", cardId: "c1", url: SUPABASE_SOURCE }]);
    const createPreview = vi.fn();
    await runBackfill(parseArgs([]), db, null, createPreview);
    expect(updates).toEqual([]);
    expect(createPreview).not.toHaveBeenCalled();
  });

  it("updates rows in write mode", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { db, updates } = createDb([{ id: "a1", cardId: "c1", url: SUPABASE_SOURCE }]);
    await runBackfill(parseArgs(["--write"]), db, POLICY, async () => ({
      url: "https://preview.test/a.webp",
    }));
    expect(updates).toEqual(["a1"]);
  });

  it("cleans up an uploaded preview when the database update fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = createDb([{ id: "a1", cardId: "c1", url: SUPABASE_SOURCE }]);
    db.cardAttachment.update = async () => {
      throw new Error("database update failed");
    };
    const cleanup = vi.fn(async () => undefined);

    await expect(
      runBackfill(parseArgs(["--write"]), db, POLICY, async () => ({
        url: "https://preview.test/a.webp",
        cleanup,
      })),
    ).rejects.toThrow("1 failed item(s)");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("isolates items and exits non-zero when any item fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, updates } = createDb([
      { id: "ok", cardId: "c1", url: SUPABASE_SOURCE },
      { id: "throws", cardId: "c2", url: SUPABASE_SOURCE },
      { id: "null", cardId: "c3", url: SUPABASE_SOURCE },
    ]);

    await expect(
      runBackfill(parseArgs(["--write"]), db, POLICY, async (attachment) => {
        if (attachment.id === "throws") throw new Error("boom");
        if (attachment.id === "null") return null;
        return { url: "https://preview.test/a.webp" };
      }),
    ).rejects.toThrow("2 failed item(s)");
    expect(updates).toEqual(["ok"]);
  });
});

async function viWaitFor(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  assertion();
}
