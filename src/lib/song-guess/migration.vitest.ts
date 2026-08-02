import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260802090000_song_guess", "migration.sql"),
  "utf8",
);
const migration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260802120000_song_guess_round_pack", "migration.sql"),
  "utf8",
);
const wavMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260802143000_song_guess_wav_clips", "migration.sql"),
  "utf8",
);
const allMigrations = `${baseMigration}\n${migration}\n${wavMigration}`;

describe("song-guess storage migration", () => {
  it("persists only fixed derivative metadata and opaque private keys", () => {
    expect(migration).toContain("CHECK (\"gameKind\" IN ('omok', 'song-guess'))");
    expect(migration).toContain("SET \"gameKind\" = 'song-guess'");
    expect(migration.indexOf("SET \"gameKind\" = 'song-guess'")).toBeLessThan(
      migration.indexOf('ADD CONSTRAINT "PlaySession_game_kind_check"'),
    );
    expect(allMigrations).toContain('CREATE TABLE public."SongGuessGame"');
    expect(migration).toContain('CREATE TABLE public."SongGuessRound"');
    expect(allMigrations).toContain('CREATE TABLE public."SongGuessAsset"');
    expect(migration).toContain('"roundId" TEXT');
    expect(migration).toContain("SongGuessRound_order_check");
    expect(migration).toContain("SongGuessAsset_roundId_tierMs_key");
    expect(migration).not.toContain("sourceUrl");
    expect(migration).not.toContain("originalUrl");
    expect(wavMigration).toContain("'audio/wav'");
    expect(wavMigration).not.toContain("sourceUrl");
    expect(wavMigration).not.toContain("originalUrl");
  });

  it("keeps setup and clip rows out of browser roles", () => {
    for (const table of ["SongGuessGame", "SongGuessRound", "SongGuessAsset"]) {
      expect(allMigrations).toContain(
        `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(allMigrations).toContain(
        `REVOKE ALL ON TABLE public."${table}" FROM anon, authenticated`,
      );
    }
  });
});
