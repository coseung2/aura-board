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
로그, 문서 또는 journal에 기록하지 않는다. `--dry-run`은 stdin과 외부 도구를
읽지 않는다.

## 실행 순서

1. 도구를 versioned release로 배포하고 Linux 행동 테스트를 실행한다.
2. self-host 공개 URL/key를 build process에 주입해 fresh Next.js artifact를 빌드하고
   `create-cutover-build-manifest.py`로 server artifact digest와 공개 env value hash를
   기록한다. Runtime `--write`와 `--seal-before-writers`는 이 manifest가 없으면 실패한다.
3. DB `preflight`로 PostgreSQL/extension, 전체 Auth catalog, cross-schema catalog,
   `public._prisma_migrations`를 비교한다.
4. `engage-fence`로 명시된 managed writer role의 LOGIN/CONNECT와 pg_cron을 차단하고
   실제 writer credential 재접속·write 실패를 확인한다.
5. fenced source에서 `public`, `auth` data, `storage.buckets/objects` archive를 만든다.
6. 정지된 Oracle target을 template로 candidate DB를 만들고 candidate에만 restore한다.
7. candidate catalog/data/migration digest가 fenced source와 정확히 일치해야 한다.
8. target→rollback, candidate→target 순서로 rename하고 `promotion-manifest.json`을
   원자적으로 기록한다. partial rename은 자동 recovery 후 중단한다.
9. Runtime tool이 promotion manifest와 fresh build manifest를 검증한 뒤 app/backup env를
   원자적으로 교체한다. 두 파일 중 하나라도 실패하면 bytes·uid·gid·mode를 모두 복구한다.
10. artifact 배포가 확인되면 writer 서비스 시작 전에 `--seal-before-writers`를 실행한다.
    seal 이후 자동 rollback은 금지되며 forward failback만 허용한다.
11. 앱·cron·backup 서비스를 시작하고 최초 production write를 허용한다.
12. managed source fence는 rollback window가 닫히고 운영 승인된 뒤에만 해제하거나
    보존 정책에 따라 유지한다.

## Promotion manifest 계약

Runtime 도구는 DB 도구가 생성한 mode-0600 `promotion-manifest.json`만 허용한다.
형식은 `format=1`, `phase=promotion-complete`, engaged fence, exact public/auth/storage
artifact records, source/target/candidate identities, rollback database name, rich journal
SHA-256으로 고정한다. legacy alias나 부분 promotion journal은 거부한다.

## Rollback 경계

`--seal-before-writers` 전에는 candidate/target DB rename과 app/backup env를 원상복구할
수 있다. seal 이후 Oracle에 발생한 write는 managed Supabase에 자동 역복제되지 않으므로
URL만 되돌리지 않는다. clean resync, 새 write fence, final delta가 포함된 forward failback을
수행한다.
