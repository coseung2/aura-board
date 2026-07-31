# 4-provider infrastructure handoff

기준일: 2026-07-31
기준 브랜치/커밋: `main` / `80183f55`

이 문서는 Oracle Cloud, Cloudflare, Supabase, GitHub Actions의 책임 경계와 후속 실행 순서를 기록한다. **현재 준비 단계는 코드·설정·문서의 구현, 검증, commit, push까지만 포함하며 운영 변경, 마이그레이션 적용, secret 등록, workflow 실행, Vercel 배포 및 수동 배포는 포함하지 않는다.** 아래 체크박스는 실제 실행자가 증거를 확인한 뒤에만 갱신한다.

## 책임과 경계

| 제공자 | 책임 | 책임이 아닌 것 | 현재 상태 |
| --- | --- | --- | --- |
| Oracle Cloud | 장기 FFmpeg 작업, 배치 메일, Supabase 논리 백업을 가져가는 pull worker | 원본 Postgres, 원본 Storage, 앱 호스팅 | OCI 인증과 리소스가 아직 준비되지 않음 |
| Cloudflare | Stream 비디오 업로드·재생 및 향후 상태 검증/삭제 수명주기 | 일반 파일·이미지 저장소, R2 | Stream 직접 업로드 코드가 있으며 운영 수명주기 보강 필요. R2는 도입하지 않음 |
| Supabase Pro (Seoul) | Postgres, Auth, Realtime, 일반 파일·이미지 Storage, `NotificationOutbox`, `pg_net`, `pg_cron` | Cloudflare Stream 비디오, Oracle 작업 실행 환경 | 운영 사용 중. `20260731` 마이그레이션 5개는 운영 미적용 |
| GitHub Actions | Vercel의 일/주간 cron 7개를 `Authorization: Bearer` 방식으로 호출 | 앱 호스팅, `notification-push`의 주 wakeup | 수동 dry-run 우선 workflow 준비 완료, schedule 미설정 |
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
- `notification-push`는 위 7개와 별도다. Supabase `NotificationOutbox` insert event wakeup과 5분 retry sweep으로 이전하며, 상세 cutover 계약은 [`src/app/api/cron/notification-push/HANDOFF.md`](../src/app/api/cron/notification-push/HANDOFF.md)에 있다.
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
| Vercel Blob 잔여 이전 시에만 | `BLOB_READ_WRITE_TOKEN` |

GitHub environment의 정확한 이름은 `Production`이며 environment 자체는 이미 존재한다. 현재 이 environment의 secret과 variable 목록은 모두 비어 있어 `CRON_SECRET`과 `AURA_BOARD_BASE_URL`은 아직 미설정 상태다. 두 값이 설정되기 전 non-dry-run dispatch는 workflow의 사전 검증에서 실패해야 하며, 값을 문서나 workflow log에 출력하지 않는다.

`AURA_BOARD_BASE_URL`은 GitHub Actions workflow가 호출할 HTTPS 앱 오리진이다. secret이 아니며 GitHub `Production` environment variable로 관리한다. 구현 시 이름을 바꾸면 이 문서와 workflow를 같은 commit에서 함께 갱신한다. Oracle worker의 신규 secret/env 이름은 리소스와 실행 방식이 확정된 뒤 정의하며, 기존 credential 값을 재사용하거나 문서에 복사하지 않는다.

## 단계별 실행 계획

각 단계는 작은 단위로 구현하고 **commit → push → 검증 → 이 handoff 갱신** 순서를 지킨다. 체크박스는 commit hash, workflow run, SQL 결과 등 확인 가능한 증거가 있을 때만 완료 처리한다.

### 0. 기준선 고정 — 완료

- [x] Commit/push: 이전 8개 commit을 `main`의 `80183f55`까지 push.
- [x] Verification: 운영 용량과 잔여 queue 수치, 기존 production 유지 상태를 기록.
- [x] Handoff: 4-provider 책임 경계와 운영 미변경 원칙을 이 문서에 기록.

### 1. GitHub Actions cron workflow 준비 — 구현 완료 (pending commit)

[`vercel.json`](../vercel.json)의 일반 일/주간 cron 7개를 개별 호출할 수 있는 `workflow_dispatch` 전용 workflow를 [`.github/workflows`](../.github/workflows/)에 먼저 추가한다. 이 단계에서는 `schedule`을 넣지 않아 push만으로 운영 endpoint가 호출되지 않게 한다. 각 요청은 HTTPS production base URL과 해당 path를 조합하고 `Authorization: Bearer` header를 사용해야 한다. timeout, non-2xx 실패, 동시 실행 중복을 명시적으로 처리한다. `/api/cron/notification-push`는 이 workflow에 포함하지 않는다.

- [ ] Commit: workflow와 문서 변경을 별도 commit으로 작성. 현재 SHA는 `pending commit`이며 부모 작업에서 commit 후 이 항목과 Update log를 갱신한다.
- [ ] Push: commit을 `main`에 push하고 GitHub에 반영된 SHA 확인.
- [x] Verification: [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml)의 구문, 7개 path와 호출 메서드, `schedule` 부재, `notification-push` 제외, secret 값 미출력을 정적으로 대조. 실제 운영 호출은 승인된 cutover 전에는 실행하지 않음.
- [x] Handoff: workflow 경로, 무예약 상태, 기본 dry-run 원칙과 정적 검증 결과를 Update log에 기록. commit 후 부모 작업에서 SHA만 갱신한다.

### 2. Supabase 마이그레이션 적용 준비 및 승인

5개 migration SQL을 순서대로 검토하고 [`docs/verification-checklist.md`](verification-checklist.md)의 Prisma/production 기준을 따른다. 이 단계의 준비 commit은 코드 검증과 runbook 보완만 포함한다. 운영 DB 적용은 별도 승인 작업이다.

- [ ] Commit: migration 검증 또는 필요한 안전 보완을 독립 commit으로 작성.
- [ ] Push: 준비 commit push 및 대상 SHA 고정.
- [ ] Verification: `npx prisma validate`, `npx prisma generate`, 관련 migration/route targeted test, 적용 전 논리 backup 복구 가능성 확인.
- [ ] Handoff: 운영 미적용/적용 여부를 migration별로 기록하고 SQL 실행 증거 위치를 남김.

### 3. NotificationOutbox를 Supabase wakeup으로 cutover

[`src/app/api/cron/notification-push/HANDOFF.md`](../src/app/api/cron/notification-push/HANDOFF.md)의 순서를 단일 source로 사용한다. `pg_net` event callback과 `pg_cron` 5분 sweep을 먼저 검증하고, 그 뒤에만 Vercel의 매분 `/api/cron/notification-push` 항목을 제거한다. route와 outbox consumer는 유지한다.

- [ ] Commit: production 검증 성공 후 `vercel.json`에서 `notification-push` schedule만 제거하는 commit 작성.
- [ ] Push: 제거 commit push. 수동 Vercel 배포는 하지 않음.
- [ ] Verification: POST callback `200`, insert 후 outbox 처리, 5분 retry sweep, 중복 wakeup 안전성, backlog/dead rows 확인.
- [ ] Handoff: Supabase job/trigger 상태, 검증 시각, commit SHA, 실제 배포 상태를 기록.

### 4. GitHub Actions cron cutover

7개 endpoint의 dry-run/승인 검증 후 별도 commit에서 GitHub Actions `schedule`을 추가한다. 동일 schedule이 Vercel과 동시에 실행되는 기간은 endpoint별 idempotency를 확인한 제한된 관찰 구간으로만 둔다. 검증 완료 전 Vercel schedule을 제거하지 않는다.

- [ ] Commit: 검증된 7개 Vercel cron 항목 제거와 문서 갱신을 별도 commit으로 작성.
- [ ] Push: 제거 commit push. 자동 배포 결과만 관찰하고 수동 배포하지 않음.
- [ ] Verification: 각 endpoint의 최근 GitHub run, HTTP status, application log, 중복 실행 부작용 없음 확인.
- [ ] Handoff: endpoint별 마지막 성공 run과 Vercel schedule 제거 여부 기록.

### 5. Cloudflare Stream 수명주기 보강

Stream 업로드 완료/실패 상태를 검증하고, 앱 레코드 삭제 시 Cloudflare asset 삭제가 재시도 가능한 형태로 이어지도록 설계·구현한다. 일반 파일·이미지를 Stream에 넣지 않으며 R2를 추가하지 않는다.

- [ ] Commit: 상태 검증과 삭제 수명주기 변경을 테스트와 함께 독립 commit으로 작성.
- [ ] Push: commit push 및 배포 대상 SHA 기록.
- [ ] Verification: direct upload, processing 완료, 실패/timeout, 삭제/재시도, 이미 삭제된 asset의 idempotency 확인.
- [ ] Handoff: provider asset ID 추적 방식, 보존 기간, 실패 queue/알림, rollback 조건 기록.

### 6. Oracle pull worker 준비

OCI 인증, compartment, compute/runtime, 네트워크 egress, 로그/모니터링을 먼저 확정한다. 이후 장기 FFmpeg, 배치 메일, Supabase 논리 backup pull을 각각 독립 job으로 구현한다. Oracle에는 원본 DB나 원본 Storage를 만들지 않으며 backup은 암호화, 보존 기간, 복구 시험을 갖춘 파생 사본으로만 취급한다.

- [ ] Commit: worker 코드·배포 정의·runbook을 작업 종류별 작은 commit으로 작성.
- [ ] Push: 각 commit push 후 실행 artifact와 SHA 연결.
- [ ] Verification: 비운영 입력으로 FFmpeg/메일 dry-run, 최소 권한 연결, backup 생성·무결성·복구 rehearsal, 재시도와 중복 실행 확인.
- [ ] Handoff: OCI 리소스 식별자, owner, schedule, 로그 위치, 보존/복구 결과를 값 노출 없이 기록.

### 7. Vercel Blob 잔여 정리와 안정화

Vercel Blob distinct URL 4개와 due queue 165개를 재확인한다. Supabase Storage에 존재하고 참조가 전환됐음을 검증하기 전에는 원본을 삭제하지 않는다. [`scripts/migrate-vercel-blob-to-supabase.ts`](../scripts/migrate-vercel-blob-to-supabase.ts)는 검토 후 필요한 경우에만 사용한다.

- [ ] Commit: 필요한 cleanup 안전 보완만 별도 commit으로 작성.
- [ ] Push: commit push 및 배포 SHA 기록.
- [ ] Verification: URL별 참조/대상 object 확인, queue 처리 결과, 실패 재시도, 사용자 다운로드/이미지 표시 확인.
- [ ] Handoff: 처리 전후 object/URL/queue 수치와 삭제 승인 증거 기록.

## Rollback

- **GitHub Actions cron:** workflow를 disable하고 Vercel schedule이 아직 존재하는지 확인한다. 이미 제거했다면 해당 schedule만 복원하는 commit을 push한다. endpoint 구현과 `CRON_SECRET` 인증은 유지한다.
- **NotificationOutbox:** Supabase Vault의 callback secret을 비활성화해 event wakeup을 멈춘다. Vercel 매분 poller를 제거한 뒤라면 schedule을 복원한다. DB trigger/function 제거 절차는 [notification handoff](../src/app/api/cron/notification-push/HANDOFF.md#rollback)를 따른다. outbox table과 enqueue event는 삭제하지 않는다.
- **Supabase migration:** 적용 전 논리 backup과 migration별 영향 분석을 우선한다. 데이터 손실 가능성이 있는 migration을 임의 down migration으로 되돌리지 말고, forward-fix 또는 검증된 복구 절차를 선택한다.
- **Cloudflare Stream:** 새 상태 검증/삭제 worker를 중지하고 기존 업로드 경로로 복귀한다. 삭제된 asset은 코드 rollback으로 복원되지 않으므로 삭제 전 참조와 보존 조건을 확인한다.
- **Oracle worker:** scheduler/worker를 중지해 신규 pull을 차단한다. Supabase와 Cloudflare의 원본은 영향을 받지 않아야 한다. 파생 backup 삭제는 별도 승인 대상이다.
- **Vercel 배포:** 이번 작업에서는 배포하지 않는다. 향후 배포 실패 시 기존 production을 유지하고, 실패한 최신 SHA를 production으로 수동 승격하지 않는다.

## Residual risks

- OCI 인증과 리소스가 없어 Oracle 작업의 실행 환경, 비용, 처리량, backup 복구 시간이 검증되지 않았다.
- Vercel Hobby의 현재 cron 제약으로 최신 `main`과 production SHA가 다르다. 코드 검증만으로 production 반영을 가정하면 안 된다.
- 운영 미적용 migration 5개 사이에는 순서 의존성이 있다. 일부만 적용하면 schema와 실행 코드가 어긋날 수 있다.
- GitHub Actions cron은 아직 없으며, scheduler 지연·중복·GitHub 장애 시 복구 경로와 알림이 검증되지 않았다.
- Supabase callback은 Vercel의 production URL과 `CRON_SECRET` 동기화에 의존한다. secret rotation 순서가 틀리면 `401` backlog가 발생한다.
- Cloudflare Stream 처리 실패와 고아 asset 삭제 수명주기가 아직 보강되지 않았다. R2가 없으므로 R2 fallback을 가정하면 안 된다.
- Vercel Blob URL 4개와 due queue 165개는 참조 무결성을 확인하기 전까지 삭제 위험이 남는다.
- 기록된 DB/Storage/object/queue 수치는 2026-07-31 시점 스냅샷이며 cutover 직전에 다시 측정해야 한다.

## Update log

| 일자 | 상태 | 기록 | 다음 단계 |
| --- | --- | --- | --- |
| 2026-07-31 | Step 1 구현 완료 (`pending commit`) | [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml)에 `Production` environment를 사용하는 수동 dispatcher를 추가. `workflow_dispatch`만 사용하고 `schedule`은 두지 않았으며, `dry_run` 기본값은 `true`라 endpoint를 호출하지 않는다. 7개 job의 method/path, secret 비출력, `notification-push` 제외를 정적으로 검증했고 운영 호출은 실행하지 않음. `Production` environment는 존재하지만 `CRON_SECRET`과 `AURA_BOARD_BASE_URL`은 아직 미설정. | 부모 작업에서 commit 후 이 행과 Step 1의 `pending commit`을 실제 SHA로 갱신하고 push 상태를 기록. 승인된 non-dry-run 전에 두 GitHub environment 값을 설정하고 값 노출 없이 존재 여부를 확인 |
| 2026-07-31 | Baseline push 완료 | 이전 8개 commit이 `main`의 `80183f55`까지 push됨. 운영 실측과 4-provider 책임 경계를 기록했으며 운영 변경·배포는 수행하지 않음. | GitHub Actions cron workflow 준비: 일반 일/주간 7개 endpoint만 대상으로 구현·정적 검증하고 `notification-push`는 제외 |
