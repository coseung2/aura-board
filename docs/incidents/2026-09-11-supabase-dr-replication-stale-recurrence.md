# 2026-09-11 Supabase DR logical replication stale recurrence

| 항목 | 내용 |
|---|---|
| severity | high (DR 보호 기능 미가용, production 영향 없음) |
| 발생 | 2026-09-02 이후 subscription 중단, 2026-09-11 Gmail watchdog 알림으로 조사 |
| 상태 | resolved (2026-09-11 22:54 KST) |
| 영향 | `aura-board-dr.vercel.app/api/health`가 HTTP 503과 `replication: stale`을 반환했다. Production 트래픽, production DB, DNS에는 영향이 없었다. |

## 증상과 원인

- Supabase DR 프로젝트와 Vercel 배포는 정상 상태였지만, subscription `aura_board_oracle_dr`가 `disable_on_error=true`로 자동 중단되어 heartbeat가 갱신되지 않았다.
- Oracle publication에는 178개 relation이 있었고 DR에는 새 `SongGuessCatalogSong`, `SongGuessCatalogClip` table이 없었다.
- 두 table을 추가한 뒤 catch-up을 재개하자 다음 WAL의 `SongGuessAsset` relation이 DR보다 세 column 많았다: `roundId`, `youtubeVideoId`, `playbackStartMs`.
- 직접 원인은 logical replication이 DDL을 복제하지 않는 상황에서 source migration을 DR에 먼저 적용하는 절차가 누락된 schema drift다.
- 복구 전 apply error 19회와 sync error 1회는 fail-closed subscription의 진단 재시도 기록이다. 복구 후 추가 증가하지 않았다.

## 조치

- DR에 `SongGuessCatalogSong`, `SongGuessCatalogClip`을 source migration과 같은 column, index, foreign key, RLS, grant 계약으로 생성하고 publication을 `copy_data=false`로 refresh했다.
- DR `SongGuessAsset`에 `youtubeVideoId`, `playbackStartMs`를 추가하고 tier, duration, MIME, size, YouTube check constraint를 source migration과 맞췄다. 기존 `roundId` foreign key와 unique index도 확인했다.
- subscription을 항상 `disable_on_error=true`로 유지한 채 재활성화하고 누적 WAL을 끝까지 적용했다.
- 신규 catalog table은 publication 추가 전 source에 적재된 row가 WAL 경계 밖에 있어 별도 snapshot으로 채웠다. 이후 subscription을 다시 연결하고 178 relation 전체를 ready 상태로 확인했다.
- DR 승격, traffic/DNS 변경, failover는 수행하지 않았다.

## 복구 검증

- Subscription: enabled, `disable_on_error=true`, 178/178 relations `ready`.
- Replication receiver: active PID 존재, `received_lsn`과 `latest_end_lsn` 일치.
- Heartbeat age: 8초 이내, 이후 매분 갱신.
- 주요 source/DR row count 일치:
  - `SongGuessAsset`: 20
  - `SongGuessGame`: 1
  - `SongGuessRound`: 20
  - `SongGuessCatalogSong`: 694
  - `SongGuessCatalogClip`: 996
- Vercel DR health: HTTP 200, `database=reachable`, `replication=fresh`.
- GitHub DR watchdog run `34606976935`: success.
- Git synchronization: local `main` and `origin/main` are both `0c79e6ffdd97ef90765827158af24570852099fe` (ahead 0, behind 0).

## 후속 migration 적용

- 2026-09-11 23:58 KST에 `20260908120000_song_guess_round_artist`와 `20260908160000_song_guess_teacher_import`를 DR에 먼저 적용한 뒤 Oracle source에 적용했다.
- Source `SongGuessImport`에는 replication role `SELECT`를 부여하고 `aura_board_dr_pub`에 추가했다. DR subscription publication을 `copy_data=false`로 refresh했다.
- Source Prisma migration ledger의 두 checksum을 repository migration SQL의 SHA-256과 일치시켰다.
- Source/DR 모두 `SongGuessRound.artist`와 `SongGuessImport`가 존재하고, 신규 table row count는 양쪽 모두 0이다.
- Subscription은 enabled, `disable_on_error=true`, 179/179 relation `ready`, heartbeat fresh 상태다. 기존 apply error 19/sync error 1 카운터는 증가하지 않았다.
- Vercel DR health는 HTTP 200이며 GitHub DR watchdog run `34613327807`이 성공했다.
- 로컬 `infisical run --env=prod -- npm run db:migrate` 검증은 legacy managed-Supabase pooler credential이 만료되어 P1000으로 실패했다. 실제 Oracle migration ledger와 schema는 Bastion 내부 PostgreSQL에서 직접 검증했다.

## 예방과 후속 조치

- 새 table이나 replicated table의 column 변경은 DR DDL 선적용, source migration, publication refresh, catalog parity, row-count 검증 순으로 실행한다.
- migration 배포 절차에 source publication과 DR schema의 relation/column parity 검사를 추가한다.
- Watchdog failure가 발생하면 Supabase/Vercel 관리 상태만 확인하지 말고 subscription enabled 상태, apply error 증가, publication relation 수, heartbeat freshness를 함께 확인한다.
- 후속 migration부터 같은 순서와 검증을 반복하고, 일반 `prod:/`의 legacy managed-Supabase DB URL은 Oracle 운영 연결 정보와 혼동되지 않도록 별도로 정리한다.
