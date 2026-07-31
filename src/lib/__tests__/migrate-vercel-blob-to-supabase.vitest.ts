import { describe, expect, it, vi } from "vitest";
import {
  FIELDS,
  isVercelBlobUrl,
  loadLocalEnvFiles,
  objectPathFromBlobUrl,
  parseArgs,
  runMigration,
} from "../../../scripts/migrate-vercel-blob-to-supabase";

const blobUrl = "https://store.public.blob.vercel-storage.com/folder/image%20one.png";

describe("Vercel Blob migration", () => {
  it("covers every media reference checked by blob cleanup", () => {
    expect(FIELDS.map(({ label, field }) => `${label}.${field}`)).toEqual([
      "Card.imageUrl", "Card.thumbUrl", "Card.linkImage", "Card.videoUrl", "Card.fileUrl",
      "CardAttachment.url", "CardAttachment.previewUrl",
      "StudentAsset.fileUrl", "StudentAsset.thumbnailUrl",
      "Submission.fileUrl", "Submission.videoThumbnail",
      "Board.thumbnailUrl", "Board.eventPosterUrl", "VibeProject.thumbnailUrl",
      "PlantObservationImage.url", "PlantObservationImage.thumbnailUrl", "DjPlayEvent.linkImage",
      "User.image", "User.appBackgroundUrl", "DailyBannerSubmission.imageUrl",
      "StoreItem.imageUrl", "AvatarItem.imageUrl", "AvatarItem.thumbnailUrl",
    ]);
  });

  it("defaults to dry-run and enables mutations only with --write", () => {
    expect(parseArgs([])).toEqual({
      write: false,
      loadEnvFiles: false,
      limit: Number.POSITIVE_INFINITY,
    });
    expect(parseArgs(["--write"])).toMatchObject({ write: true });
  });

  it("makes env-file loading explicit and preserves injected env values", () => {
    const access = { exists: vi.fn(() => true), read: vi.fn(() => "TOKEN=from-file\nNEW='loaded'") };
    const env: NodeJS.ProcessEnv = { TOKEN: "injected" };

    expect(parseArgs([]).loadEnvFiles).toBe(false);
    expect(access.exists).not.toHaveBeenCalled();
    expect(parseArgs(["--load-env-files"]).loadEnvFiles).toBe(true);
    loadLocalEnvFiles(env, ["fake.env"], access);

    expect(env).toMatchObject({ TOKEN: "injected", NEW: "loaded" });
    expect(access.read).toHaveBeenCalledWith("fake.env");
  });

  it.each([
    [["--limit=12"], 12],
    [["--limit", "7"], 7],
  ])("accepts valid limit syntax", (argv, expected) => {
    expect(parseArgs(argv).limit).toBe(expected);
  });

  it.each([
    ["zero", ["--limit=0"]],
    ["negative", ["--limit=-1"]],
    ["decimal", ["--limit=1.5"]],
    ["non-numeric", ["--limit=nope"]],
    ["missing", ["--limit"]],
    ["unsafe integer", ["--limit=999999999999999999999"]],
  ])("rejects an invalid %s limit", (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow(/--limit must be a positive/);
  });

  it("accepts only HTTPS Vercel Blob URLs and derives a decoded safe path", () => {
    expect(isVercelBlobUrl(blobUrl)).toBe(true);
    expect(objectPathFromBlobUrl(blobUrl)).toBe("folder/image one.png");
    expect(isVercelBlobUrl("http://store.public.blob.vercel-storage.com/a.png")).toBe(false);
    expect(isVercelBlobUrl("https://store.public.blob.vercel-storage.com.evil.test/a.png")).toBe(false);
    expect(isVercelBlobUrl("not a URL")).toBe(false);
  });

  it.each([
    "https://store.public.blob.vercel-storage.com/",
    "https://store.public.blob.vercel-storage.com/a//b.png",
    "https://store.public.blob.vercel-storage.com/a/../b.png",
    "https://store.public.blob.vercel-storage.com/a/%2e%2e/b.png",
    "https://store.public.blob.vercel-storage.com/a%2Fb.png",
    "https://store.public.blob.vercel-storage.com/a%5Cb.png",
    "https://store.public.blob.vercel-storage.com/%00.png",
    "https://example.com/a.png",
  ])("rejects an unsafe object path: %s", (url) => {
    expect(() => objectPathFromBlobUrl(url)).toThrow();
  });

  it("does not copy or update in dry-run mode", async () => {
    const copy = vi.fn();
    const update = vi.fn();
    const db = {
      card: { findMany: vi.fn().mockResolvedValue([{ id: "1", imageUrl: blobUrl }]), update },
    };

    await expect(runMigration({
      args: parseArgs([]), db, copy, logger: { log: vi.fn(), error: vi.fn() },
    })).resolves.toMatchObject({ candidates: 1, copied: 0, dryRun: true });
    expect(copy).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("copies and updates in explicit write mode", async () => {
    const nextUrl = "https://project.supabase.co/storage/v1/object/public/bucket/folder/image%20one.png";
    const copy = vi.fn().mockResolvedValue(nextUrl);
    const update = vi.fn().mockResolvedValue({});
    const db = {
      card: { findMany: vi.fn().mockResolvedValue([{ id: "1", imageUrl: blobUrl }]), update },
    };

    await expect(runMigration({
      args: parseArgs(["--write"]), db, copy, logger: { log: vi.fn(), error: vi.fn() },
    })).resolves.toMatchObject({ copied: 1, dryRun: false });
    expect(copy).toHaveBeenCalledWith(blobUrl, "folder/image one.png");
    expect(update).toHaveBeenCalledWith({ where: { id: "1" }, data: { imageUrl: nextUrl } });
  });

  it("fails the write run after reporting any item failure", async () => {
    const update = vi.fn();
    const db = {
      card: { findMany: vi.fn().mockResolvedValue([{ id: "1", imageUrl: blobUrl }]), update },
    };

    await expect(runMigration({
      args: parseArgs(["--write"]),
      db,
      copy: vi.fn().mockRejectedValue(new Error("source unavailable")),
      logger: { log: vi.fn(), error: vi.fn() },
    })).rejects.toThrow("migration completed with 1 failed item(s)");
    expect(update).not.toHaveBeenCalled();
  });
});
