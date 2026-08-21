# Managed Supabase → Oracle production cutover

상태: **도구 구현 완료, production source 전환 전**

현재 production source of truth는 managed Supabase다. `supabase.aura-board.com`,
Oracle nginx/TLS, self-hosted Auth/Storage, OCI S3 backend는 준비됐지만 아래 gate를
모두 통과하기 전에는 앱 환경을 self-hosted로 바꾸지 않는다.

## 2026-08-21 재개 체크포인트

이 절이 다음 작업 세션의 시작점이다. production은 계속 managed Supabase를 사용하며
write fence, password rotation, database promotion, app/backup env 교체,
`--seal-before-writers`는 **모두 미실행**이다. 마지막 외부 `/api/health`는 `200`이었다.

완료된 준비 상태:

- Library migration `20260819090000_add_teacher_content_library`를 managed source와
  Oracle target에 모두 적용했다. Prisma migration history는 양쪽 147개이며 Library
  두 테이블의 현재 row count는 모두 0이다.
- cutover 안전 보완과 Linux ARM64 gate를 통과한 뒤 live compose container 이름을
  반영한 SHA `4e8389ecfe6e090b37eb8c1d8fca3ba7f69dfe83`을 `main`에 push했다.
- self-host 공개 URL/key를 주입한 fresh immutable release를
  `/opt/aura-board-app/releases/4e8389ecfe6e090b37eb8c1d8fca3ba7f69dfe83`와
  `/opt/aura-board-play-engine/releases/4e8389ecfe6e090b37eb8c1d8fca3ba7f69dfe83`에
  생성했다. app release의 `cutover-build-manifest.json`은 root-owned mode `0600`이고,
  active `current` symlink는 아직 이전 managed-target release를 가리킨다.
- exact-SHA 도구 사본은
  `/opt/aura-board-cutover/releases/4e8389ecfe6e090b37eb8c1d8fca3ba7f69dfe83`에 있다.
  DB/runtime state directory는 각각
  `/var/lib/aura-board/production-cutover-db`와
  `/var/lib/aura-board/production-cutover-runtime`이며 root-owned mode `0700`이다.
- secret stdin contract는 DB state directory의 `contract.json`에 root-owned mode
  `0600`으로 보관했다. 값을 출력하거나 source control로 복사하지 않는다.
- self-host env 75개는 Infisical `prod`
  `/oracle/aura-board/cutover/selfhost`, rotation metadata/password는
  `/oracle/aura-board/cutover`에 저장했다. Cloudflare/S3 기존 scope는 변경하지 않았다.
- OCI managed Bastion SSH를 복구했다. target ingress는 private subnet
  `10.42.1.0/24 -> TCP/22`만 남겼고, 임시 공인 target SSH `/32`와 Bastion endpoint
  단일 `/32` NSG/security-list rule은 제거했다. 작업 중 사용한 Bastion client
  allowlist의 operator `/32`도 제거했으므로 다음 세션은 승인된 현재 IP `/32`를 다시
  추가한 뒤 연결하고 종료 시 다시 제거한다.
- cutover SHA release path를 managed-target artifact가 선점하지 않도록 GitHub
  `Deploy Oracle Production` workflow는 `disabled_manually` 상태다. cutover 완료 후
  health와 active SHA를 확인한 다음 다시 enable한다. 중간에 일반 push/deploy를 하지 않는다.

현재 중단 지점:

- secret-free connection probe에서 managed old writer credential(`writer_0`)은 성공했고,
  temporary credential(`source`)은 아직 password rotation 전이므로 예상대로 거부됐다.
- Oracle `target`/`target_admin`은 Docker internal DB IP로 host에서 직접 연결할 수 없어
  transport 단계에서 실패했다. 따라서 DB `preflight`는 완료되지 않았고 journal,
  fence, export, candidate, promotion 단계로 진행하지 않았다.

다음 세션의 실행 순서:

1. Infisical의 provisioning key로 OCI CLI를 재구성하고, 승인된 현재 client `/32`로
   managed Bastion SSH를 연결한다. public target TCP/22를 다시 열지 않는다.
2. A1에서 기존 image/tool을 우선 재사용해 self-host DB와 같은 Docker network에
   loopback-only admin proxy를 만든다. 목표 경로는 host
   `127.0.0.1:15434 -> supabase-db:5432`이며 public/wildcard bind는 금지한다.
3. root-only `contract.json`의 `target`과 `target_admin` host/port만 위 loopback 경로로
   원자 교체한다. source/rotation password와 container set은 바꾸지 않는다.
4. secret-free probe에서 `writer_0`, `target`, `target_admin` 성공과 `source`의
   password-auth 거부를 확인한 뒤 DB `preflight`를 다시 실행한다. source/target Auth
   catalog와 147개 migration history가 exact match하지 않으면 중단한다.
5. preflight가 완료된 뒤에만 maintenance window를 시작한다. app/play-engine,
   backup timer/service, video backfill, app cron과 target API/writer containers를
   정지하고 external password rotation/read-only/cron fence → `adopt-fence` → export →
   candidate restore/verify → promote → runtime write → active symlink switch → seal 순서로
   진행한다.
6. 최초 self-host production write와 health가 확인될 때까지 managed password/fence와
   rollback DB를 보존한다. seal 전 실패는 도구 rollback, seal 후 실패는 forward
   failback만 사용한다.

## 중단 조건

- managed source에서 별도 export role과 모든 writer role의 `LOGIN`/`CONNECT`를
  정확히 제어할 수 없음
- source와 target의 exact Auth/application catalog 또는 Prisma migration history가 다름
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
3. DB `preflight`로 PostgreSQL/extension, exact Auth catalog, application catalog,
   `public._prisma_migrations`와 rotation 전의 비밀 없는 source fence snapshot을
   기록한다. Application catalog는 public의 모든 semantic object와
   `storage.buckets`/`storage.objects`의 core object/dependency를 비교한다.
   `realtime`, `_realtime`, `supabase_migrations`, `private`, `extensions`, `net`,
   `pgbouncer`, `supabase_functions`는 named service-internal schema로 비교하지
   않으며, 그 밖의 schema는 비교한다. Storage에서는 다음 forward-only column/constraint만
   제외한다: `buckets.versioning_status`, `buckets_versioning_dark_check`,
   `buckets_versioning_standard_only_check`, `buckets_versioning_status_check`,
   `objects.archived_at`, `objects.is_delete_marker`, `objects.is_versioned`.
   Relation, schema, routine, type ACL은 `aclexplode`의 exact
   grantee/privilege/grantable row로 canonicalize하고 grantor 및 문자열 순서는
   무시한다. Application DR에서는 relation의 `SELECT`/non-grantable tuple과
   public schema의 `USAGE`/non-grantable tuple만 허용 목록으로 제외하며 다른
   grant는 모두 gate에 남는다. Owner는 exact 비교한다. `credential_rotation`에서는 preflight source reads가 `writer_0`
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
6. fenced source에서 `public` table-data, `auth` data (target auth schema는 retained),
   `storage.buckets/objects` data-only archive를 만든다.
7. 정지된 Oracle target을 template로 candidate DB를 만들고 candidate에만 data-only
   restore한다. Target DB owner/ACL은 preflight에 canonical snapshot으로 기록하고,
   candidate 생성·restore 전후·promotion 후 exact 검증한다. Public
   schema/ACL/owner/publication은 target clone에 남겨 둔다.
8. candidate의 exact Auth catalog, Prisma migration history, application catalog와
   data snapshot이 fenced source와 일치해야 한다. public/auth row는 전체 JSON row를
   digest하고 row count를 exact 비교하며, Storage row는 위에 열거한 forward-only
   JSON key만 제거한다. 이름 없는 추가 column/constraint/JSON key나 public/auth
   drift는 허용하지 않는다.
   Dependency subobject fingerprint는 physical number가 아니라 local/referenced
   column name을 사용하며, relation-level dependency는 NULL이다.
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
    self-host set: `realtime-dev.supabase-realtime`, `supabase-auth`,
    `supabase-edge-functions`, `supabase-envoy`, `supabase-meta`,
    `supabase-pooler`, `supabase-rest`, `supabase-storage`, and
    `supabase-studio`.
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

### Restore and catalog contract

`public.dump` is a data-only `pg_dump --schema=public` archive. Its validated
TOC contains only public `TABLE DATA` (and data-only `SEQUENCE SET`) entries;
schema, other DDL, malformed/unknown lines, duplicate entries, and out-of-scope
names fail closed. Quoted mixed-case or space-containing identifiers are parsed
without weakening scope checks. Candidate creation clones the target with the
exact recorded database owner and then restores and verifies the recorded DB
ACL. Target schema objects, exact owners, ACLs, and Realtime publication
membership therefore remain in place. The restore user and maintenance user
must both prove `rolsuper=true` in preflight, and the candidate restore user is
rechecked immediately before mutation because `--disable-triggers` requires a
superuser. The candidate-only restore first rejects any foreign key from an
out-of-scope table into the archived public table set, truncates all listed
public tables together with `RESTART IDENTITY` and no `CASCADE`, then runs
`pg_restore --data-only --single-transaction --disable-triggers`. Auth and
Storage remain data-only table restores with their existing scoped truncation.

The operator must align target owners before preflight. Owner comparison remains
exact for schemas, relations, indexes, routines, and types; library-style
restore ownership is not normalized. Catalog comparison also canonicalizes
schema, relation, routine, and type ACLs as exact
`{grantee, privilege, grantable}` lists. The only application DR exceptions are
the non-grantable `SELECT` tuple for relation ACLs and the non-grantable
`USAGE` tuple on the `public` schema. There is no routine or Auth exception;
unknown grants fail the gate.

The named service-internal schemas excluded from application comparison are
`realtime`, `_realtime`, `supabase_migrations`, `private`, `extensions`, `net`,
`pgbouncer`, and `supabase_functions`. Any other schema remains compared. Catalog
dependency subobject fingerprints use local and referenced column names, with
NULL for relation-level dependencies, so physical OID and column-order shifts
do not pass as semantic drift.

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
