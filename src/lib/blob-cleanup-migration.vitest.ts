import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260731140000_blob_cleanup_leases",
    "migration.sql",
  ),
  "utf8",
);
const originalMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260606_media_preview_blob_cleanup",
    "migration.sql",
  ),
  "utf8",
);

describe("BlobDeletionQueue lease migration", () => {
  it("adds state in place and preserves the original queue indexes", () => {
    expect(migration).toContain('ADD COLUMN "nextAttemptAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "status" TEXT');
    expect(migration).toContain('ADD COLUMN "lockedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "lockToken" TEXT');
    expect(migration).toContain('ADD COLUMN "terminal" BOOLEAN');
    expect(originalMigration).toContain(
      '"BlobDeletionQueue_deleteAfter_deletedAt_idx"',
    );
    expect(originalMigration).toContain('"BlobDeletionQueue_url_idx"');
    expect(migration).not.toMatch(/DROP\s+TABLE\s+.*BlobDeletionQueue/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+.*BlobDeletionQueue/i);
  });

  it("backfills existing rows and keeps the public table protected by RLS", () => {
    expect(migration).toContain('"nextAttemptAt" = CASE');
    expect(migration).toContain(
      "\"status\" = CASE WHEN \"deletedAt\" IS NULL THEN 'pending' ELSE 'done' END",
    );
    expect(migration).toContain('"terminal" = ("deletedAt" IS NOT NULL)');
    expect(migration).toContain(
      'ALTER TABLE public."BlobDeletionQueue" ENABLE ROW LEVEL SECURITY',
    );
  });
});
