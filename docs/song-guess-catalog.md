# Song guess catalog import

## 원본과 퀴즈 구간 관리 규칙

`clips.intro/highlight`는 만들어진 퀴즈 음원의 용도입니다. 원본이 풀버전이라는
뜻이 아닙니다. 원본 정보는 `sourceMetadata.provenance` v1으로 별도 관리합니다.

| 항목 | 값과 의미 |
| --- | --- |
| `container` | `single-track` 한 곡, `multi-track` 모음, `unknown` 미확인 |
| `content` | `full` 풀곡, `highlight` 편집된 하이라이트, `unknown` 미확인 |
| `trackStartSeconds/trackEndSeconds` | 원본 영상/파일 기준 해당 곡의 범위. 모르면 null |
| `quizStartSeconds` | 같은 원본 기준 15초 퀴즈 구간 시작. 미선정이면 null |
| `selectionStatus` | `timestamp-only` 곡 위치만 확인, `uploader-highlight` 업로더 선정 구간, `teacher-selected` 교사 지정, `listening-verified` 청취 검증 완료, `unknown` 미확인 |

- 기존 클래식 20곡: `multi-track / highlight / uploader-highlight`입니다.
  이미 만든 15초 파일을 풀곡으로 표시하거나, 직접 청취 검증했다고 표시하지 않습니다.
- 초등 후보 18곡: `multi-track / unknown / timestamp-only`입니다. 긴 영상이어도
  각 곡이 완전한 연주인지 확인 전에는 `full`로 승격하지 않습니다.
- 그 외 기존 자료는 `legacy-unclassified`로 감사 결과에 표시합니다. 필드가 없다는
  이유로 풀곡이나 검증 완료로 추정하지 않습니다.
- 신규 차트/재생목록 수집은 원본 형태와 미선정 상태를 기록합니다. 로컬 파일 등록은
  sidecar JSON의 `provenance`를 검증하고, 없으면 미확인으로 기록합니다.
- 교사 링크 등록의 `SongGuessImport.startSeconds`는 교사가 지정한 절대 시작점입니다.
  `ready`는 음원 추출 완료를 뜻하며 원본 풀곡 여부나 청취 검증을 뜻하지 않습니다.
- 모음의 중복 비교는 영상 ID만 사용하지 않고 곡 시작점을 함께 비교합니다.
  작곡가/가수와 곡명에 의한 동일 작품 비교는 별도로 유지합니다.
- 범위가 알려진 경우 15초 클립이 다음 곡을 침범하면 검증을 실패시킵니다.
  `listening-verified`는 실제 청취 후에만 수동으로 지정합니다.

관리 확인: `node scripts/song-guess-audit-provenance.mjs [manifest.json ...]`.
분류별 개수와 구형 미분류 개수를 출력하고, 잘못된 시간/상태는 실패 처리합니다.
이 감사는 파일 실제 존재·음질·DB 동기화 완료를 증명하지 않습니다.

## 초등용 클래식 후보

`data/song-guess/classical-elementary-candidates.json`에 HALIDONMUSIC 출처의 18곡을
정리했습니다. 학생용 제목은 익숙한 한글 곡명으로, `artist`는 작곡가로 표시합니다.
악장·작품번호는 `sourceMetadata.originalTitle`에만 보관합니다. 정답 별칭은
띄어쓰기와 통용 이름을 허용하며, 같은 작곡가·표시 곡명은 한 문제로 취급합니다.
예를 들어 사계의 다른 계절이나 호두까기 인형의 다른 춤을 별도 오답으로 만들지 않습니다.

이 파일은 출처 설명과 챕터를 확인한 **선곡 후보**이며 음원 청취 검증이나 DB 등록
완료를 뜻하지 않습니다. `chapterStartSeconds`는 곡 시작점이고,
`highlightStartSeconds`는 청취 전이므로 null입니다. 대표 선율과 무음 여부를
확인한 뒤 퀴즈 구간을 확정합니다. 특히 꽃의 왈츠처럼 도입부가 긴 곡은 조정이 필요합니다.

`song-guess-register-metadata.mjs`는 모음 영상의 곡 시작점을 구분합니다.
후보는 실제 청취와 기존 작품 중복 검토 후 등록합니다. 긴 모음 영상은 기존 64MiB
다운로드 한도에도 걸릴 수 있으므로 구간 추출 방식 검증이 필요합니다.

## 교사가 등록하는 우리 반 음악 링크

음악 퀴즈 출제 화면의 **우리 반 음악 링크**에 `https://youtu.be/영상ID?t=45`처럼
시작 시간이 포함된 링크를 등록합니다. 백그라운드에서 해당 시점부터 15초 음원을 준비하고
가수·제목을 채웁니다. 이름을 자동 확인하지 못하면 교사가 입력할 수 있습니다.
가요는 가수·제목, 클래식은 작곡가·제목을 사용합니다. ‘문제에 추가’는 현재 편집 목록에
음원 사본을 추가하며, ‘라운드 팩 저장’으로 기존 출제 흐름에 저장합니다.

- `SongGuessImport`는 보드에 귀속된 비공개 DB 등록곡입니다. 공용 카탈로그를 교사 입력으로
  덮어쓰지 않습니다. 목록 조회·수정·음원 사본 생성·삭제는 해당 반의 교사/편집자만 가능합니다.
- 같은 보드·영상·시작 시간은 중복 등록하지 않습니다. 최대 100곡 보관, 동시에 5개 대기,
  서버 전체 추출 동시 실행 2개, 최대 3회 시도입니다. 5분이 지난 처리 임대는 복구할 수 있습니다.
- 원본 URL은 YouTube 허용 호스트만 받습니다. 추출기는 인증 쿠키·앱 비밀값을 전달받지 않으며
  64MiB 다운로드·180초 작업 제한을 사용합니다. 긴 모음 영상은 제한에 걸릴 수 있습니다.
- 음원은 비공개 저장소에 canonical PCM16 mono 44.1kHz, 15초 WAV로 저장합니다.
  문제에 추가할 때 DB의 해시·크기·WAV 형식을 다시 검증합니다. 원본 음원은 임시 폴더에서 제거합니다.

배포 준비:

1. `20260908160000_song_guess_teacher_import` Prisma migration 적용. 앞선 artist migration도 필요합니다.
2. Oracle 전용 Python 환경에 `pip install -r scripts/song-guess-import-requirements.txt`로 설치하고
   `SONG_GUESS_PYTHON_PATH`를 해당 Python 절대 경로로 설정합니다. FFmpeg가 서비스 PATH에 있어야 합니다.
3. Next standalone 산출물의 `scripts/song-guess-extract-link.py` 포함 여부를 확인합니다.
4. `infra/oracle/aura-board-app.cron`과 `run-app-cron.sh`의 song-guess-imports POST 항목을 반영합니다.
   등록 직후에도 실행하지만, cron이 있어야 브라우저 종료·서버 재시작 후 미완료 작업을 회수합니다.
5. 배포 후 교사 A/B와 학생 계정으로 격리, 링크 등록 → 완료 → 이름 수정 → 문제 추가 → 팩 저장 →
   게임 시작을 검증합니다. 현재 로컬 검증은 실제 인증 세션의 운영 배포 검증을 대체하지 않습니다.

2026-09-08: 주간 재생목록 메타데이터는 운영 DB에 신규 98곡을 추가하고 기존 2곡을 유지했으며,
100곡의 ID·가수·제목 readback을 확인했습니다. 해당 주간곡의 음원은 아직 이 등록에 포함되지 않습니다.
별도 실제 링크 `1uDzUPzS2w8&t=45`는 1,323,044바이트의 15초 WAV 추출을 확인했습니다.
교사용 링크 화면·새 테이블 migration·cron 배포는 별도로 진행해야 합니다.


## 개별 곡 재생목록 등록

가요 등록의 필수 곡 정보는 **가수·제목**입니다. 작곡가 누락 때문에 가요를 보류하지 않습니다.
클래식은 작곡가를 기준으로 정리합니다. 곡 출처와 하이라이트 구간은 별도 메타데이터입니다.

```powershell
python scripts/song-guess-playlist-collect.py "https://www.youtube.com/playlist?list=PLnlxKMP5GzKCLJGF7P0tUl_44CV7-vdUC" --output .codex/artifacts/song-guess-weekly
# 검증된 운영 환경을 주입한 셸에서 먼저 중복·신규 계획을 확인
node scripts/song-guess-register-metadata.mjs .codex/artifacts/song-guess-weekly/catalog.json
# 검토 후 신규 메타데이터만 등록하고 readback 확인
node scripts/song-guess-register-metadata.mjs .codex/artifacts/song-guess-weekly/catalog.json --apply
```

수집은 yt-dlp의 구조화된 track/artist를 사용하며 둘 중 하나가 없으면 검토 대상으로 남깁니다.
작곡가는 가요 수집 요건이 아닙니다. 등록 도구는 운영 호스트를 검사하고 기존 곡의 ID·영상 출처·가수와
제목 별칭을 대조합니다. 복수 매칭은 적용을 중단하며, 기존 곡과 클립은 덮어쓰지 않습니다.
정기 갱신 전 운영 DB의 최신 목록과 다시 비교해야 합니다. 이 명령은 메타데이터만 등록하며
음원 다운로드·하이라이트 추출·정기 실행 예약을 수행하지 않습니다.


## 유튜브 주간 차트 수집 시험

```powershell
npm run song-guess:chart -- "https://www.youtube.com/watch?v=VIDEO_ID" --output .codex/artifacts/song-guess-chart
```

`song-guess-chart-scrape.py`는 yt-dlp로 영상 설명·챕터만 읽습니다. 여러 영상 URL을
한 번에 전달할 수 있습니다. 음악 다운로드, DB 쓰기, 예약 작업 설치는 하지 않습니다.
Python의 yt-dlp가 필요하며 Windows에서는 truststore 설치 시 시스템 인증서 저장소를 사용합니다.

- 챕터를 우선하고, 없으면 설명의 `00:00 가수 - 제목`을 파싱합니다.
  제목이 먼저인 채널은 `--order title-artist`를 지정합니다. 분리 기호가 없는 행은 검토 대상으로 남깁니다.
- 기존 카탈로그의 가수·제목·별칭으로 양쪽 순서를 대조합니다. 여러 곡이 일치하면 자동 매칭하지 않습니다.
  새 곡은 정규화한 가수·제목으로 안정적인 ID를 만듭니다. 동명곡의 다른 녹음은 추후 메타데이터 검토가 필요합니다.
- 순위는 행에 명시된 숫자만 `uploaderRank`에 기록합니다. 재생 순서는 별도 `sequence`입니다.
  공식 멜론 순위로 간주하지 않으며, 업로드 날짜와 차트 기준일을 분리합니다.
  확인한 차트 날짜만 `--chart-date YYYY-MM-DD`로 전달합니다.
- `report.json`: 영상 출처와 검토 사유. `observations.json`: 영상 ID·시작 시간으로 중복 제거한 누적 관측 기록.
  `candidates.json`: 이번 실행의 신규 곡 후보만 담은 기존 sync 형식의 메타데이터 카탈로그.
  출력 폴더 하나에 동시에 실행하지 않습니다. `--output`을 생략하면 출력만 하고 파일을 쓰지 않습니다.
- 작곡가·하이라이트·발매연도는 추측하지 않습니다. 시작 시간은 **모음 영상 안의 곡 시작**이며,
  하이라이트는 별도 확인이 필요합니다. 신규 곡 후보는 other 분류와 `needsMetadataReview: true`를 가집니다.
  기존 곡의 출처·클립은 후보 파일에 다시 넣지 않아 덮어쓰지 않습니다.
- 후보 파일은 검토 후 기존 `song-guess-catalog-sync.ts`로 등록할 수 있습니다. 이때 음원이 없는
  메타데이터 행으로 등록되므로 재생 가능한 곡이 되지는 않습니다. 주차별 관측 기록은 아직 로컬 JSON이며
  DB 차트 이력 테이블 및 정기 실행 스케줄은 이 시험에 포함되지 않습니다.

2026-09-08 시험: 검색한 모음 영상 5개에서 설명·챕터의 곡별 타임스탬프를 찾지 못해
모두 검토 대상으로 분류했습니다. 실제 곡 추출 성공으로 간주하지 않습니다.
다음 시험은 곡 목록을 제공하는 채널 또는 개별 곡으로 구성된 재생목록을 대상으로 해야 합니다.


## 음악 폴더 자동 등록

`npm run song-guess:ingest -- "C:\Music"`는 하위 폴더의 음악을 검사해
`ready`, `review`, `duplicates`, `warnings`를 JSON으로 출력합니다. 기본 실행은
파일·DB를 변경하지 않습니다. FFmpeg와 FFprobe가 필요하며, 별도 설치 위치는
`--ffmpeg <경로> --ffprobe <경로>`로 지정합니다.

- 메타데이터 우선순위: 파일 옆 JSON → 내장 태그 → `가수 - 제목` 파일명.
- 제목·이름은 Unicode NFKC, 공백, 보이지 않는 문자를 정리합니다. 별칭은 중복을 제거합니다.
- 가수와 작곡가는 `sourceMetadata.performer`, `composer`로 구분해 DB에 보존합니다.
  퀴즈의 `artist`는 일반곡은 가수, 클래식은 작곡가를 우선합니다. `answerArtist`로 재정의할 수 있습니다.
- 연도는 2000s/2010s/2020s, 클래식 장르 태그는 classical로 분류합니다.
  `--artist-map artists.json`에 `{ "그룹명": ["girl-idol"] }` 형식으로 알려진 분류를 넣을 수 있습니다.
  명시한 `categories`가 자동 분류보다 우선합니다. 정보가 없으면 other와 경고를 표시합니다.
- SHA-256으로 파일 중복을 판별하고 안정적인 ID를 생성합니다. 다른 인코딩·녹음은 별도 파일로 취급합니다.
  기존 카탈로그 곡을 갱신하려면 JSON에 기존 `id`와 동일한 `sourceUrl`을 명시합니다.
  같은 파일에 서로 다른 메타데이터가 있거나 서로 다른 파일이 같은 ID를 사용하면 검토가 필요합니다.
- 제목·작성자·HTTP(S) 출처가 없거나 15초 구간이 유효하지 않으면 검토 목록에 표시합니다.
  오디오를 듣고 곡을 식별하거나 하이라이트를 추측하지 않습니다. 기본은 시작 0초의 인트로입니다.

예를 들어 `가수 - 노래.mp3.json`을 음악 파일 옆에 둡니다. 필요한 항목만 지정합니다.

```json
{
  "title": "노래",
  "performer": "가수",
  "composer": "작곡가",
  "year": 2024,
  "aliases": ["다른 표기"],
  "sourceUrl": "https://example.org/recordings/song",
  "introStartSeconds": 0,
  "highlightStartSeconds": 45
}
```

```powershell
# 검사 후 로컬 클립·카탈로그 생성
npm run song-guess:ingest -- "C:\Music" --apply
# 대상 DB·비공개 저장소 환경을 주입한 셸에서 DB까지 등록
npm run song-guess:ingest -- "C:\Music" --apply --register
```

검토 항목이 하나라도 있으면 전체 적용을 중단합니다. 기본 출력은
`.codex/artifacts/song-guess-ingest/`이며 `--output <폴더>`로 변경할 수 있습니다.
출력은 입력 음악 폴더 밖에 두고, 같은 출력 폴더에 동시 실행하지 않습니다.
`catalog.json`은 누적 로컬 카탈로그, `batch.json`은 이번 등록 대상만 포함합니다.
DB 등록은 기존 sync 도구를 사용해 메타데이터를 upsert하고, 클립 해시가 같으면
재업로드를 생략합니다. 실패 후 같은 명령으로 재실행할 수 있지만 DB 전체 배치는
단일 트랜잭션이 아닙니다. 운영 등록 전 아래 환경 관련 주의사항에 따라 대상 연결을 확인합니다.


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
