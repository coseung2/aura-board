# 2026-08-29 Supabase DR logical replication stale

| 항목 | 내용 |
|---|---|
| severity | high (DR 보호 기능 미가용, production 영향 없음) |
| 발생 | 2026-08-20 17:55 UTC 이후 heartbeat 미갱신 확인 |
| 상태 | resolved (2026-08-30 02:54 UTC) |
| 영향 | `aura-board-dr`의 `/api/health`가 HTTP 503과 `replication: stale` 반환. Production 트래픽과 production DB는 영향 없음. |

## 증상

- Supabase `aura-board-dr`가 일시 중지 상태였고 restore 후 관리 상태는 `ACTIVE_HEALTHY`가 됨.
- Vercel DR 최신 production deployment는 `Ready`이며 stable alias도 최신 배포를 가리킴.
- Vercel health 응답은 `database: reachable`, `replication: stale`.
- DR heartbeat의 마지막 `source_commit_at`은 `2026-08-20T17:55:00.007Z`.

## 근본 원인

- DR project restore 뒤 subscription `aura_board_oracle_dr`가 disabled 상태로 남아 있었다.
- production cutover 뒤 `supabase-db`가 base compose만으로 재생성돼 nginx upstream인 `127.0.0.1:15433` port mapping이 사라졌다. 외부 TLS/ALPN은 성공했지만 nginx가 PostgreSQL backend에 연결하지 못했다.
- 기존 slot `aura_board_oracle_dr_slot`은 current `postgres`가 아니라 `postgres__aura_rollback` DB에 묶여 있었다. 단순 재활성화로는 cutover 이후 변경을 복구할 수 없었다.
- DR에는 source의 최신 4개 Prisma migration과 8개 publication table이 없었고, 새 source tables에 replication role `SELECT` grant도 누락돼 initial copy가 한 번 중단됐다.
- Infisical DR DB URL은 이전 password로 stale했고 Vercel Sensitive env와 불일치했다.

## 조치

- Bastion keeper의 실제 session metadata와 VM 전용 SSH key를 분리해 Oracle private SSH를 복구했다.
- `docker-compose.replication.yml`로 `supabase-db`만 재생성해 `127.0.0.1:15433`을 복원하고, root-owned `.env`의 `COMPOSE_FILE`에 override를 영구 포함했다.
- stale DR 168 tables/148,994 rows를 임시 snapshot한 뒤 missing migration 4개를 DR에 적용했다.
- current `postgres`에 v2 logical slot을 만들고 publication table 176개 전체의 replication-role `SELECT`를 보장했다.
- DR publication relations를 초기화하고 176 tables를 full initial copy한 뒤 WAL catch-up을 완료했다. acceptance 후 rollback-bound old slot, empty publication, 임시 snapshot을 제거했다.
- DR DB password를 회전하고 Infisical `prod:/dr/aura-board`와 Vercel production `DATABASE_URL`/`DIRECT_URL`을 값 비노출로 동기화한 뒤 production redeploy했다.
- public SSH 개방, DR 승격, production 트래픽 전환, DNS 변경, 무계획 전체 재동기화는 수행하지 않음.

## 재발 방지

- Bastion keeper가 비특권으로 loopback `15433` listener/TCP를 검사하고, DR watchdog이 current v2 slot을 통한 heartbeat freshness를 검사한다.
- migration `20260830113000_restore_dr_replication_contract`가 publication tables의 bounded replication-role `SELECT`를 다시 보장한다.
- Supabase DR control-plane은 `npm run supabase:dr -- ...` wrapper와 Infisical `SUPABASE_ACCESS_TOKEN_DR`만 사용한다.

## 검증 근거

- Source slot `aura_board_oracle_dr_slot_v2`: current `postgres`, active; DR connection 1.
- Subscription: enabled, 176/176 relations `ready`, apply errors 0.
- Source/DR migration history 146/146, 176-table row counts exact, mismatch 0.
- Vercel deployment `dpl_CiNbYJYtybN5GuCTef7FXYwVfAfv`: production `READY`, alias `aura-board-dr.vercel.app`.
- DR health: HTTP 200, `database=reachable`, `replication=fresh`.
- GitHub DR watchdog runs `33288417948` and `33288982785`: success.
