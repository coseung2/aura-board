# Managed Supabase → Oracle production cutover

상태: **도구 구현 완료, production source 전환 전**

현재 production source of truth는 managed Supabase다. `supabase.aura-board.com`,
Oracle nginx/TLS, self-hosted Auth/Storage, OCI S3 backend는 준비됐지만 아래 gate를
모두 통과하기 전에는 앱 환경을 self-hosted로 바꾸지 않는다.

## 중단 조건

- managed source에서 별도 export role과 모든 writer role의 `LOGIN`/`CONNECT`를
  정확히 제어할 수 없음
- source와 target의 전체 Auth catalog 또는 Prisma migration history가 다름
- Oracle target 서비스를 모두 정지할 수 없음
- self-host 공개 URL/key로 빌드된 exact-SHA Next.js artifact manifest가 없음
- candidate DB 검증, promotion recovery 또는 rollback DB 보존이 불완전함

## 도구

- DB fence/export/candidate promotion:
  `infra/oracle/supabase-selfhost/production-cutover-db.py`
- DB 구현 helper:
  `infra/oracle/supabase-selfhost/production_cutover_db_lib.py`
- Runtime/backup env 전환:
  `infra/oracle/production-cutover-runtime.py`
- Runtime 구현 helper:
  `infra/oracle/production_cutover_runtime_lib.py`
- Fresh build evidence:
  `infra/oracle/create-cutover-build-manifest.py`

DB credential은 write 명령의 stdin JSON으로만 전달한다. URL·password·key를 argv,
로그, 문서 또는 journal에 기록하지 않는다. DB 도구의 `--dry-run`은 stdin, 파일,
lock 또는 외부 도구를 읽지 않는 no-I/O 계획 모드다. Runtime 도구의
`--dry-run`은 별도 계약으로, CLI help에 명시된 supplied environment/DB evidence
파일을 의도적으로 읽어 검증하지만 어떤 파일도 쓰지 않는다.

Before a managed Supabase source is accepted, a shared-pooler login may use only
`role.<project-ref>` on the exact `aws-<number>-<region>.pooler.supabase.com`
hostname. `source_export_role` and `source_writer_roles` remain the actual
PostgreSQL role identifiers. The source credential and every writer probe must
use the same project-ref suffix; dotted users on any other host are rejected.
The generated `pg_service.conf` contains the login aliases, while fence SQL
continues to quote the actual role names.

The stdin contract also requires `source_fence_mode`, either
`role_lockdown` or `credential_rotation`. `role_lockdown` preserves the
dedicated export-role flow below. `credential_rotation` is only accepted for
the managed production pooler `aws-1-ap-northeast-2.pooler.supabase.com` when
`source_export_role=postgres` is the sole `source_writer_roles` entry and both
credentials use the identical exact `postgres.<project-ref>` alias with different
passwords. The `source` connection is the temporary export credential and
`writer_0` is the old writer credential; both are provided only through the
secret stdin contract.

`role_lockdown` preflight rejects a source database whose `pg_database.datacl`
is NULL: explicit default grants are not equivalent to restoring the NULL
default exactly. `credential_rotation` leaves roles and ACLs unchanged and is
therefore still allowed with a default database ACL.

## 실행 순서

1. 도구를 versioned release로 배포하고 Linux 행동 테스트를 실행한다.
2. self-host 공개 URL/key를 build process에 주입해 fresh Next.js artifact를 빌드하고
   `create-cutover-build-manifest.py`로 server artifact digest와 공개 env value hash를
   기록한다. Runtime `--write`와 `--seal-before-writers`는 이 manifest가 없으면 실패한다.
3. DB `preflight`로 PostgreSQL/extension, 전체 Auth catalog, cross-schema catalog,
   `public._prisma_migrations`와 rotation 전의 비밀 없는 source fence snapshot을
   기록한다. `credential_rotation`에서는 preflight source reads가 `writer_0`
   (old credential)을 사용하므로 아직 temporary credential을 활성화할 필요가 없다.
4. `source_fence_mode=role_lockdown`이면 `engage-fence`로 명시된 managed writer
   role의 LOGIN/CONNECT와 pg_cron을 차단하고 실제 writer credential 재접속·write
   실패를 확인한다.
5. `source_fence_mode=credential_rotation`이면 operator가 managed Supabase에서
   old password를 temporary password로 외부 회전하고, `default_transaction_read_only=on`
   및 모든 `cron.job.active=false`를 외부에서 적용한다. 도구는 password를 회전하지
   않으며 role/ACL grant를 시도하지 않는다. 이어 `adopt-fence`를 실행해 old
   credential의 password authentication rejection, temporary export 성공, 기존
   postgres pooled session의 종료, read-only/cron exactness를 검증하고 engaged
   state를 기록한다. `engage-fence`는 이 모드에서 거부된다.
6. fenced source에서 `public`, `auth` data, `storage.buckets/objects` archive를 만든다.
7. 정지된 Oracle target을 template로 candidate DB를 만들고 candidate에만 restore한다.
8. candidate catalog/data/migration digest가 fenced source와 정확히 일치해야 한다.
9. target→rollback, candidate→target 순서로 rename하고 `promotion-manifest.json`을
   원자적으로 기록한다. partial rename은 자동 recovery 후 중단한다.
10. Runtime tool이 promotion manifest와 fresh build manifest를 검증한 뒤 app/backup env를
   원자적으로 교체한다. 두 파일 중 하나라도 실패하면 bytes·uid·gid·mode를 모두 복구한다.
11. artifact 배포와 active release links가 확인되면 writer 서비스 시작 전에
    `--seal-before-writers`를 실행한다. The command requires the complete fixed
    systemd set `aura-board-app.service`, `aura-play-engine.service`,
    `aura-supabase-backup.service`, `aura-supabase-backup.timer`, and
    `aura-video-thumbnail-backfill.service`, supplied by repeated
    `--required-stopped-service` arguments. It also requires repeated
    `--required-stopped-container` arguments for the complete production
    self-host set: `supabase-analytics`, `supabase-auth`,
    `supabase-edge-functions`, `supabase-kong`, `supabase-meta`,
    `supabase-pooler`, `supabase-realtime`, `supabase-rest`,
    `supabase-storage`, `supabase-studio`, and `supabase-vector`.
    PostgreSQL (`supabase-db`) is excluded because DB actions quiesce it through
    PostgreSQL session termination; read-only `supabase-imgproxy` is excluded
    because it cannot write the target database. The fixed
    `/etc/cron.d/aura-board-app` path must be absent, and
    `--active-app-release`/`--active-engine-release` must be symlinks resolving
    exactly to the supplied immutable release directories.
    seal 이후 자동 rollback은 금지되며 forward failback만 허용한다.
12. 앱·cron·backup 서비스를 시작하고 최초 production write를 허용한다.
13. managed source fence는 rollback window가 닫히고 운영 승인된 뒤에만 해제하거나
   보존 정책에 따라 유지한다.

`credential_rotation` release 경계도 외부 작업이다. 먼저 operator가 old password를
복구해야 하며, `release-fence`는 temporary credential이 거부되고 old credential이
연결되는 것을 확인한 뒤에만 DB read-only/cron 변경을 prior snapshot으로 되돌린다.
역할/ACL은 rotation 중 변경하지 않으므로 도구가 grant를 복원하려 하지 않는다. old
password 복구, temporary rejection, old acceptance, 모든 pooled session 종료, 전체
non-secret snapshot exact 비교 중 하나라도 실패하면 journal은 partial-failure로
남고 성공을 보고하지 않는다.

## Promotion manifest 계약

Runtime 도구는 DB 도구가 생성한 mode-0600 `promotion-manifest.json`만 허용한다.
형식은 `format=1`, `phase=promotion-complete`, engaged fence, exact public/auth/storage
artifact records, source/target/candidate identities, rollback database name, rich journal
SHA-256으로 고정한다. legacy alias나 부분 promotion journal은 거부한다.
`--seal-before-writers`는 rich journal 옆에 mode-0600
`production-cutover-seal.json`을 원자적으로 생성한다. Runtime seal은 DB
state directory의 동일한 `operation.lock`을 잡은 뒤 marker와 runtime state를
검사·기록한다. Marker는 promotion
manifest와 rich journal의 정확한 byte SHA-256 및 절대 경로에 결합되며 rich
journal 자체는 수정하지 않는다. DB rollback은 marker가 없을 때만 허용하고,
marker가 유효하거나 malformed인 경우 모두 fail-closed한다.

The DB stdin contract uses a sorted `target_stopped_containers` list instead of
the unaudited `target_services_stopped` boolean. Candidate create/restore,
promotion, and rollback each perform a bounded `docker inspect` immediately
before their database-changing action; DB `--dry-run` does not read stdin or
invoke Docker. This includes candidate cleanup and every database rename.

## Rollback 경계

`--seal-before-writers` 전에는 candidate/target DB rename과 app/backup env를 원상복구할
수 있다. seal 이후 Oracle에 발생한 write는 managed Supabase에 자동 역복제되지 않으므로
URL만 되돌리지 않는다. clean resync, 새 write fence, final delta가 포함된 forward failback을
수행한다.
