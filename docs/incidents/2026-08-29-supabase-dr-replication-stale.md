# 2026-08-29 Supabase DR logical replication stale

| 항목 | 내용 |
|---|---|
| severity | high (DR 보호 기능 미가용, production 영향 없음) |
| 발생 | 2026-08-20 17:55 UTC 이후 heartbeat 미갱신 확인 |
| 상태 | investigating |
| 영향 | `aura-board-dr`의 `/api/health`가 HTTP 503과 `replication: stale` 반환. Production 트래픽과 production DB는 영향 없음. |

## 증상

- Supabase `aura-board-dr`가 일시 중지 상태였고 restore 후 관리 상태는 `ACTIVE_HEALTHY`가 됨.
- Vercel DR 최신 production deployment는 `Ready`이며 stable alias도 최신 배포를 가리킴.
- Vercel health 응답은 `database: reachable`, `replication: stale`.
- DR heartbeat의 마지막 `source_commit_at`은 `2026-08-20T17:55:00.007Z`.

## 확인된 원인 범위

- Vercel 빌드 실패가 아님. 최신 배포는 `Ready`.
- Supabase DR DB와 pooler 연결은 정상.
- Oracle 인스턴스는 `RUNNING`이고 Cloud Agent는 활성 설정이나, Bastion 포트포워딩 SSH와 managed SSH 모두 대상 TCP 22 연결 단계에서 종료됨.
- OCI Run Command는 생성되었으나 인스턴스 실행 결과가 갱신되지 않음.
- 따라서 Oracle 내부 replication service/timer, PostgreSQL subscription/slot, heartbeat job의 실제 상태는 아직 확인하지 못함.

## 조치

- Supabase DR project restore 수행.
- DR DB credential을 재설정하고 Infisical DR scope 및 Vercel `DATABASE_URL`/`DIRECT_URL`을 동기화.
- 새 Vercel production deployment로 반영하고 DB pooler 직접 연결 성공 확인.
- Bastion managed SSH와 serial console 연결을 점검했으며, 임시 세션·키·메타데이터는 정리함.
- public SSH 개방, DR 승격, production 트래픽 전환, DNS 변경, 무계획 전체 재동기화는 수행하지 않음.

## 다음 조치

1. OCI 인스턴스 콘솔에서 `sshd`, `oracle-cloud-agent`, host firewall 상태 확인.
2. Oracle 내부 logical replication service/timer와 PostgreSQL subscription/slot 확인.
3. 원인에 따라 heartbeat job 또는 replication worker만 복구.
4. heartbeat가 허용 연령 내로 갱신되는지 확인.
5. Vercel `/api/health` HTTP 200 및 `replication: fresh`, GitHub DR watchdog green 확인.

## 검증 근거

- Vercel deployment: 최신 deployment `Ready` 확인.
- DR REST API: HTTP 200.
- DR pooler: `SELECT 1` 성공.
- DR health: 현재 `database=reachable`, `replication=stale`.
- OCI instance: `RUNNING`.
