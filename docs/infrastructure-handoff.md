# 4-provider infrastructure handoff

기준일: 2026-08-08
기준 브랜치: `main` (2026-08-08 실행 기준)

이 문서는 Oracle Cloud, Cloudflare, Supabase, GitHub Actions의 책임 경계와 후속 실행 순서를 기록한다. **Oracle A1에서 Aura Board 애플리케이션과 private play engine을 운영하고 있으며, 2026-08-08 Cloudflare DNS와 HTTPS origin을 실제 `testauram-a1-osaka` 인스턴스에 맞게 현행화했다. 2026-08-14 backup 인프라 복구(버킷·IAM·env·pg_dump 17·OCI CLI) 후 실제 backup write와 격리 restore rehearsal을 통과해 `aura-supabase-backup.timer`가 활성 상태로 운영 중이다.** 아래 체크박스는 실제 실행자가 증거를 확인한 뒤에만 갱신한다.

## 책임과 경계

| 제공자 | 책임 | 책임이 아닌 것 | 현재 상태 |
| --- | --- | --- | --- |
| Oracle Cloud | Next.js 앱 호스팅, private play engine, 앱 cron, 장기 FFmpeg 작업, 배치 메일, Supabase 논리 백업 | 원본 Postgres, Auth, Realtime, 원본 Storage | `ap-osaka-1`의 `testauram-a1-osaka` A1을 2026-08-19 4 OCPU/24 GB로 resize하고 on-host에서 `aarch64`, 4 online CPUs, 23 GiB visible RAM을 재검증. nginx와 loopback 전용 앱 서비스를 운영하며 public IP는 `129.225.159.251`; daily backup timer active |
| Cloudflare | 운영 DNS·HTTPS proxy, Stream 비디오 업로드·재생 및 상태 검증/삭제 수명주기 | 일반 파일·이미지 저장소, R2 | `aura-board.com` apex A와 `www` CNAME을 Oracle origin으로 proxied 운영. Stream UID·상태·ownership 검증과 best-effort 삭제 보강 완료. R2는 도입하지 않음 |
| Supabase Pro (Seoul) | Postgres, Auth, Realtime, 일반 파일·이미지 Storage, `NotificationOutbox`, `pg_net`, `pg_cron` | Cloudflare Stream 비디오, Oracle 작업 실행 환경 | 운영 사용 중. `20260731` 마이그레이션 5개를 2026-08-01 적용하고 RLS·권한·함수·트리거·cron job을 검증함 |
| Supabase Free (DR) | 논리 replica, DR용 Postgres·PostgREST·RLS·Realtime warm standby | Oracle primary write path, 자동 promotion, object payload(별도 acceptance gate) | 이번 DR 범위에 포함했지만 schema/RLS parity, replication, 서비스 health, object availability 증거는 아직 기록하지 않음 |
| GitHub Actions | 운영 cron endpoint 수동 실행과 장애 시 대체 호출 | 앱 호스팅, 기본 스케줄러 | 8개 endpoint용 수동 workflow를 비상 운영 경로로 유지 |
| Vercel | 전환 기간의 마지막 검증 가능한 배포본, Supabase Free warm standby용 DR runtime | Oracle primary의 신규 운영 트래픽, 기본 cron scheduler | 평상시 운영 DNS와 scheduler에서는 제외. DR deployment·health는 준비/검증 대상이며 아직 증거 없음 |

책임 이전 후에도 cron API의 인증 기준은 [`src/lib/cron-auth.ts`](../src/lib/cron-auth.ts)이며, GitHub Actions와 Supabase callback 모두 동일한 `CRON_SECRET`을 Bearer token으로 사용한다.

## 현재 상태와 확인된 기준선

### 2026-08-08 Oracle 운영 origin 현행화 완료

- `aura-board.com`의 proxied A record는 `129.225.159.251`, `www.aura-board.com`은 apex를 가리키는 proxied CNAME이다. 두 운영 도메인의 Cloudflare 경유 HTTPS `/api/health`가 `200`과 `database: reachable`을 반환하며 Vercel origin header는 없다.
- 실제 운영 인스턴스는 `testauram-a1-osaka` (`RUNNING`, private IP `10.42.1.207`, public IP `129.225.159.251`)다. 문서에 남아 있던 `aura-board-worker-a1-osaka`/`161.33.30.33`은 더 이상 현재 DNS origin이 아니다.
- Next.js 앱은 `aura-board-app` systemd 서비스로 `127.0.0.1:3000`에서, Rust play engine은 `aura-play-engine` 서비스로 `127.0.0.1:8081`에서만 수신한다. `nginx`, 두 앱 서비스, `certbot.timer`를 모두 active로 재검증했다.
- 현재 `/opt/aura-board-app/current`는 release `73cccdd02a919fc4a6f97d03c1af0f5bad6ada59`를 가리킨다.
- Tailscale이 자체 주소의 `443`을 사용하므로 nginx HTTPS는 Oracle private NIC `10.42.1.207:443`에 명시적으로 bind한다. HTTP는 `0.0.0.0:80`에서 ACME challenge와 HTTPS redirect를 처리한다.
- Let's Encrypt ECDSA 인증서는 `aura-board.com`과 `www.aura-board.com`을 포함하며 2026-11-06까지 유효하다. `certbot renew --dry-run`, `nginx -t`, origin 직접 HTTPS 및 Cloudflare proxied HTTPS 검증을 통과했다.
- `/api/health`의 외부 경로와 origin 직접 경로 모두 데이터베이스 연결 성공을 반환했고, `/login`, `/landing`, Google OAuth provider callback URL을 운영 도메인 기준으로 확인했다.
- 애플리케이션 cron은 `/etc/cron.d/aura-board-app`에서 Oracle loopback endpoint를 호출한다. `notification-push`와 `play-outbox`의 매분 자동 실행 및 세션 정상 종료를 확인했다.
- Vercel Cron Jobs는 프로젝트 설정에서 `Disabled`로 전환했다. Vercel은 운영 DNS와 기본 scheduler 경로에서 제외되며, 기존 배포본은 rollback 참고용으로만 남긴다.
- `aura-board-app`, `aura-play-engine`, `nginx`, `cron`, `certbot.timer`, `aura-supabase-backup.timer`는 모두 enabled/active 상태다.
- 위 2026-08-03 서비스 상태는 구 A1의 당시 증거다. 2026-08-08 새 운영 A1에서는 `cron`은 active지만 `aura-supabase-backup.timer`는 inactive로 확인됐다. 2026-08-14 backup 복구 검증(아래 Update log row 참조) 후 timer는 active다.

- Supabase 운영 DB: 약 **43.9 MiB**.
- Supabase Storage: **1,226 objects**, 약 **992.4 MiB**.
- Vercel Blob: distinct URL **4개**.
- `BlobDeletionQueue`: due **165개**. 구현은 [`src/lib/blob-cleanup.ts`](../src/lib/blob-cleanup.ts), 모델은 [`prisma/schema.prisma`](../prisma/schema.prisma), API는 [`src/app/api/cron/blob-cleanup/route.ts`](../src/app/api/cron/blob-cleanup/route.ts)에 있다.
- `main` 기준 이전 8개 커밋은 `80183f55`까지 push 완료.
- 기존 Vercel production은 rollback 참고용으로 유지하지만 신규 운영 트래픽과 cron을 처리하지 않는다.
- Oracle schedule은 `parent-weekly-digest`, `parent-anonymize`, `expire-pending-links`, `fd-maturity`, `role-salary-payout`, `billing-renew`, `blob-cleanup`, `attendance-reminder`, `notification-push`, `play-outbox`를 실행한다.
- 현재 운영 OCI profile은 `testauram`, 홈 리전은 `ap-osaka-1`이다. 운영 인스턴스 `testauram-a1-osaka`는 root compartment의 `VM.Standard.A1.Flex`이며 2026-08-19 on-host에서 4 online CPUs와 23 GiB visible RAM을 확인했다. 같은 날 100 GB paravirtualized Block Volume을 `/srv/aura-board`에 ext4로 마운트하고 Docker/containerd 및 self-hosted Supabase staging 데이터를 이 볼륨으로 분리했다. public SSH는 운영 점검 시 외부에서 닫힌 상태였고 관리 경로는 OCI Bastion을 사용한다.
- 2026-08-03에 검증한 구 `aura-board-worker-a1-osaka`와 `161.33.30.33` 관련 backup/IAM 증거는 당시 기록으로만 보존한다. 2026-08-08 DNS 및 웹 origin 기준선은 `testauram-a1-osaka`의 `129.225.159.251`이다.
- A1 성공 검증 직후 `oci-a1-1` 용량 retry automation은 삭제되어 재실행되지 않는다.
- `notification-push`는 Oracle의 매분 poller가 담당한다. Supabase `NotificationOutbox` insert event wakeup과 5분 retry sweep 계약은 [`src/app/api/cron/notification-push/HANDOFF.md`](../src/app/api/cron/notification-push/HANDOFF.md)에 남아 있지만, 외부 callback secret이 없더라도 Oracle poller가 backlog를 처리한다.
- `role-salary-payout`은 `155c7c54`에서 구현·push됐지만 production에는 아직 배포되지 않았고 scheduler도 없다. 2026-08-01 로컬 코드와 운영 DB를 연결한 별무리반 제한 검증에서 24명·16역할·26,300 지급, 동일 키 재호출 차단, 24건 보상 거래 회수와 잔액 원복을 확인했다. 이 테스트로 별무리반의 `2026-08` 자동지급 키는 소비됐으며 다음 정상 자동지급 기간은 2026-09다.
- Cloudflare Stream 진입점은 [`src/lib/event/cfstream.ts`](../src/lib/event/cfstream.ts)와 [`src/app/api/event/video-upload-url/route.ts`](../src/app/api/event/video-upload-url/route.ts)다.
- 일반 파일·이미지는 Supabase Storage가 기준이며 관련 구현은 [`src/lib/media-storage.ts`](../src/lib/media-storage.ts)와 [`src/app/api/upload/route.ts`](../src/app/api/upload/route.ts)다. Vercel Blob 잔여분 이전 도구는 [`scripts/migrate-vercel-blob-to-supabase.ts`](../scripts/migrate-vercel-blob-to-supabase.ts)다.

### 운영 적용 마이그레이션

다음 5개는 2026-08-01 운영 논리 backup을 확보한 뒤 `prisma migrate deploy`로 순서대로 적용했다. 임의 down migration 대신 forward-fix 또는 검증된 backup 복구 절차를 사용한다.

1. [`20260731120000_billing_idempotency_and_webhook_inbox`](../prisma/migrations/20260731120000_billing_idempotency_and_webhook_inbox/migration.sql)
2. [`20260731130000_durable_notification_outbox`](../prisma/migrations/20260731130000_durable_notification_outbox/migration.sql)
3. [`20260731140000_blob_cleanup_leases`](../prisma/migrations/20260731140000_blob_cleanup_leases/migration.sql)
4. [`20260731150000_notification_outbox_supabase_wakeup`](../prisma/migrations/20260731150000_notification_outbox_supabase_wakeup/migration.sql)
5. [`20260731160000_deprecate_drawing_board`](../prisma/migrations/20260731160000_deprecate_drawing_board/migration.sql)

## Secret 및 env 이름

값은 이 문서, commit, workflow log에 기록하지 않는다. 실제 저장 위치와 접근 권한은 각 제공자에서 관리한다.

| 위치 | 이름 |
| --- | --- |
| Infisical `prod` `/` | `CRON_SECRET`, `AURA_BOARD_BASE_URL` |
| GitHub Actions | Infisical OIDC identity와 project slug만 workflow에 기록하며 장기 secret은 저장하지 않음 |
| Vercel/server | `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL` |
| Supabase/client·server | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `AURA_STORAGE_BUCKET` |
| Supabase Vault | `notification_outbox_worker_url`, `notification_outbox_worker_secret` |
| Cloudflare Stream | `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN` |
| Oracle backup worker | `DATABASE_URL`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`, `OCI_OBJECT_PREFIX`, `OCI_REGION` |
| Vercel Blob 잔여 이전 시에만 | `BLOB_READ_WRITE_TOKEN` |

GitHub environment의 정확한 이름은 `Production`이며 environment 자체는 이미 존재한다. GitHub에 `CRON_SECRET`이나 앱 URL을 복제하지 않고, `id-token: write`로 발급된 단기 GitHub OIDC token을 Infisical 전용 identity와 교환해 `prod` `/`의 두 값을 실행 중에만 주입한다. identity는 `Production` environment, `main`, `cron-jobs.yml`, `coseung2/aura-board`에 한정하며 project role은 `viewer`, access token TTL은 900초다.

`AURA_BOARD_BASE_URL`은 운영 HTTPS 앱 오리진이며 Infisical 기준값은 `https://aura-board.com`이다. `CRON_SECRET` 값 자체는 문서나 log에 기록하지 않는다. Oracle 앱과 Supabase Vault의 callback secret은 항상 동일하게 유지하고, 기존 credential 값을 문서에 복사하지 않는다.

## 단계별 실행 계획

각 단계는 작은 단위로 구현하고 **commit → push → 검증 → 이 handoff 갱신** 순서를 지킨다. 체크박스는 commit hash, workflow run, SQL 결과 등 확인 가능한 증거가 있을 때만 완료 처리한다.

### 0. 기준선 고정 — 완료

- [x] Commit/push: 이전 8개 commit을 `main`의 `80183f55`까지 push.
- [x] Verification: 운영 용량과 잔여 queue 수치, 기존 production 유지 상태를 기록.
- [x] Handoff: 4-provider 책임 경계와 운영 미변경 원칙을 이 문서에 기록.

### 1. GitHub Actions cron workflow 준비 — `14bb101a` push 완료

[`vercel.json`](../vercel.json)의 일반 일/주간 cron 7개를 개별 호출할 수 있는 `workflow_dispatch` 전용 workflow를 [`.github/workflows`](../.github/workflows/)에 먼저 추가한다. 이 단계에서는 `schedule`을 넣지 않아 push만으로 운영 endpoint가 호출되지 않게 한다. 각 요청은 HTTPS production base URL과 해당 path를 조합하고 `Authorization: Bearer` header를 사용해야 한다. timeout, non-2xx 실패, 동시 실행 중복을 명시적으로 처리한다. `/api/cron/notification-push`는 이 workflow에 포함하지 않는다.

- [x] Commit: workflow와 문서 변경을 `14bb101a` (`ci(cron): add manual production dispatcher`)로 작성.
- [x] Push: `14bb101a`를 `main`에 push하고 GitHub 반영을 확인.
- [x] Verification: [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml)의 구문, 7개 path와 호출 메서드, `schedule` 부재, `notification-push` 제외, secret 값 미출력을 정적으로 대조. 실제 운영 호출은 승인된 cutover 전에는 실행하지 않음.
- [x] Handoff: workflow 경로, 무예약 상태, 기본 dry-run 원칙, 정적 검증 결과와 구현 SHA `14bb101a`를 Update log에 기록.

### 2. Supabase 마이그레이션 적용 준비 및 승인 — `3cd8837e` push 완료

5개 migration SQL을 순서대로 검토하고 [`docs/verification-checklist.md`](verification-checklist.md)의 Prisma/production 기준을 따른다. 이 단계의 준비 commit은 코드 검증과 runbook 보완만 포함한다. 운영 DB 적용은 별도 승인 작업이다.

- [x] Commit: `TossWebhookEvent`와 `BlobDeletionQueue`의 `anon`/`authenticated` 권한 회수 및 회귀 검증을 `3cd8837e` (`security(supabase): lock down internal queue tables`)로 작성.
- [x] Push: `3cd8837e`를 `main`에 push하고 대상 SHA를 고정.
- [x] Verification: 5개 migration의 순서·스키마 일치, RLS/revoke, `SECURITY DEFINER` 권한, extension no-op, `cron.schedule`/`cron.unschedule`, 165개 due queue의 25건 claim 상한과 참조 검사를 정적으로 감사. Prisma validate와 migration/consumer/cron targeted test를 통과했으며 운영 SQL은 실행하지 않음.
- [x] Handoff: 5개 모두 운영 미적용 상태를 유지하고, 실제 변경은 서버 전용 두 테이블의 Data API 권한 회수뿐임을 기록.

### 3. NotificationOutbox를 Supabase wakeup으로 cutover

[`src/app/api/cron/notification-push/HANDOFF.md`](../src/app/api/cron/notification-push/HANDOFF.md)의 순서를 단일 source로 사용한다. `pg_net` event callback과 `pg_cron` 5분 sweep을 먼저 검증하고, 그 뒤에만 Vercel의 매분 `/api/cron/notification-push` 항목을 제거한다. route와 outbox consumer는 유지한다.

- [ ] Commit: production 검증 성공 후 `vercel.json`에서 `notification-push` schedule만 제거하는 commit 작성.
- [ ] Push: 제거 commit push. 수동 Vercel 배포는 하지 않음.
- [ ] Verification: POST callback `200`, insert 후 outbox 처리, 5분 retry sweep, 중복 wakeup 안전성, backlog/dead rows 확인.
- [ ] Handoff: Supabase job/trigger 상태, 검증 시각, commit SHA, 실제 배포 상태를 기록.

### 4. GitHub Actions cron cutover

기존 Vercel 일반 cron 7개와 신규 `role-salary-payout`, 총 8개 endpoint의 dry-run/승인 검증 후 별도 commit에서 GitHub Actions `schedule`을 추가한다. `role-salary-payout`은 production route 배포와 `Production` environment의 `CRON_SECRET`/`AURA_BOARD_BASE_URL` 설정을 먼저 확인해야 한다. 동일 schedule이 Vercel과 동시에 실행되는 기간은 endpoint별 idempotency를 확인한 제한된 관찰 구간으로만 둔다. 검증 완료 전 Vercel schedule을 제거하지 않는다.

- [ ] Commit: 검증된 7개 Vercel cron 항목 제거와 문서 갱신을 별도 commit으로 작성.
- [ ] Push: 제거 commit push. 자동 배포 결과만 관찰하고 수동 배포하지 않음.
- [ ] Verification: 각 endpoint의 최근 GitHub run, HTTP status, application log, 중복 실행 부작용 없음 확인.
- [ ] Handoff: endpoint별 마지막 성공 run과 Vercel schedule 제거 여부 기록.

### 5. Cloudflare Stream 수명주기 보강 — `cb49da46` push 완료

Stream 업로드 완료/실패 상태를 검증하고, 앱 레코드 삭제 시 Cloudflare asset 삭제가 재시도 가능한 형태로 이어지도록 설계·구현한다. 일반 파일·이미지를 Stream에 넣지 않으며 R2를 추가하지 않는다.

- [x] Commit: 상태 검증, 보드 단위 ownership, 삭제 수명주기 변경과 테스트를 `cb49da46` (`feat(cloudflare): harden Stream video lifecycle`)로 작성.
- [x] Push: `cb49da46`를 `main`에 push하고 배포 대상 SHA를 기록. 수동 배포는 하지 않음.
- [x] Verification: direct upload의 `maxDurationSeconds`, UID 형식과 응답 일치, 보드 creator/meta ownership, ready/encoding/error/pending 상태, API 오류 redaction, delete 404 idempotency, DB 삭제 후 Stream cleanup 성공/실패를 검증. 전체 1,251 tests와 typecheck 통과 후, 부모 리뷰 보강까지 포함한 targeted 48 tests와 typecheck를 다시 통과.
- [x] Handoff: Cloudflare는 Stream video-only로 유지하고 R2는 추가하지 않음. cleanup 실패는 DB 삭제를 되돌리지 않고 식별자만 로그에 남기며, 자동 orphan queue는 아직 없음.

### 6. Oracle 애플리케이션·워커 운영 — 논리 백업 및 앱 런타임

OCI 인증, compartment, compute/runtime, 네트워크 egress, 로그/모니터링을 먼저 확정한다. 이후 장기 FFmpeg, 배치 메일, Supabase 논리 backup pull을 각각 독립 systemd job·사용자·작업 디렉터리로 분리한다. A1 한 대에서는 처음부터 무거운 작업을 병렬 실행하지 않고 backup → batch mail → FFmpeg 순서로 하나씩 이관하며 측정 후에만 동시성을 늘린다. Oracle에는 원본 DB나 원본 Storage를 만들지 않으며 backup은 암호화, 보존 기간, 복구 시험을 갖춘 파생 사본으로만 취급한다.

- [x] Commit: 오사카 A1 2 OCPU/12 GB의 첫 작업으로 Supabase logical backup script, systemd unit/timer, env template, runbook을 독립 commit `6ebe78d8`로 작성.
- [x] Push: `6ebe78d8`을 `main`에 push. 이후 실제 A1 실행 증거는 아래 `2026-08-03` handoff row에 기록.
- [x] Verification: script 구문, 외부 접근 없는 기본 dry-run, 오사카 리전 고정, instance principal·checksum·no-overwrite, private temp cleanup, systemd hardening과 설치 경로를 정적으로 검증. 실제 A1에서 ARM64 native binary, IAM/bucket/DB 연결, backup/restore rehearsal까지 후속 검증 완료.
- [x] A1의 backup, batch mail, FFmpeg 작업을 systemd 단위와 자원 제한으로 격리하고 ARM64 호환성을 검증함.
- [x] A1 runtime preparation: backup unit에 150% CPU·1.5/2 GB memory envelope를 추가하고, video thumbnail backfill을 기본 dry-run/명시적 `--write`, exact Supabase origin+bucket allowlist, redirect/local/internal source 차단, streaming temp file, 1 GiB source cap, download/FFmpeg timeout, 64 MiB frame cap, 부분 실패 non-zero 종료로 보강. 두 unit은 공유 nonblocking `flock`을 사용하고 수동 video unit은 초기 concurrency 1, 180% CPU·6/8 GB memory envelope, timer/install target 없음.
- [x] A1 runtime implementation: 위 script/tests/systemd/tmpfiles/env/runbook 변경을 `450c62b4` (`feat(oracle): prepare A1 media worker`)로 `main`에 push. targeted Vitest 61/61, `npm run typecheck`, `bash -n infra/oracle/backup-supabase.sh`, `git diff --check`를 통과했고 A1에는 ARM64 네이티브 runtime과 root-owned Infisical env를 설치함.
- [x] A1 runtime verification: 실제 ARM64 호스트에서 systemd unit verify와 Node 22/PG17/FFmpeg/OCI CLI native binary를 확인. backup dry-run, approved `--write` 1회(archive `supabase-20260803T085532Z-070b540b-2d55-40b4-94a5-84dd3aa741c3`), checksum/upload/head, vault secret schema를 제외한 199개 table의 격리 restore rehearsal, video unit 0건(`write=true`, `scanned=0`, `updated=0`, `failed=0`)을 완료하고 그 뒤 backup timer만 활성화함. oneshot cgroup의 종료 후 `MemoryPeak/CPUUsageNSec`는 제공되지 않아 accounting을 두 unit에 추가했으며 다음 실행에서 측정함.
- [x] 2026-08-14 testauram A1 backup 복구 검증: 버킷 `aura-board-postgres-backups`(private) 생성, 인스턴스 OCID 동적 그룹 `aura-board-a1-instances`와 버킷 스코프 정책 `aura-board-backup-policy`, Object Storage 서비스 주체 lifecycle 정책(30일 보존, prefix `aura-board/postgres`) 적용. `/etc/aura-board/oracle-backup.env` 네임스페이스를 `ax6lnwsc3kt3`으로 교체, pg_dump 17.11(서버 17.6)과 시스템 전역 OCI CLI 3.90.2 설치. 실제 backup 1회 성공(7,432,486 bytes + sha256, checksum 일치, `stage=success`). 격리 restore rehearsal: 1,868 archive entries, `--exit-on-error` 오류 0건, vault 스키마 제외 208 tables/2 views 복원(live 210 대비 pg_net 확장 테이블 2개 제외). timer active/enabled 유지.

### 7. Vercel Blob 잔여 정리와 안정화 — 이전 도구 준비 완료 (`f06d6a32`)

Vercel Blob distinct URL 4개와 due queue 165개를 재확인한다. Supabase Storage에 존재하고 참조가 전환됐음을 검증하기 전에는 원본을 삭제하지 않는다. [`scripts/migrate-vercel-blob-to-supabase.ts`](../scripts/migrate-vercel-blob-to-supabase.ts)는 검토 후 필요한 경우에만 사용한다.

- [x] Commit: Blob cleanup 참조 검사와 동일한 23개 모델·필드 커버리지, env-file opt-in, strict args/path 검증, import side-effect 제거와 write 실패 non-zero 처리를 `f06d6a32`로 작성.
- [x] Push: `f06d6a32`을 `main`에 push. 배포는 수행하지 않음.
- [x] Preparation verification: 외부 서비스·실제 env file 없이 전용 23 tests, typecheck, diff check 통과. 기본은 dry-run이며 `.env`/`.env.local`은 `--load-env-files`, 파일 복사와 DB 갱신은 `--write`를 명시해야만 활성화됨.
- [ ] Operational verification: cutover 승인 후 URL별 참조/대상 object, queue 처리·실패 재시도, 사용자 다운로드/이미지 표시를 확인. dry-run도 후보 검색을 위해 지정된 DB를 읽으므로 운영 실행 전에 연결 대상을 재확인.
- [x] Handoff: 이번 commit은 도구 준비만 수행했고 데이터 복사·참조 갱신·원본 삭제는 하지 않음. 처리 전후 object/URL/queue 수치와 원본 삭제 승인은 실제 실행 handoff에 별도로 기록.

### 8. Supabase Free + Vercel warm standby DR — 범위 포함, 미완료

이 DR 범위의 primary는 Oracle Osaka(`testauram-a1-osaka`)로 유지한다. 다만 production cutover가 별도 승인·검증되기 전까지는 현재 managed Supabase Pro가 production database source of truth라는 기존 사실을 유지한다. Supabase Free DB와 Vercel runtime은 평상시 사용자 트래픽을 받지 않는 warm standby이며 active-active 운영이 아니다.

Promotion은 수동 또는 반자동으로만 진행한다. 운영자가 Oracle primary의 write fence 또는 완전한 불가 상태를 확인하고 마지막 replication LSN/heartbeat를 기록한 뒤에만 DR subscriber를 promote하고, 그 후에 Cloudflare origin을 전환한다. split-brain을 막기 위해 Oracle과 DR을 동시에 writable로 두거나 장애 timeout만으로 자동 promotion·DNS 전환을 수행하지 않는다.

DB/API DR과 object payload 복제 또는 media degraded-mode는 별도 acceptance gate다. PostgREST·Realtime·앱 health가 통과해도 이미지·파일 payload가 Osaka 장애에서 사용 가능하다는 뜻은 아니다. payload 복제 또는 승인된 degraded-mode의 지원 범위·사용자 표시·복구 절차에 증거가 생기기 전에는 전체 DR을 accepted로 선언하지 않는다. Cloudflare Stream video는 기존 책임 경계를 유지하며 이 object gate와 별도로 취급한다.

운영 기준과 상세 설계는 [`docs/supabase-selfhost-dr.md`](supabase-selfhost-dr.md)를 참조하고, 아래 항목은 이 handoff와 [`docs/verification-checklist.md`](verification-checklist.md)의 공통 acceptance evidence로 사용한다. 각 증거에는 대상(project/endpoint), UTC 시각, commit/deployment SHA 또는 SQL/log artifact를 기록하고 secret 값은 기록하지 않는다. 현재는 모든 DR acceptance 항목이 미완료다.

- [ ] Schema/RLS parity: primary와 Supabase Free의 migration history, schema-only export/catalog 비교, table·column·index·sequence·extension·function·trigger·publication, role/grant, RLS policy를 대조하고 대표적인 허용/거부 RLS 요청 결과를 저장한다.
- [ ] Logical replication lag/heartbeat: publisher/subscriber 상태, 마지막 confirmed LSN과 commit timestamp, 측정 시각별 lag, primary heartbeat row가 DR에서 관찰된 시각, 승인된 RPO와 alert 기준을 함께 기록한다.
- [ ] PostgREST: DR endpoint에서 health와 대표 read/write를 확인하고, service-role 경로와 anonymous/share RLS 허용·거부 결과 및 HTTP status를 저장한다.
- [ ] Realtime: DR Realtime WebSocket join과 필요한 `postgres_changes`/Broadcast subscription을 연결하고, DR에서 발생한 실제 event의 수신·재연결 결과를 저장한다.
- [ ] Vercel deployment health: DR deployment ID/SHA, build 결과, runtime health(`/api/health` 등), Supabase Free 연결 결과, environment variable 이름의 존재 여부를 확인한다. 값과 secret은 남기지 않는다.
- [ ] Cloudflare origin switch: 승인된 변경 기록과 before/after DNS·proxy·TTL, Vercel DR로의 외부 HTTPS 응답, Oracle origin으로의 rollback 응답을 저장하고 두 origin이 동시에 사용자 write를 받지 않음을 확인한다.
- [ ] Failover smoke: primary write fence, promotion 시각, 마지막 LSN/heartbeat, Cloudflare 전환 시각을 기록한 뒤 로그인/공유·RLS/read-write/Realtime의 대표 사용자 흐름과 rollback 조건을 DR에서 검증한다.
- [ ] Failback rehearsal: DR을 임시 source of truth로 선언하고 clean Oracle target에 DR 데이터를 재동기화한 뒤 write freeze와 final delta를 적용하고 Oracle로 origin을 되돌린다. parity, health, 대표 CRUD, Realtime 및 소요 시간을 기록하고 Supabase Free warm standby 재구성까지 확인한다.
- [ ] Object availability gate: replicated payload의 object count/bytes와 표본 checksum·download를 확인하거나, degraded-mode를 선택했다면 지원/불지원 media, placeholder/error 동작, 사용자 영향, operator recovery 절차와 승인 기록을 남긴다. 이 gate가 없으면 DB/API 검증만으로 DR 완료 처리하지 않는다.

## 실제 실행 전 승인 체크

- [x] OCI Osaka의 compartment, VCN, public subnet/NSG, private Object Storage bucket은 준비 완료. A1 `2 OCPU/12 GB`, ARM64 instance와 boot volume, instance OCID 단일 dynamic group/IAM policy를 확인했고 유료 리소스는 만들지 않음.
- [x] A1에서 logical backup `--write` 1회, checksum/archive 확인, 격리 restore rehearsal을 마친 뒤 backup timer를 활성화함.
- [x] Infisical production scope `/oracle/aura-board/backup`과 `/oracle/aura-board/video-thumbnail`에 필요한 값을 분리 등록하고, 값 노출 없이 A1의 root-owned env files로 주입. video scope 이름은 `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`이며 transaction pooler `:6543`은 사용하지 않음.
- [x] Infisical `prod` `/`에 `CRON_SECRET`, `AURA_BOARD_BASE_URL`을 등록하고 로컬 backup을 갱신. 서버 프로젝트 전용 GitHub OIDC identity를 `viewer`로 연결. workflow 변경은 아직 local-only이며 별도 cutover 전에는 `schedule`을 추가하지 않음.
- [x] 운영 DB custom-format backup과 SHA-256/archive 구조를 확인한 뒤 5개 migration을 문서 순서대로 적용. Prisma 상태와 운영 SQL로 실제 객체·RLS·권한을 재검증함.
- [ ] OIDC workflow 변경을 push한 뒤 GitHub `Production` 수동 dry-run을 실행하고, 최신 앱 배포와 동일 `CRON_SECRET`을 확인한 후에만 승인된 non-dry-run을 실행.
- [ ] GitHub `Production` environment에 `CRON_SECRET`, `AURA_BOARD_BASE_URL`을 설정하고 수동 dry-run 결과를 확인. 별도 cutover 승인 전에는 `schedule`을 추가하지 않음.
- [ ] 운영 DB backup과 대상 Supabase 프로젝트/리전을 확인한 뒤 5개 migration을 문서 순서대로 적용. 부분 적용이나 임의 down migration 금지.
- [ ] Vercel Blob 이전 도구의 DB 연결 대상을 확인하고 먼저 dry-run으로 후보를 고정. `--write` 후 대상 object와 사용자 경로를 검증하기 전 원본 Blob과 queue 항목 삭제 금지.
- [ ] 앱 배포는 이 준비 작업과 분리하여 별도 승인·검증으로 진행.

## Rollback

- **GitHub Actions cron:** workflow를 disable하고 Vercel schedule이 아직 존재하는지 확인한다. 이미 제거했다면 해당 schedule만 복원하는 commit을 push한다. endpoint 구현과 `CRON_SECRET` 인증은 유지한다.
- **NotificationOutbox:** Supabase Vault의 callback secret을 비활성화해 event wakeup을 멈춘다. Vercel 매분 poller를 제거한 뒤라면 schedule을 복원한다. DB trigger/function 제거 절차는 [notification handoff](../src/app/api/cron/notification-push/HANDOFF.md#rollback)를 따른다. outbox table과 enqueue event는 삭제하지 않는다.
- **Supabase migration:** 적용 전 논리 backup과 migration별 영향 분석을 우선한다. 데이터 손실 가능성이 있는 migration을 임의 down migration으로 되돌리지 말고, forward-fix 또는 검증된 복구 절차를 선택한다.
- **Cloudflare Stream:** 새 상태 검증/삭제 worker를 중지하고 기존 업로드 경로로 복귀한다. 삭제된 asset은 코드 rollback으로 복원되지 않으므로 삭제 전 참조와 보존 조건을 확인한다.
- **Oracle:** 앱 이상 시 Cloudflare apex A record를 이전 Vercel origin `76.76.21.21`로 되돌리고 proxy를 유지한 뒤, nginx와 앱·play-engine 서비스를 이전 release로 되돌리거나 중지한다. `www`는 apex CNAME을 유지한다. 파생 backup 삭제는 별도 승인 대상이다.
- **Supabase Free + Vercel DR:** promotion 전 Oracle write fence와 replication evidence를 다시 확인한다. failover 중에는 Oracle을 writable로 복귀시키지 않으며, failback은 DR을 임시 source of truth로 유지한 채 clean Oracle target 재동기화·write freeze·final delta·Cloudflare 원복 순서로 수행한다. object payload gate를 통과하지 못하면 media degraded-mode 또는 복구 보류를 명시한다.
- **Vercel 배포:** 이번 작업에서는 배포하지 않는다. 향후 배포 실패 시 기존 production을 유지하고, 실패한 최신 SHA를 production으로 수동 승격하지 않는다.

## Residual risks

- OCI A1 `testauram-a1-osaka`는 Osaka `ap-osaka-1`에서 `RUNNING`이다. 단일 호스트이므로 앱과 job별 systemd 격리, ARM64 패키지 호환, 처리량과 backup 복구 시간을 지속 관찰한다.
- 서버에는 새 Oracle Ubuntu kernel이 설치되어 있으나 실행 중 kernel과 달라 재부팅이 남아 있다. 재부팅은 별도 유지보수 창에서 시행하고 nginx, 앱, play engine, cron, backup timer와 외부 HTTPS를 다시 검증한다.
- backup은 2026-08-14 기준 testauram A1에서 복구 검증 완료(dry-run·write·checksum·격리 restore 통과, timer active)다. video-thumbnail backfill도 같은 날 복구(aura-media 사용자, `/opt/aura-board` repo+node_modules, `oracle-video-thumbnail.env`, 수동 unit, dry-run/write `scanned=0` 성공)했으며 timer 없는 수동 unit으로 운영한다. 남은 항목: pending kernel reboot 후 전체 서비스 재검증, rehearsal은 pg_net 2개 테이블과 vault 스키마를 제외하고 수행되며 pg_net/supabase_vault 확장을 VM에 설치하면 완전 복원 검증으로 확장 가능.
- Tailscale과 nginx가 동일한 wildcard `443`을 사용할 수 없으므로 nginx의 `10.42.1.207:443` bind를 유지한다. NIC 주소나 Tailscale 설정 변경 뒤에는 `ss -ltnp`, `nginx -t`, origin 직접 HTTPS를 먼저 확인한다.
- 현재 배포는 `/opt/aura-board-app/current`를 사용하는 immutable release 구조다. 이후 변경은 새 release 배포와 health 검증을 거쳐야 하며 로컬 코드 검증만으로 운영 반영을 가정하면 안 된다.
- migration 5개는 운영 적용됐지만 신규 consumer가 포함된 최신 앱 배포는 별도다. 배포 SHA를 확인하지 않고 callback을 활성화하면 안 된다.
- GitHub Actions cron workflow는 수동 비상 경로이며 Infisical의 `CRON_SECRET`이 비어 있어 현재 non-dry-run 복구 호출은 사용할 수 없다.
- Supabase callback Vault secret은 비어 있다. 현재는 Oracle 매분 poller가 처리하지만, callback을 다시 활성화하려면 Oracle 앱과 Vault의 `CRON_SECRET`을 원자적으로 맞춰야 한다.
- Oracle poller는 정상 실행되지만 일부 기존 학생 푸시 기기가 Expo ticket 단계에서 `ticket_error`를 반환한다. 예약은 해제되어 재시도 가능하며, Expo 응답의 세부 error code를 안전하게 계측한 뒤 기기 토큰 또는 앱 push credential을 별도로 정리해야 한다.
- Cloudflare Stream 삭제 실패는 현재 식별자 로그만 남기며 자동 orphan 재시도 queue는 없다. R2가 없으므로 R2 fallback을 가정하면 안 된다.
- A1은 현재 `RUNNING` 상태이며 backup daily timer만 활성화되어 있다. video backfill은 수동 unit으로 유지되고 이번 검증에서는 후보 0건이었다. upload 후 DB update 실패 시 새 Supabase object를 best-effort 삭제하며, cleanup까지 실패하면 `orphan cleanup failed` 로그를 기준으로 attachment prefix의 미참조 object를 확인·수동 삭제해야 한다.
- Vercel Blob URL 4개와 due queue 165개는 참조 무결성을 확인하기 전까지 삭제 위험이 남는다.
- 기록된 DB/Storage/object/queue 수치는 2026-07-31 시점 스냅샷이며 cutover 직전에 다시 측정해야 한다.

## Update log

| 일자 | 상태 | 기록 | 다음 단계 |
| --- | --- | --- | --- |
| 2026-08-14 | testauram A1 backup 인프라 복구 완료 | testauram 테넌시에 private 버킷 `aura-board-postgres-backups` 생성, 인스턴스 OCID 동적 그룹 `aura-board-a1-instances`와 버킷 스코프 정책 `aura-board-backup-policy`, lifecycle 정책(30일 DELETE, prefix `aura-board/postgres`) 적용. VM `oracle-backup.env`를 testauram 네임스페이스 `ax6lnwsc3kt3`으로 교체하고 pg_dump 17.11 설치(서버 17.6 매칭), `/home/ubuntu` venv에 의존하던 OCI CLI를 시스템 전역 `/opt/oracle-cli` 3.90.2로 재설치. 실제 backup 1회 성공(7,432,486 bytes + sha256, checksum 일치). 격리 restore rehearsal 통과(1,868 entries, 오류 0, vault 제외 208 tables/2 views, live 대비 pg_net 2개 제외). `aura-supabase-backup.timer` active/enabled. video-thumbnail backfill 복구: `aura-media` 시스템 사용자, `/opt/aura-board` repo+node_modules(tsx, 382 packages), `/etc/aura-board/oracle-video-thumbnail.env`(root:aura-media 0640), 수동 unit+tmpfiles 설치, dry-run 및 write 1회(`scanned=0`, Result=success). Infisical prod `/oracle/aura-board`의 OCI_* 값도 testauram 기준으로 정리 완료. | pending kernel reboot 후 전체 서비스·cron·backup·외부 HTTPS smoke 반복. video backfill은 후보가 생기면 수동 unit으로 실행하고 자원 증거를 측정. pg_net/supabase_vault 확장 설치 시 완전 restore rehearsal로 확장하고 주기 rehearsal 유지. DNS API token은 `aura-board.com` 단일 zone 최소 권한과 짧은 TTL로 유지 |
| 2026-08-08 | Cloudflare DNS·Oracle origin 현행화 완료 | 실제 `testauram` 테넌시의 `testauram-a1-osaka`가 `RUNNING`이고 public/private IP가 `129.225.159.251`/`10.42.1.207`임을 확인했다. apex A와 `www` CNAME을 이 origin으로 proxied 전환하고, nginx HTTPS를 Tailscale wildcard 443과 충돌하지 않도록 private NIC에 bind했다. Let's Encrypt ECDSA 인증서 발급, nginx config, origin 직접 HTTP/HTTPS, Cloudflare 경유 두 도메인 `/api/health`, `certbot renew --dry-run`, release `73cccdd0`, 앱·play engine·cron·certbot timer active를 검증했다. `aura-supabase-backup.timer`는 inactive다. | backup unit·credential·IAM을 새 A1에서 재검증해 timer를 복구하고, 유지보수 창에서 pending kernel reboot 후 전체 서비스·cron·backup·외부 HTTPS smoke를 반복. DNS API token은 `aura-board.com` 단일 zone 최소 권한과 짧은 TTL로 유지 |
| 2026-08-03 | Oracle 앱·play engine·cron 운영 전환 완료 | A1 release `2a4d7c5-oracle1`, systemd/nginx/cron/certbot/backup timer active, 외부·origin `/api/health` DB reachable, Cloudflare proxied + Full strict, Let's Encrypt renewal dry-run 성공, Vercel Cron Jobs Disabled, Oracle 매분 cron 연속 실행 확인 | 운영 로그·백업 복구 시험을 정기 점검하고 새 release마다 health/OAuth/cron smoke를 반복 |
| 2026-08-01 | 운영 DB migration·Infisical runtime/OIDC 준비 완료, 실제 callback·schedule 보류 | PostgreSQL 17.10 custom-format 운영 backup `2,231,856` bytes와 1,617 archive entries, SHA-256 `ce5501873765d504db76151df8c37e04c7a4022545269ea19af0524bd834a01d`를 확인한 뒤 migration 5개를 모두 적용했다. RLS 4개, anon/authenticated SELECT 차단, `pg_cron 1.6.4`, `pg_net 0.20.0`, 함수 4개, 트리거 6개, 5분 retry job을 운영 SQL로 확인했다. Infisical `prod` `/`에는 URL과 새 cron secret을 등록하고 로컬 env backup을 25키로 갱신했으며, 서버 프로젝트 전용 GitHub OIDC identity를 exact repo/main/workflow/Production claims와 900초 TTL, project `viewer`로 연결했다. workflow의 Infisical action 변경은 local-only이고 Supabase Vault 두 값은 비어 있어 외부 callback은 발생하지 않는다. | local workflow 정적 검증 → 명시적 commit/push → GitHub dry-run → 최신 앱 배포와 Vercel secret 동기화 → Supabase Vault 등록 → 제한된 callback/non-dry-run 검증 → schedule cutover |
| 2026-08-01 | 1인1역 자동급여 구현·실지급 회수 검증 완료, scheduler cutover 보류 | `155c7c54`에서 학급 단위 지급 정책, 멱등 지급, KST 일/주/월 판정, 학급 제한 cron route와 테스트를 push. 별무리반 실지급·재호출·보상 거래 원복을 검증했다. 이후 `d164e839`에서 GitHub schedule을 성급히 추가했으나, live 확인 결과 `Production` environment의 variables/secrets는 여전히 비어 있고 `20260731` migration 5개도 운영 미적용임을 재확인했다. 따라서 workflow는 수동 dry-run 전용으로 되돌리고 급여 endpoint만 8번째 선택지로 유지한다. | 기존 handoff 순서대로 Supabase notification wakeup 검증 → 최신 앱 배포 복구 → GitHub `Production` 값 설정 → 8개 endpoint dry-run/non-dry-run 검증 → 승인된 schedule cutover |
| 2026-08-03 | A1 실운영 준비 검증 완료 | `aura-board-worker-a1-osaka` (`ocid1.instance.oc1.ap-osaka-1.anvwsljrchxbcsic7cnylrup6ozazxn4yoemirdm7ijnkkp2nfnoyraocxwq`)가 `RUNNING`, public IP `161.33.30.33`. Node 22/PG17/FFmpeg/OCI CLI ARM64 확인, IAM·bucket·direct DB 검증, backup dry-run과 approved write 1회 성공, dump/manifest checksum 및 object head 확인, 격리 restore 후 `aura-supabase-backup.timer` 활성화. | 앱·play-engine·nginx를 loopback 우선 검증한 뒤 DNS를 전환하고 첫 daily timer의 자원 사용량을 관찰 |
| 2026-07-31 | A1 worker 구현 `450c62b4` push 완료 | 기본 dry-run/명시적 write gate, Supabase exact origin·bucket allowlist, redirect 및 FFmpeg nested network protocol 차단, 최소 child env, 64 MiB frame cap, DB update 실패 시 best-effort object cleanup, 공유 `flock`, 초기 concurrency 1, Node.js 22 ARM64 runbook을 반영. targeted 61/61 tests, typecheck, backup shell syntax, diff check 통과. 배포·secret 주입·systemd 활성화·DB/Storage write 없음. | A1 또는 승인된 Work 전용 VPS에서 Node 22/ARM64 native binary와 systemd unit을 검증한 뒤 dry-run 1건 → 승인된 write 1건 → cleanup/MemoryPeak 순서로 확인 |
| 2026-07-31 | A1 worker 성능·격리 구현 보강 | video thumbnail backfill을 A1용 streaming download와 최대 2-worker 처리로 바꾸고 strict CLI, source-size guard, download/FFmpeg timeout, temp cleanup, 부분 실패 non-zero를 추가. backup/video systemd unit에 12 GB 단일 호스트용 CPU·memory envelope를 적용했으며 video unit은 수동 전용으로 유지. Vercel/Supabase/provider 제약인 cron batch, Prisma connection limit, 알림/Blob queue, 결제 직렬화는 변경하지 않음. | A1 capacity 확보 후 ARM64/systemd 검증, dry-run 1건과 승인된 write 1건 측정. request-time FFmpeg 제거는 durable media queue 설계 후 별도 단계로 수행 |
| 2026-07-31 | Oracle 부분 프로비저닝 및 A1 계획 재구성 | 새 테넌시 Osaka에 `aura-board-prod`, VCN/public subnet/NSG, private bucket을 무료 범위로 생성. 인스턴스와 boot/block volume은 0개이며 A1 요청은 host capacity 부족과 후속 429로 중단. 두 micro host의 역할 분리를 단일 ARM64 A1에서 systemd 격리·직렬 실행·역할 단위 blue/green으로 대체하도록 runbook 갱신. secret, backup, IAM instance principal, 데이터 이관, 기존 리소스 종료·삭제는 수행하지 않음. | 내일부터 5시간 간격 단일 A1 요청. 성공 시 instance OCID 단일 dynamic group/bucket policy → SSH/cloud-init 검증 → dry-run 순서로 진행 |
| 2026-07-31 | 준비 기준선 `0298379f` 회귀 검증 완료 | 구현과 단계별 handoff가 포함된 `main`에서 제한된 4-worker 전체 Vitest 540 suites/1,276 tests, typecheck, Next.js production build 통과. 첫 전체 테스트 시도는 도구의 5분 제한으로 부모 셸만 종료되어 소유 Vitest 프로세스 트리를 정리한 뒤 결과 JSON을 남기는 단일 실행으로 재검증. 배포·workflow dispatch·운영 DB/Storage/OCI 접근 없음. | 위 실제 실행 전 승인 체크를 제공자별로 충족한 뒤 별도 cutover 작업에서 진행 |
| 2026-07-31 | Step 7 도구 준비 `f06d6a32` push 완료 | Blob cleanup의 전체 23개 참조 필드를 이전 도구와 일치시키고 `.env` 자동 읽기 제거, strict CLI/path 검증, import 시 Prisma 미실행, 명시적 `--write`, 부분 실패 non-zero 종료를 추가. 외부 연결 없는 23 tests, typecheck, diff check 통과. 실제 DB/Blob/Storage 접근·데이터 이동·삭제·배포 없음. | 전체 regression 검증 후 운영 cutover에 필요한 credential/resource/승인 항목을 최종 정리 |
| 2026-07-31 | Step 6 `6ebe78d8` push 완료 | Oracle 목표를 오사카 홈 리전 `ap-osaka-1`의 단일 `VM.Standard.A1.Flex` 2 OCPU/12 GB로 확정. instance principal 기반 Supabase custom-format dump, archive/sha256 검증, private Object Storage upload, systemd timer와 runbook을 준비. | Vercel Blob 이전 도구의 전체 참조 필드 커버리지와 dry-run 안전성 보강 |
| 2026-07-31 | Step 5 `cb49da46` push 완료 | Cloudflare Stream REST helper에 direct upload duration, UID 검증과 응답 일치, video details 상태 판정, 보드 creator/meta ownership, redacted error, idempotent delete를 추가. 이벤트 제출은 `pendingupload`/`error`/타 보드 UID를 거부하고 정상 인코딩 중은 허용. 제출 DB 삭제 뒤 Stream 삭제를 best-effort로 수행하며 R2는 도입하지 않음. 전체 1,251 tests, 부모 targeted 48 tests, typecheck 통과. 운영 API 호출·배포 없음. | Oracle pull worker의 최소 골격과 비운영 dry-run 계약을 설계·구현 |
| 2026-07-31 | Step 2 `3cd8837e` push 완료 | 5개 Supabase migration을 현재 공식 규칙과 대조. `TossWebhookEvent`와 `BlobDeletionQueue`에 RLS는 있었지만 명시적 `anon`/`authenticated` revoke가 없어 최소 보완함. cron 함수 사용, Vault 미설정 no-op, private `SECURITY DEFINER`, seed 삭제 조건, 165개 due queue의 bounded claim은 수정 없이 적합. Prisma validate/generate와 targeted 38 tests 통과. 운영 적용·배포 없음. | Cloudflare Stream UID 소유권·상태 검증과 삭제 수명주기 변경을 별도 commit으로 검토 |
| 2026-07-31 | Step 1 `14bb101a` push 완료 | [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml)에 `Production` environment를 사용하는 수동 dispatcher를 추가. `workflow_dispatch`만 사용하고 `schedule`은 두지 않았으며, `dry_run` 기본값은 `true`라 endpoint를 호출하지 않는다. 7개 job의 method/path, secret 비출력, `notification-push` 제외를 정적으로 검증했고 운영 호출은 실행하지 않음. `Production` environment는 존재하지만 `CRON_SECRET`과 `AURA_BOARD_BASE_URL`은 아직 미설정. | Supabase 마이그레이션 5개의 적용 전 안전성·순서·검증 자동화를 점검. 승인된 non-dry-run 전에 두 GitHub environment 값을 설정하고 값 노출 없이 존재 여부를 확인 |
| 2026-07-31 | Baseline push 완료 | 이전 8개 commit이 `main`의 `80183f55`까지 push됨. 운영 실측과 4-provider 책임 경계를 기록했으며 운영 변경·배포는 수행하지 않음. | GitHub Actions cron workflow 준비: 일반 일/주간 7개 endpoint만 대상으로 구현·정적 검증하고 `notification-push`는 제외 |
