# 4-provider infrastructure handoff

기준일: 2026-07-31
기준 브랜치/커밋: `main` / `dc57588a`

이 문서는 Oracle Cloud, Cloudflare, Supabase, GitHub Actions의 책임 경계와 후속 실행 순서를 기록한다. **코드 준비 단계 이후 Oracle 새 테넌시에는 무료 범위의 compartment, VCN, public subnet/NSG, private backup bucket까지 생성됐다. A1 Compute, boot volume, dynamic group/IAM policy, secret 등록, backup 실행, 데이터 이관, workflow 실행 및 앱 배포는 아직 수행하지 않았다.** 아래 체크박스는 실제 실행자가 증거를 확인한 뒤에만 갱신한다.

## 책임과 경계

| 제공자 | 책임 | 책임이 아닌 것 | 현재 상태 |
| --- | --- | --- | --- |
| Oracle Cloud | 장기 FFmpeg 작업, 배치 메일, Supabase 논리 백업을 가져가는 pull worker | 원본 Postgres, 원본 Storage, 앱 호스팅 | 새 테넌시 오사카 `ap-osaka-1`에 compartment·VCN·public subnet/NSG·private bucket 생성 완료. 단일 A1 2 OCPU/12 GB는 capacity 부족으로 대기 중이며 5시간 간격 단일 요청 재시도 계획. 기존 1 GB 2대는 교차 테넌시 blue/green 검증 전 유지 |
| Cloudflare | Stream 비디오 업로드·재생 및 상태 검증/삭제 수명주기 | 일반 파일·이미지 저장소, R2 | Stream UID·상태·ownership 검증과 best-effort 삭제 보강 완료. R2는 도입하지 않음 |
| Supabase Pro (Seoul) | Postgres, Auth, Realtime, 일반 파일·이미지 Storage, `NotificationOutbox`, `pg_net`, `pg_cron` | Cloudflare Stream 비디오, Oracle 작업 실행 환경 | 운영 사용 중. `20260731` 마이그레이션 5개는 운영 미적용 |
| GitHub Actions | Vercel의 일반 일/주간 cron 7개와 신규 `role-salary-payout`을 `Authorization: Bearer` 방식으로 호출 | 앱 호스팅, `notification-push`의 주 wakeup | 8개 endpoint용 수동 dry-run workflow 준비 완료, schedule 미설정. `Production` environment 값도 아직 비어 있음 |
| Vercel Hobby | Next.js 앱 호스팅과 cron API endpoint 제공 | 향후 cron scheduler, 장기 작업, 원본 데이터 저장소 | 기존 production은 유지 중. [`vercel.json`](../vercel.json)의 매분 cron 때문에 최신 `main` 배포 실패. 이번 범위에서 배포하지 않음 |

책임 이전 후에도 cron API의 인증 기준은 [`src/lib/cron-auth.ts`](../src/lib/cron-auth.ts)이며, GitHub Actions와 Supabase callback 모두 동일한 `CRON_SECRET`을 Bearer token으로 사용한다.

## 현재 상태와 확인된 기준선

- Supabase 운영 DB: 약 **43.9 MiB**.
- Supabase Storage: **1,226 objects**, 약 **992.4 MiB**.
- Vercel Blob: distinct URL **4개**.
- `BlobDeletionQueue`: due **165개**. 구현은 [`src/lib/blob-cleanup.ts`](../src/lib/blob-cleanup.ts), 모델은 [`prisma/schema.prisma`](../prisma/schema.prisma), API는 [`src/app/api/cron/blob-cleanup/route.ts`](../src/app/api/cron/blob-cleanup/route.ts)에 있다.
- `main` 기준 이전 8개 커밋은 `80183f55`까지 push 완료.
- 최신 `main`의 production 배포는 실패했지만 기존 production은 유지 중이다. 실패 원인은 [`vercel.json`](../vercel.json)의 `/api/cron/notification-push` 매분 schedule이 Vercel Hobby 제약과 충돌하기 때문이다.
- 일반 일/주간 schedule 7개는 `parent-weekly-digest`, `parent-anonymize`, `expire-pending-links`, `fd-maturity`, `billing-renew`, `blob-cleanup`, `attendance-reminder`이다.
- Oracle 새 테넌시 `dbsk7618`의 홈 리전은 `ap-osaka-1`이다. `aura-board-prod`, `aura-board-vcn`, `aura-board-public-subnet`, `aura-board-worker-nsg`, `aura-board-postgres-backups`가 준비됐고 인스턴스·boot/block volume은 0개다.
- A1 최초 요청은 `Out of host capacity`, 즉시 후속 요청은 `429 TooManyRequests`였다. 추가 즉시 재시도는 중단했다. 5시간 재시도는 매 실행 전 동일 이름의 non-terminated instance와 boot volume이 0개인지 읽기 전용으로 확인하고, 실행당 launch 요청 한 번만 허용하며, 성공 검증 즉시 자동화를 영구 중지한다.
- `notification-push`는 위 7개와 별도다. Supabase `NotificationOutbox` insert event wakeup과 5분 retry sweep으로 이전하며, 상세 cutover 계약은 [`src/app/api/cron/notification-push/HANDOFF.md`](../src/app/api/cron/notification-push/HANDOFF.md)에 있다.
- `role-salary-payout`은 `155c7c54`에서 구현·push됐지만 production에는 아직 배포되지 않았고 scheduler도 없다. 2026-08-01 로컬 코드와 운영 DB를 연결한 별무리반 제한 검증에서 24명·16역할·26,300 지급, 동일 키 재호출 차단, 24건 보상 거래 회수와 잔액 원복을 확인했다. 이 테스트로 별무리반의 `2026-08` 자동지급 키는 소비됐으며 다음 정상 자동지급 기간은 2026-09다.
- Cloudflare Stream 진입점은 [`src/lib/event/cfstream.ts`](../src/lib/event/cfstream.ts)와 [`src/app/api/event/video-upload-url/route.ts`](../src/app/api/event/video-upload-url/route.ts)다.
- 일반 파일·이미지는 Supabase Storage가 기준이며 관련 구현은 [`src/lib/media-storage.ts`](../src/lib/media-storage.ts)와 [`src/app/api/upload/route.ts`](../src/app/api/upload/route.ts)다. Vercel Blob 잔여분 이전 도구는 [`scripts/migrate-vercel-blob-to-supabase.ts`](../scripts/migrate-vercel-blob-to-supabase.ts)다.

### 운영 미적용 마이그레이션

다음 5개를 순서대로 취급한다. 운영 적용 전 backup, 대상 프로젝트/리전 확인, SQL 검토가 필요하다.

1. [`20260731120000_billing_idempotency_and_webhook_inbox`](../prisma/migrations/20260731120000_billing_idempotency_and_webhook_inbox/migration.sql)
2. [`20260731130000_durable_notification_outbox`](../prisma/migrations/20260731130000_durable_notification_outbox/migration.sql)
3. [`20260731140000_blob_cleanup_leases`](../prisma/migrations/20260731140000_blob_cleanup_leases/migration.sql)
4. [`20260731150000_notification_outbox_supabase_wakeup`](../prisma/migrations/20260731150000_notification_outbox_supabase_wakeup/migration.sql)
5. [`20260731160000_deprecate_drawing_board`](../prisma/migrations/20260731160000_deprecate_drawing_board/migration.sql)

## Secret 및 env 이름

값은 이 문서, commit, workflow log에 기록하지 않는다. 실제 저장 위치와 접근 권한은 각 제공자에서 관리한다.

| 위치 | 이름 |
| --- | --- |
| GitHub Actions secret | `CRON_SECRET` |
| GitHub Actions environment variable | `AURA_BOARD_BASE_URL` |
| Vercel/server | `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL` |
| Supabase/client·server | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `AURA_STORAGE_BUCKET` |
| Supabase Vault | `notification_outbox_worker_url`, `notification_outbox_worker_secret` |
| Cloudflare Stream | `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN` |
| Oracle backup worker | `DATABASE_URL`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`, `OCI_OBJECT_PREFIX`, `OCI_REGION` |
| Vercel Blob 잔여 이전 시에만 | `BLOB_READ_WRITE_TOKEN` |

GitHub environment의 정확한 이름은 `Production`이며 environment 자체는 이미 존재한다. 현재 이 environment의 secret과 variable 목록은 모두 비어 있어 `CRON_SECRET`과 `AURA_BOARD_BASE_URL`은 아직 미설정 상태다. 두 값이 설정되기 전 non-dry-run dispatch는 workflow의 사전 검증에서 실패해야 하며, 값을 문서나 workflow log에 출력하지 않는다.

`AURA_BOARD_BASE_URL`은 GitHub Actions workflow가 호출할 HTTPS 앱 오리진이다. secret이 아니며 GitHub `Production` environment variable로 관리한다. 구현 시 이름을 바꾸면 이 문서와 workflow를 같은 commit에서 함께 갱신한다. Oracle worker의 신규 secret/env 이름은 리소스와 실행 방식이 확정된 뒤 정의하며, 기존 credential 값을 재사용하거나 문서에 복사하지 않는다.

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

### 6. Oracle pull worker 준비 — 논리 백업 골격 완료 (`6ebe78d8`)

OCI 인증, compartment, compute/runtime, 네트워크 egress, 로그/모니터링을 먼저 확정한다. 이후 장기 FFmpeg, 배치 메일, Supabase 논리 backup pull을 각각 독립 systemd job·사용자·작업 디렉터리로 분리한다. A1 한 대에서는 처음부터 무거운 작업을 병렬 실행하지 않고 backup → batch mail → FFmpeg 순서로 하나씩 이관하며 측정 후에만 동시성을 늘린다. Oracle에는 원본 DB나 원본 Storage를 만들지 않으며 backup은 암호화, 보존 기간, 복구 시험을 갖춘 파생 사본으로만 취급한다.

- [x] Commit: 오사카 A1 2 OCPU/12 GB의 첫 작업으로 Supabase logical backup script, systemd unit/timer, env template, runbook을 독립 commit `6ebe78d8`로 작성.
- [x] Push: `6ebe78d8`을 `main`에 push. 실행 artifact는 실제 OCI 리소스 준비 전이라 없음.
- [x] Verification: script 구문, 외부 접근 없는 기본 dry-run, 오사카 리전 고정, instance principal·checksum·no-overwrite, private temp cleanup, systemd hardening과 설치 경로를 정적으로 검증. 실제 backup/OCI 연결/복구 rehearsal은 리소스 준비 후 수행.
- [x] Handoff: 구 테넌시의 기존 1 GB AMD 인스턴스 2개를 유지한 채 새 테넌시 A1을 병렬 준비하는 교차 테넌시 blue/green 절차를 [`infra/oracle/README.md`](../infra/oracle/README.md)에 기록. 호스트 단위 교체가 아니라 backup → batch mail → FFmpeg 역할 단위 이관이며, ARM64 재검증과 단일 노드 resource isolation을 추가함.
- [x] A1 runtime preparation: backup unit에 150% CPU·1.5/2 GB memory envelope를 추가하고, video thumbnail backfill을 기본 dry-run/명시적 `--write`, exact Supabase origin+bucket allowlist, redirect/local/internal source 차단, streaming temp file, 1 GiB source cap, download/FFmpeg timeout, 64 MiB frame cap, 부분 실패 non-zero 종료로 보강. 두 unit은 공유 nonblocking `flock`을 사용하고 수동 video unit은 초기 concurrency 1, 180% CPU·6/8 GB memory envelope, timer/install target 없음.
- [x] A1 runtime implementation: 위 script/tests/systemd/tmpfiles/env/runbook 변경을 `450c62b4` (`feat(oracle): prepare A1 media worker`)로 `main`에 push. targeted Vitest 61/61, `npm run typecheck`, `bash -n infra/oracle/backup-supabase.sh`, `git diff --check`를 통과했으며 배포·Infisical 주입·systemd 활성화·실제 backfill은 수행하지 않음.
- [ ] A1 runtime verification: 실제 ARM64 호스트에서 systemd unit verify와 native binary 확인 후 `--dry-run --limit=1`, 승인된 1건 write, WebP/DB/Storage/temp cleanup 및 `MemoryPeak` 측정을 완료. backup/restore와 video unit을 동시에 실행하지 않음.

### 7. Vercel Blob 잔여 정리와 안정화 — 이전 도구 준비 완료 (`f06d6a32`)

Vercel Blob distinct URL 4개와 due queue 165개를 재확인한다. Supabase Storage에 존재하고 참조가 전환됐음을 검증하기 전에는 원본을 삭제하지 않는다. [`scripts/migrate-vercel-blob-to-supabase.ts`](../scripts/migrate-vercel-blob-to-supabase.ts)는 검토 후 필요한 경우에만 사용한다.

- [x] Commit: Blob cleanup 참조 검사와 동일한 23개 모델·필드 커버리지, env-file opt-in, strict args/path 검증, import side-effect 제거와 write 실패 non-zero 처리를 `f06d6a32`로 작성.
- [x] Push: `f06d6a32`을 `main`에 push. 배포는 수행하지 않음.
- [x] Preparation verification: 외부 서비스·실제 env file 없이 전용 23 tests, typecheck, diff check 통과. 기본은 dry-run이며 `.env`/`.env.local`은 `--load-env-files`, 파일 복사와 DB 갱신은 `--write`를 명시해야만 활성화됨.
- [ ] Operational verification: cutover 승인 후 URL별 참조/대상 object, queue 처리·실패 재시도, 사용자 다운로드/이미지 표시를 확인. dry-run도 후보 검색을 위해 지정된 DB를 읽으므로 운영 실행 전에 연결 대상을 재확인.
- [x] Handoff: 이번 commit은 도구 준비만 수행했고 데이터 복사·참조 갱신·원본 삭제는 하지 않음. 처리 전후 object/URL/queue 수치와 원본 삭제 승인은 실제 실행 handoff에 별도로 기록.

## 실제 실행 전 승인 체크

- [ ] OCI Osaka의 compartment, VCN, public subnet/NSG, private Object Storage bucket은 준비 완료. A1 2 OCPU/12 GB capacity를 확보해 ARM64 instance와 50 GB boot volume을 만든 뒤 instance OCID 단일 dynamic group/IAM policy를 준비하고 owner·비용 경계를 기록.
- [ ] 새 A1에서 logical backup `--write` 1회, checksum/archive 확인, 격리 restore rehearsal을 마친 뒤에만 기존 1 GB 인스턴스의 job을 하나씩 이관. 관찰 기간 전에는 기존 인스턴스를 종료하지 않음.
- [ ] Infisical production scope `/oracle/aura-board/backup`과 `/oracle/aura-board/video-thumbnail`에 필요한 값을 분리 등록하고, 값 노출 없이 A1의 root-owned env files로 주입. video scope 이름은 `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`이며 transaction pooler `:6543`은 사용하지 않음. A1 존재·검증 전에는 secret을 주입하지 않음.
- [ ] GitHub `Production` environment에 `CRON_SECRET`, `AURA_BOARD_BASE_URL`을 설정하고 수동 dry-run 결과를 확인. 별도 cutover 승인 전에는 `schedule`을 추가하지 않음.
- [ ] 운영 DB backup과 대상 Supabase 프로젝트/리전을 확인한 뒤 5개 migration을 문서 순서대로 적용. 부분 적용이나 임의 down migration 금지.
- [ ] Vercel Blob 이전 도구의 DB 연결 대상을 확인하고 먼저 dry-run으로 후보를 고정. `--write` 후 대상 object와 사용자 경로를 검증하기 전 원본 Blob과 queue 항목 삭제 금지.
- [ ] 앱 배포는 이 준비 작업과 분리하여 별도 승인·검증으로 진행.

## Rollback

- **GitHub Actions cron:** workflow를 disable하고 Vercel schedule이 아직 존재하는지 확인한다. 이미 제거했다면 해당 schedule만 복원하는 commit을 push한다. endpoint 구현과 `CRON_SECRET` 인증은 유지한다.
- **NotificationOutbox:** Supabase Vault의 callback secret을 비활성화해 event wakeup을 멈춘다. Vercel 매분 poller를 제거한 뒤라면 schedule을 복원한다. DB trigger/function 제거 절차는 [notification handoff](../src/app/api/cron/notification-push/HANDOFF.md#rollback)를 따른다. outbox table과 enqueue event는 삭제하지 않는다.
- **Supabase migration:** 적용 전 논리 backup과 migration별 영향 분석을 우선한다. 데이터 손실 가능성이 있는 migration을 임의 down migration으로 되돌리지 말고, forward-fix 또는 검증된 복구 절차를 선택한다.
- **Cloudflare Stream:** 새 상태 검증/삭제 worker를 중지하고 기존 업로드 경로로 복귀한다. 삭제된 asset은 코드 rollback으로 복원되지 않으므로 삭제 전 참조와 보존 조건을 확인한다.
- **Oracle worker:** scheduler/worker를 중지해 신규 pull을 차단한다. Supabase와 Cloudflare의 원본은 영향을 받지 않아야 한다. 파생 backup 삭제는 별도 승인 대상이다.
- **Vercel 배포:** 이번 작업에서는 배포하지 않는다. 향후 배포 실패 시 기존 production을 유지하고, 실패한 최신 SHA를 production으로 수동 승격하지 않는다.

## Residual risks

- OCI 인증과 기본 네트워크·private bucket은 준비됐지만 A1은 Osaka host capacity 부족으로 아직 없다. 단일 A1은 두 micro host의 장애 격리를 잃으므로 job별 systemd 격리, 직렬 이관, ARM64 패키지 호환, 처리량과 backup 복구 시간을 검증하기 전 기존 1 GB 인스턴스를 종료하면 안 된다.
- Vercel Hobby의 현재 cron 제약으로 최신 `main`과 production SHA가 다르다. 코드 검증만으로 production 반영을 가정하면 안 된다.
- 운영 미적용 migration 5개 사이에는 순서 의존성이 있다. 일부만 적용하면 schema와 실행 코드가 어긋날 수 있다.
- GitHub Actions cron은 아직 없으며, scheduler 지연·중복·GitHub 장애 시 복구 경로와 알림이 검증되지 않았다.
- Supabase callback은 Vercel의 production URL과 `CRON_SECRET` 동기화에 의존한다. secret rotation 순서가 틀리면 `401` backlog가 발생한다.
- Cloudflare Stream 삭제 실패는 현재 식별자 로그만 남기며 자동 orphan 재시도 queue는 없다. R2가 없으므로 R2 fallback을 가정하면 안 된다.
- A1 video backfill은 upload 후 DB update 실패 시 새 Supabase object를 best-effort 삭제한다. cleanup까지 실패하면 `orphan cleanup failed` 로그를 기준으로 attachment prefix의 미참조 object를 확인·수동 삭제해야 하며, 자동 orphan queue는 아직 없다.
- Vercel Blob URL 4개와 due queue 165개는 참조 무결성을 확인하기 전까지 삭제 위험이 남는다.
- 기록된 DB/Storage/object/queue 수치는 2026-07-31 시점 스냅샷이며 cutover 직전에 다시 측정해야 한다.

## Update log

| 일자 | 상태 | 기록 | 다음 단계 |
| --- | --- | --- | --- |
| 2026-08-01 | 1인1역 자동급여 구현·실지급 회수 검증 완료, scheduler cutover 보류 | `155c7c54`에서 학급 단위 지급 정책, 멱등 지급, KST 일/주/월 판정, 학급 제한 cron route와 테스트를 push. 별무리반 실지급·재호출·보상 거래 원복을 검증했다. 이후 `d164e839`에서 GitHub schedule을 성급히 추가했으나, live 확인 결과 `Production` environment의 variables/secrets는 여전히 비어 있고 `20260731` migration 5개도 운영 미적용임을 재확인했다. 따라서 workflow는 수동 dry-run 전용으로 되돌리고 급여 endpoint만 8번째 선택지로 유지한다. | 기존 handoff 순서대로 Supabase notification wakeup 검증 → 최신 앱 배포 복구 → GitHub `Production` 값 설정 → 8개 endpoint dry-run/non-dry-run 검증 → 승인된 schedule cutover |
| 2026-07-31 | A1 worker 구현 `450c62b4` push 완료 | 기본 dry-run/명시적 write gate, Supabase exact origin·bucket allowlist, redirect 및 FFmpeg nested network protocol 차단, 최소 child env, 64 MiB frame cap, DB update 실패 시 best-effort object cleanup, 공유 `flock`, 초기 concurrency 1, Node.js 22 ARM64 runbook을 반영. targeted 61/61 tests, typecheck, backup shell syntax, diff check 통과. 배포·secret 주입·systemd 활성화·DB/Storage write 없음. | A1 또는 승인된 Work 전용 VPS에서 Node 22/ARM64 native binary와 systemd unit을 검증한 뒤 dry-run 1건 → 승인된 write 1건 → cleanup/MemoryPeak 순서로 확인 |
| 2026-07-31 | A1 worker 성능·격리 구현 보강 | video thumbnail backfill을 A1용 streaming download와 최대 2-worker 처리로 바꾸고 strict CLI, source-size guard, download/FFmpeg timeout, temp cleanup, 부분 실패 non-zero를 추가. backup/video systemd unit에 12 GB 단일 호스트용 CPU·memory envelope를 적용했으며 video unit은 수동 전용으로 유지. Vercel/Supabase/provider 제약인 cron batch, Prisma connection limit, 알림/Blob queue, 결제 직렬화는 변경하지 않음. | A1 capacity 확보 후 ARM64/systemd 검증, dry-run 1건과 승인된 write 1건 측정. request-time FFmpeg 제거는 durable media queue 설계 후 별도 단계로 수행 |
| 2026-07-31 | Oracle 부분 프로비저닝 및 A1 계획 재구성 | 새 테넌시 Osaka에 `aura-board-prod`, VCN/public subnet/NSG, private bucket을 무료 범위로 생성. 인스턴스와 boot/block volume은 0개이며 A1 요청은 host capacity 부족과 후속 429로 중단. 두 micro host의 역할 분리를 단일 ARM64 A1에서 systemd 격리·직렬 실행·역할 단위 blue/green으로 대체하도록 runbook 갱신. secret, backup, IAM instance principal, 데이터 이관, 기존 리소스 종료·삭제는 수행하지 않음. | 내일부터 5시간 간격 단일 A1 요청. 성공 시 instance OCID 단일 dynamic group/bucket policy → SSH/cloud-init 검증 → dry-run 순서로 진행 |
| 2026-07-31 | 준비 기준선 `0298379f` 회귀 검증 완료 | 구현과 단계별 handoff가 포함된 `main`에서 제한된 4-worker 전체 Vitest 540 suites/1,276 tests, typecheck, Next.js production build 통과. 첫 전체 테스트 시도는 도구의 5분 제한으로 부모 셸만 종료되어 소유 Vitest 프로세스 트리를 정리한 뒤 결과 JSON을 남기는 단일 실행으로 재검증. 배포·workflow dispatch·운영 DB/Storage/OCI 접근 없음. | 위 실제 실행 전 승인 체크를 제공자별로 충족한 뒤 별도 cutover 작업에서 진행 |
| 2026-07-31 | Step 7 도구 준비 `f06d6a32` push 완료 | Blob cleanup의 전체 23개 참조 필드를 이전 도구와 일치시키고 `.env` 자동 읽기 제거, strict CLI/path 검증, import 시 Prisma 미실행, 명시적 `--write`, 부분 실패 non-zero 종료를 추가. 외부 연결 없는 23 tests, typecheck, diff check 통과. 실제 DB/Blob/Storage 접근·데이터 이동·삭제·배포 없음. | 전체 regression 검증 후 운영 cutover에 필요한 credential/resource/승인 항목을 최종 정리 |
| 2026-07-31 | Step 6 `6ebe78d8` push 완료 | Oracle 목표를 오사카 홈 리전 `ap-osaka-1`의 단일 `VM.Standard.A1.Flex` 2 OCPU/12 GB로 변경. 기존 1 GB 인스턴스 2개는 A1 백업·복구와 워커 검증 후 순차 교체. instance principal 기반 Supabase custom-format dump, archive/sha256 검증, private Object Storage upload, systemd timer와 runbook을 준비. 구문, 외부 접근 없는 dry-run, 오사카 리전 거부 가드와 diff를 재검증했으며 실제 OCI/DB 접근·리소스 변경·배포는 하지 않음. | Vercel Blob 이전 도구의 전체 참조 필드 커버리지와 dry-run 안전성 보강 |
| 2026-07-31 | Step 5 `cb49da46` push 완료 | Cloudflare Stream REST helper에 direct upload duration, UID 검증과 응답 일치, video details 상태 판정, 보드 creator/meta ownership, redacted error, idempotent delete를 추가. 이벤트 제출은 `pendingupload`/`error`/타 보드 UID를 거부하고 정상 인코딩 중은 허용. 제출 DB 삭제 뒤 Stream 삭제를 best-effort로 수행하며 R2는 도입하지 않음. 전체 1,251 tests, 부모 targeted 48 tests, typecheck 통과. 운영 API 호출·배포 없음. | Oracle pull worker의 최소 골격과 비운영 dry-run 계약을 설계·구현 |
| 2026-07-31 | Step 2 `3cd8837e` push 완료 | 5개 Supabase migration을 현재 공식 규칙과 대조. `TossWebhookEvent`와 `BlobDeletionQueue`에 RLS는 있었지만 명시적 `anon`/`authenticated` revoke가 없어 최소 보완함. cron 함수 사용, Vault 미설정 no-op, private `SECURITY DEFINER`, seed 삭제 조건, 165개 due queue의 bounded claim은 수정 없이 적합. Prisma validate/generate와 targeted 38 tests 통과. 운영 적용·배포 없음. | Cloudflare Stream UID 소유권·상태 검증과 삭제 수명주기 변경을 별도 commit으로 검토 |
| 2026-07-31 | Step 1 `14bb101a` push 완료 | [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml)에 `Production` environment를 사용하는 수동 dispatcher를 추가. `workflow_dispatch`만 사용하고 `schedule`은 두지 않았으며, `dry_run` 기본값은 `true`라 endpoint를 호출하지 않는다. 7개 job의 method/path, secret 비출력, `notification-push` 제외를 정적으로 검증했고 운영 호출은 실행하지 않음. `Production` environment는 존재하지만 `CRON_SECRET`과 `AURA_BOARD_BASE_URL`은 아직 미설정. | Supabase 마이그레이션 5개의 적용 전 안전성·순서·검증 자동화를 점검. 승인된 non-dry-run 전에 두 GitHub environment 값을 설정하고 값 노출 없이 존재 여부를 확인 |
| 2026-07-31 | Baseline push 완료 | 이전 8개 commit이 `main`의 `80183f55`까지 push됨. 운영 실측과 4-provider 책임 경계를 기록했으며 운영 변경·배포는 수행하지 않음. | GitHub Actions cron workflow 준비: 일반 일/주간 7개 endpoint만 대상으로 구현·정적 검증하고 `notification-push`는 제외 |
