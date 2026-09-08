# Song guess catalog import

Runtime pools live in `SongGuessCatalogSong` and `SongGuessCatalogClip` in the
application database. Song titles, aliases, categories, and source provenance
are registered independently of audio availability. Only rows with a verified
private audio clip can be selected for a game. The catalog API reads this DB;
there is no silent fallback to a checked-in JSON catalog.

`data/song-guess/catalog.json` is the reproducible import manifest. Local clips
live in `data/song-guess/clips/<id>/`; syncing uploads canonical WAVs to the
private `aura-board-song-guess` bucket with SHA-256 content identities. RLS and
table grants prevent participants from reading the answers/source catalog.
This is the default private bucket; `SONG_GUESS_STORAGE_BUCKET` (or the legacy
`AURA_SONG_GUESS_BUCKET`) can override it. The bucket must already exist with
public access disabled and must differ from the public upload bucket.

For an existing local recording, use the file importer. Its `sourceUrl` records
attribution while `sourceFile` must point to an existing local file.

```text
node scripts/song-guess-import.mjs ./song-guess-manifest.json --ffmpeg C:\\tools\\ffmpeg.exe
```

Each input row has `id`, `title`, `artist`, `aliases`, `categories`,
`sourceFile`, and an HTTPS/HTTP `sourceUrl`. `introStartSeconds` and
`highlightStartSeconds` select optional fifteen-second segments. Categories are
`girl-idol`, `boy-idol`, `2000s`, `2010s`, `2020s`, `other`, and `classical`. The source must be
long enough for every requested segment; no padding is accepted. FFmpeg emits
mono 44.1 kHz PCM16 WAV files, and the importer checks the exact sample count
before publishing.

The command merges by song ID and preserves prior segments when only one start
offset is supplied. An ID cannot be reused with a different `sourceUrl`.
Manifest and clip publication use a staging directory and rollback on failure,
so an interrupted batch leaves the previous catalog usable.

The checked-in catalog retains 576 metadata rows from the 577-row Korean song
metadata pool in the MIT-licensed source snapshot from the previous session;
one placeholder row had no valid YouTube ID and is intentionally omitted.
These rows use a
`clips.<segment>.videoId` plus `startSeconds` declaration. The optional
conversion helper is reproducible when the source JSON is available:

```text
node scripts/song-guess-import-youtube.mjs \
  .codex/artifacts/song-guess-source/song_kr.json \
  data/song-guess/catalog.json
```

The helper writes source metadata only; these records are not audio files and
are excluded from playable counts and setup selection. Game playback uses
private audio files through the existing authorized clip endpoint. Web uses
`<audio>` and mobile uses Expo Audio. There is no video player or embed endpoint
in the song-guess flow. Legacy video-only assets report a missing audio file
and cannot be used to start a new game.

The provided classical video (`wcIY33Q1GmE`) has been fully acquired with
`yt-dlp` and separated into all twenty tracks. Every title and composer was
checked against its answer card, and every fifteen-second highlight WAV was
validated. The track boundaries and provenance are recorded in
`.codex/artifacts/song-guess-source/classical-manifest.json`. These are quiz
excerpts, so an intro is not inferred from the start of a quiz chapter.

Setup validates and uploads the selected fifteen-second WAVs as
board-owned private assets. Source URLs, original filenames, and future clips
remain outside participant snapshots. Both canonical `clips/<id>/<segment>.wav`
manifest paths and older `<id>/<segment>.wav` paths resolve under the private
clips directory; traversal and absolute paths are rejected.

## Acquisition and DB registration

The source metadata converter preserves downloaded clips while refreshing
categories and provenance. Explicit years map to their decade; unknown years
are not assigned to the 2010s by default.

```text
node scripts/song-guess-import-youtube.mjs
python scripts/song-guess-download-pool.py --workers 4
```

The downloader writes validated audio plus a per-entry result manifest in
`.codex/artifacts/song-guess-kpop/`; it does not modify the main catalog. Merge
verified successful results by stable song ID before the DB sync. Deleted or
private sources remain registered metadata with no invented playable audio.
On Windows, `truststore` uses the Windows certificate store; TLS and hostname
validation stay enabled.

With the correct target database and private storage environment injected:

```text
node --conditions=react-server --import tsx scripts/song-guess-catalog-sync.ts
node --conditions=react-server --import tsx scripts/song-guess-catalog-sync.ts --apply
```

The first command validates all declared files and reports pending songs
without writing. `--apply` upserts all metadata rows and stores validated clips.
Re-running is resumable: matching hashes are unchanged, absent clips are
preserved, and unrelated songs are not deleted. Do not use plain `npx tsx`:
the CLI imports server-only storage code and requires the `react-server`
condition. The Infisical root `prod /` still contains the old managed target;
use the verified Oracle production runtime/credential route, never guess the
target from that old root configuration.

## Verified production catalog — 2026-09-08 KST

The Oracle production DB now contains all **596 songs** and **996 private
15-second clips**, with zero pending songs. This includes all 20 classical
tracks from the supplied video and all 576 valid Korean-pool records.

| Category | Registered and playable songs |
| --- | ---: |
| Classical | 20 |
| 2020s | 87 |
| 2010s | 427 |
| 2000s | 60 |
| Girl idols | 132 |
| Boy idols | 62 |
| Other | 2 |

Categories overlap. All 596 songs have a highlight; 400 also have an intro.
Fifty-one unavailable original videos were replaced with matching recordings.
The final replacement, Project Rock's “난감하네,” uses the original artist's
Gugak Broadcasting live performance with a three-second start offset; this
version and its source are recorded in the clip provenance. The other acquired
sources and replacement matches remain documented in the import artifacts.

Production readback matched all manifest metadata. Every one of the 996 stored
objects was downloaded and verified against its DB SHA-256, size, PCM16 mono
44.1 kHz format, and 661,500 samples. No file failed. Anonymous catalog reads
returned 401, and the unauthenticated public storage URL returned 400.
Evidence: `.codex/artifacts/song-guess-production-verification.jsonl`.

The catalog and 15-second asset migrations were applied to the verified Oracle
database; the old managed Supabase target was not used. App/play-engine source
changes still require deployment. DB and storage verification does not replace
authenticated two-client game acceptance on that deployed version.
