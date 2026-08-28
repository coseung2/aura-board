# Oracle self-hosted Supabase + DR/백업 설계

기준일: 2026-08-23
상태: **Oracle self-hosted Supabase production cutover 완료 (2026-08-21). managed Supabase Pro는 2026-09-03까지 read-only 안정화용으로 보존. failover/failback rehearsal는 미완료**

이 문서는 Aura Board의 managed Supabase 의존성을 Oracle Cloud A1의 self-hosted Supabase로 이전할 경우, 단일 Oracle 인스턴스 장애가 전체 서비스 장애로 확대되는 위험을 어떻게 줄일지 정리한다.

현재 운영 상태의 source of truth는 [`infrastructure-handoff.md`](infrastructure-handoff.md)이며, 본 문서는 cutover 완료 후 운영 상태 기준으로 갱신했다.

## 1. 결정 요약

우선 검토 방향은 다음과 같다.

1. Oracle A1을 주 운영 환경(primary)으로 사용한다.
2. PostgreSQL, PostgREST, Realtime, Storage API는 직접 재구현하지 않고 **Supabase OSS를 self-host**한다.
3. Aura Board 애플리케이션은 현재 `@supabase/supabase-js`, RLS, Realtime 계약을 최대한 유지한다.
4. 일반 파일·이미지의 실제 object payload는 VM 로컬 디스크가 아니라 OCI Object Storage에 둔다.
5. Supabase Free + Vercel은 평상시 트래픽을 받는 active-active가 아니라 **재해복구용 warm standby 구성으로 포함**한다.
6. DB 백업은 Oracle 내부 백업만으로 끝내지 않고, 암호화된 사본을 로컬 PC/외장 디스크 및 필요 시 Google Drive 같은 Oracle 외부 위치에도 보관한다.
7. 자동 failover보다 **반자동 promotion**을 우선한다. Oracle과 DR DB가 동시에 writable한 split-brain 상태를 만들지 않는다.

### 1.1 2026-08-19~20 staging 실행 결과

설계만 있던 Phase 1은 실제 Oracle staging까지 진행됐고, 2026-08-21 production cutover로 Oracle self-hosted Supabase가 source of truth가 됐다. managed Supabase는 2026-09-03까지 read-only 안정화용으로 보존한다.

호스트/런타임 검증:

- `testauram-a1-osaka`: ARM64, 4 online CPU, 약 23 GiB RAM 확인
- 100 GB OCI Block Volume을 `aura-board` filesystem으로 초기화해 `/srv/aura-board`에 UUID 기반 영구 mount
- Docker `29.7.2`, Compose `5.5.0`; Docker/containerd data root를 `/srv/aura-board`로 이동
- official Supabase Docker upstream `e66d8eb0947973fdd8f26921a9ee3ca08474beb6` 기반 full stack 11개 service가 ARM64에서 모두 healthy
- host publish는 staging 전용 `127.0.0.1:18000`, `127.0.0.1:15432`, `127.0.0.1:16543`만 사용
- full stack 기동 후 host available memory 약 20 GiB, 기존 Next.js/play-engine health 모두 `200`

managed → staging DB 복원:

- Supabase CLI로 production dump를 생성하고 SHA-256 검증 완료
- production dump 기준 DB 약 125 MB
- managed Auth 내부 schema가 self-host Auth보다 앞선 버전이어서 full Auth data restore는 호환되지 않았음
- Aura Board는 Supabase Auth를 사용하지 않고 production `auth.users=0`, `auth.identities=0`, public schema의 Auth FK도 없음을 확인해 Auth data는 복원 대상에서 제외
- `public` schema/data와 실제 사용하는 Storage metadata(`storage.buckets`, `storage.objects`)를 transaction 단위로 staging에 복원
- staging 기준 핵심 count: `Student=646`, `Board=76`, `Card=1000`, `CardAttachment=499`, `storage.objects=1226`, Prisma migration history `146`, public RLS policy `18`
- Realtime publication은 production과 동일하게 `Card`, `CardComment`, `CardLike`, `LiveQuizPublicSession`, `LiveQuizQuestionCounterShard`, `Section` 6개 table 확인

동작 검증:

- PostgREST service-role read `200`
- share RLS: `x-share-token` 없음 → 0 row, 올바른 token → 1 row
- Realtime WebSocket join 성공, `postgres_changes` subscription 등록 후 실제 `Card` no-op `UPDATE` 이벤트 수신
- Realtime Broadcast channel join 후 실제 publish/subscribe 성공 및 동일 payload 수신
- `pg_cron 1.6.4`, `pg_net 0.20.3`, `supabase_vault 0.3.1`, logical WAL/replication slot 동작 확인
- managed Vault secret 및 DB cron job은 staging에 복제하지 않음. Oracle cron을 단일 scheduler로 유지해 duplicate callback을 방지한다.

Storage 이관 및 검증:

- production Storage: `aura-board-uploads` 1 bucket, 1,226 object, metadata 합계 1,040,594,444 bytes
- private/versioning-enabled OCI bucket `aura-board-storage`, bucket-scoped IAM group/user/policy와 Customer Secret Key를 생성
- Customer Secret Key는 A1의 root-owned mode `0600` self-hosted Supabase `.env`에만 설치하고 임시 전달 파일을 제거함. Infisical CLI가 아직 인증되지 않아 secret manager 동기화는 남아 있음
- Storage container를 `STORAGE_BACKEND=s3`, OCI S3-compatible HTTPS endpoint, path-style로 recreate한 뒤 healthy 확인
- OCI S3 direct put/get/delete probe 성공
- metadata의 `version`을 포함한 `<tenant>/<bucket>/<object>/<version>` key layout으로 1,226 object, 1,040,594,444 bytes를 이관
- OCI bucket 실제 count/bytes가 managed metadata와 정확히 일치하고 probe object는 0개임을 확인
- direct S3 sample SHA-256 8/8, self-hosted Storage API download와 managed source SHA-256 8/8 일치
- persisted managed Storage URL inventory는 11개 column, 1,173 row. 안정 endpoint `supabase.aura-board.com`을 두고 점진 backfill하는 전략으로 확정했지만 public nginx/DNS endpoint 자체는 아직 열지 않음
- 위 결과는 staging 증거이며, 2026-08-21 cutover 이후에는 Oracle self-hosted Supabase가 source of truth다. managed Supabase는 2026-09-03까지 read-only 안정화용으로 보존한다.

관리 경로:

- Bastion runner dynamic group과 최소 권한 session policy를 적용했다. 최초 `404/Unknown resource`는 target private IP 조회에 필요한 `read private-ips` 누락이 원인이었고 해당 read 권한을 추가해 해결했다.
- Bastion client CIDR allowlist는 승인된 relay와 현재 Codex 관리 endpoint의 `/32`만 추가했다.
- instance-principal session create/reuse, ACTIVE metadata 생성, local port forwarding, A1 `ubuntu` SSH 명령을 end-to-end로 검증했다.
- A1 `authorized_keys`는 기존 private backup을 남기고 Codex 관리 공개키를 원자적으로 추가했다. private key는 이동·복사하지 않았다.
- public `0.0.0.0/0:22` Security List rule을 제거하고 target private subnet 전용 TCP/22 rule로 교체했다. 외부 TCP/22는 닫혔고 같은 상태에서 Bastion SSH와 public HTTPS health `200`을 재검증했다.

### 1.2 2026-08-20 Supabase Free warm DR 실행 결과

`coseung-sk` CLI profile로 Seoul(`ap-northeast-2`)의 `aura-board-dr`을 연결하고 Oracle self-hosted PostgreSQL을 publisher, Supabase Free PostgreSQL 17.6을 subscriber로 구성했다. subscriber에서 `CREATE SUBSCRIPTION` 권한 POC를 임시 slot·외부 연결 없이 먼저 수행하고 test subscription을 삭제한 뒤 실제 구성을 시작했다.

- Oracle publisher는 TLS 1.3, hostname 검증, PostgreSQL 17 direct TLS ALPN `postgresql`, 전용 SCRAM replication role을 사용한다.
- managed Supabase outbound가 고정 IPv4가 아니며 실제 연결은 NAT64 IPv6를 사용하므로 source IP `/32` allowlist를 보안 경계로 삼지 않는다. Oracle Postgres는 Docker gateway에서 전용 replication role만 허용하고 나머지 역할을 먼저 거부한다.
- `public` catalog parity: 167 tables, 625 indexes, public/private functions 8/7, trigger 9, RLS policy 18, RLS-enabled table 167, Realtime publication 6.
- 167/167 table이 `replicating` 상태이며 source/DR 전체 count는 148,993 rows로 exact match했다.
- subscription apply/sync error count는 0, source slot은 `pgoutput` logical active 상태다.
- private heartbeat row를 1분마다 갱신해 DR로 복제한다. 수동 반복 측정에서 latest-end age 약 1.15초, Oracle `Card` no-op update의 DR `postgres_changes` 도착은 1.134초였다.
- DR PostgREST service-role read `200`; anonymous token 없음 0 row, 올바른 share token 1 row, 잘못된 token 0 row를 확인했다.
- DR Realtime Broadcast 실제 publish/subscribe와 Oracle-origin `postgres_changes` 실제 수신을 확인했다.
- Storage payload는 1,226 objects / 1,040,594,444 bytes이고 78,591,142-byte object 1개가 있다. Supabase Free의 1 GB 총량 및 50 MB 단일 파일 제한을 동시에 넘으므로 payload 복제 대신 명시적 media degraded mode를 선택했다. 이 모드에서는 DB·텍스트·보드는 유지하고 upload/delete/private download를 Storage I/O 전에 `503 media_degraded_mode`로 차단한다.

현재 replication TLS hostname은 DNS write credential 없이 검증 가능한 임시 `sslip.io` origin이다. stable `aura-board.com` 하위 DNS로 교체한 뒤 동일 TLS/ALPN 검증을 반복하는 작업은 남아 있다.

## 2. 왜 self-hosted Supabase인가

Aura Board는 Supabase를 단순 PostgreSQL 호스팅으로만 사용하지 않는다.

현재 코드에는 다음 의존성이 존재한다.

- Prisma → PostgreSQL
- 브라우저 share shell → PostgREST 직접 read/write
- `x-share-token`, `x-share-guest-id` 등 request header를 사용하는 PostgreSQL RLS
- Supabase Realtime Broadcast
- `postgres_changes`
- 모바일 Supabase Realtime
- Supabase Storage API

따라서 기존 검토안처럼 PostgreSQL + 자체 SSE + OCI SDK로 한 번에 교체하면 DB, authorization, realtime, storage transport를 동시에 재설계해야 한다.

반대로 Oracle에서 Supabase OSS를 self-host하면 애플리케이션의 기존 계약을 상당 부분 유지하면서 managed Supabase 비용과 외부 DB latency를 줄일 수 있다.

## 3. 목표 아키텍처

```text
                         PRIMARY
                  Cloudflare proxy/DNS
                          |
                          v
              Oracle A1 Flex 4 OCPU / 24 GB
              +---------------------------+
              | nginx                     |
              | Aura Board Next.js        |
              | private play engine       |
              | Supabase OSS              |
              |  - PostgreSQL             |
              |  - Supavisor              |
              |  - PostgREST              |
              |  - Realtime               |
              |  - Storage API            |
              +---------------------------+
                    |               |
                    |               +------> OCI Object Storage
                    |                        images/files/private media
                    |
                    +---- logical replication / DR ----+
                                                       |
                                                       v
                                            Supabase Free DR
                                            - Postgres
                                            - PostgREST/RLS
                                            - Realtime
                                                       |
                                                       v
                                                  Vercel DR
```

Cloudflare Stream 비디오는 현재 책임 경계를 유지하며 이 이전 대상에서 제외한다.

## 4. 장애 모델

### 4.1 애플리케이션 프로세스 장애

예: Next.js, Realtime, play-engine process crash.

대응:

- systemd/Docker restart
- health check
- 필요 시 직전 immutable release rollback

DB와 object payload에는 영향이 없어야 한다.

### 4.2 A1 VM 전체 장애

대응 후보:

1. 동일/다른 OCI A1 인스턴스 재생성 후 volume/backup 복원
2. 복구가 지연되면 Vercel + Supabase DR을 승격
3. Cloudflare origin을 DR 쪽으로 변경

중요 원칙: A1 머신 자체를 source of truth로 두지 않는다.

### 4.3 PostgreSQL volume 손상

대응:

- volume backup 또는 snapshot 복원
- logical dump 복원
- 가능하면 WAL archive를 이용한 point-in-time recovery
- 마지막 수단으로 Supabase DR replica 승격

### 4.4 OCI Object Storage 장애/삭제 사고

대응:

- Object Storage versioning 사용
- cross-region 또는 외부 object copy 유지
- application DB의 object reference와 실제 object를 함께 검증

### 4.5 Osaka 리전 장애

동일 Osaka 리전 안의 VM, volume, bucket backup만으로는 충분하지 않다.

최소 한 벌의 backup은 다른 OCI region 또는 Oracle 밖에 둔다.

### 4.6 OCI 계정/IAM/테넌시 문제

OCI 내부 cross-region copy만으로는 대응하기 어렵다.

따라서 주기적으로 Oracle 밖에 암호화된 PostgreSQL dump를 보관한다.

## 5. DB 보호 계층

DB는 한 종류의 백업에 의존하지 않는다.

### 계층 A — Warm DR replica

후보: Supabase Free PostgreSQL.

목적:

- Oracle primary가 사라졌을 때 빠른 서비스 복구
- PostgREST/RLS/Realtime 계약을 유지한 상태로 Vercel DR과 결합

방식 후보:

- PostgreSQL logical replication
- Oracle self-hosted PostgreSQL: publisher
- Supabase Free PostgreSQL: subscriber

주의:

- schema/DDL은 logical replication만으로 자동 동기화된다고 가정하지 않는다.
- Prisma migration은 primary와 DR schema에 모두 적용한다.
- sequence, role, extension, RLS/policy 등 row replication 밖의 객체를 별도 검증한다.
- Supabase Free 한도보다 DB가 커지면 이 전략을 재평가한다.

### 계층 B — OCI 자동 DB backup

현재 [`../infra/oracle/backup-supabase.sh`](../infra/oracle/backup-supabase.sh)는 다음 흐름을 이미 제공한다.

```text
pg_dump custom format
  -> pg_restore --list 검증
  -> SHA-256 manifest
  -> OCI Object Storage no-overwrite upload
```

self-hosting 후 이 스크립트를 `원격 Supabase 백업`이 아니라 `Oracle local PostgreSQL DR backup` 용도로 전환한다.

현재 timer는 일 1회이므로 실제 RPO 요구사항에 맞춰 주기를 다시 설계한다.

### 계층 C — WAL archive / PITR

일 1회 dump만으로는 최악의 경우 거의 하루치 쓰기가 손실될 수 있다.

목표 RPO가 15분 이내라면 PostgreSQL WAL archive를 추가해 full backup 이후 변경을 지속 보관하는 방식을 우선 검토한다.

WAL과 full backup은 동일한 장애 영역 하나에만 저장하지 않는다.

### 계층 D — Oracle 외부 암호화 백업

DB 규모가 작은 동안에는 단순하고 강력한 마지막 방어선이다.

후보:

- 개인 PC의 별도 데이터 디스크
- 외장 HDD/SSD
- Google Drive
- 기타 별도 cloud storage

원칙:

1. 평문 DB dump를 consumer cloud drive에 직접 올리지 않는다.
2. dump를 client-side encryption한 뒤 업로드한다.
3. 복호화 키는 같은 Drive 폴더에 두지 않는다.
4. Infisical 또는 별도 password manager에 recovery key를 보관한다.
5. 로컬 PC 내부 디스크 하나만을 유일한 offsite backup으로 간주하지 않는다.

예시 산출물:

```text
aura-db-20260819.dump.age
aura-db-20260819.dump.sha256
```

## 6. Object Storage 보호

일반 이미지/파일의 실제 payload는 self-hosted Supabase Storage API 뒤의 OCI Object Storage에 둔다.

권장:

- VM local filesystem을 production object source of truth로 사용하지 않음
- bucket versioning 활성화
- lifecycle policy는 backup 보존 정책과 충돌하지 않게 설정
- cross-region 또는 외부 copy 유지
- DB의 object reference와 object 존재 여부를 restore rehearsal에서 같이 검증

Supabase Free Storage는 warm DR의 필수 구성요소로 간주하지 않는다. 현재 Aura Board의 object volume은 Free Storage 한도와 너무 근접할 수 있으므로, DR 앱이 OCI 또는 별도 replicated object store를 읽도록 설계하는 편을 우선한다.

## 7. Vercel + Supabase Free DR

이 DR 구성은 이번 이관 범위에 포함한다. Oracle Osaka primary가 장시간 복구되지 않을 때
Vercel runtime과 Supabase Free DB/PostgREST/RLS/Realtime을 승격해 서비스를 재개하는
warm standby 경로로 운영한다. 평상시 사용자 트래픽은 받지 않는다.

단, OCI Osaka Object Storage를 유일한 object payload 저장소로 유지하면 Osaka 리전
장애 시 DR 앱이 이미지·파일을 읽지 못할 수 있다. 따라서 Phase 3에서 DB 복제와 별도로
object payload 복제 또는 media degraded-mode 정책을 확정해야 한다.

### 역할

- Vercel: 애플리케이션 runtime DR
- Supabase Free: PostgreSQL/PostgREST/RLS/Realtime DR

같은 Git commit에서 environment만 다르게 구성하는 것을 목표로 한다.

```text
Oracle production build
  DATABASE_URL -> self-hosted Supabase/Postgres
  SUPABASE_URL -> Oracle self-hosted endpoint

Vercel DR build
  DATABASE_URL -> Supabase DR
  SUPABASE_URL -> Supabase DR endpoint
```

DR은 평상시 user traffic을 받지 않는 warm standby로 둔다.

### Health check

DR 프로젝트가 실제 복구 가능한 상태인지 주기적으로 확인한다.

저장소의 `.github/workflows/dr-watchdog.yml`가 15분마다 DR Vercel의
`/api/health`를 호출한다. 이 endpoint는 DR database reachability와
`private.aura_dr_heartbeat`의 freshness를 함께 판정하므로, HTTP 200이 아니거나
replication이 stale/paused이면 workflow가 실패한다. `AURA_DR_HEALTH_URL`은
`https://.../api/health` 형식의 repository variable로 설정한다. endpoint에 Vercel
Deployment Protection이 적용된 경우에만 `VERCEL_DR_PROTECTION_BYPASS` repository
secret을 추가한다. watchdog은
자동 failover, subscriber promotion, Supabase unpause, DB write를 수행하지 않는다.
DR Vercel production 환경에는 `AURA_DR_EXPECT_REPLICATION=true`와 유효한
`AURA_DR_MAX_HEARTBEAT_AGE_SECONDS`를 설정해야 한다. 이 flag가 빠지면 health route는
database reachability만 반환하므로 watchdog이 의도적으로 실패한다.

Free project가 pause된 경우 watchdog은 이를 감지할 뿐 자동으로 깨우지 않는다.
Unpause와 replication 재연결은 올바른 Supabase project owner 권한으로 수동 복구한
뒤, watchdog 성공과 마지막 heartbeat/lag 증거를 확인해야 한다.

최소 확인 항목:

- DB connection 성공
- replication lag
- 최신 heartbeat row 또는 기준 row의 timestamp
- PostgREST read
- 주요 RLS policy 동작
- Realtime subscription
- Vercel DR deployment health

Supabase Free의 자동 pause/제한 정책에 의존하지 않도록, 실제 DR health check를 통해 프로젝트가 살아 있는지 검증한다.

## 8. Failover 원칙

초기에는 fully automatic failover를 구현하지 않는다.

잘못된 자동 전환은 다음 split-brain을 만들 수 있다.

```text
Oracle 일시 timeout
  -> DR 자동 promotion
  -> Oracle recovery
  -> 양쪽 writable
  -> 데이터 divergence
```

따라서 초기 runbook은 다음 순서를 따른다.

1. Oracle 장애가 일시적 process failure가 아닌지 확인
2. primary write 경로 차단 또는 primary가 완전히 unavailable한지 확인
3. replication lag 확인
4. 마지막 replicated timestamp/LSN 기록
5. DR subscriber promotion
6. DR 앱 write smoke test
7. Cloudflare origin을 Vercel DR로 전환
8. 로그인, 공유보드, 주요 CRUD, Realtime 검증
9. incident 종료 전 primary Oracle을 다시 writable로 올리지 않음

## 9. Failback 원칙

DR에서 쓰기가 발생한 뒤에는 기존 Oracle DB를 단순 재가동해 primary로 되돌리지 않는다.

권장 흐름:

1. DR을 현재 source of truth로 선언
2. 새 Oracle PostgreSQL을 clean target으로 준비
3. DR -> Oracle 재동기화/restore
4. consistency 검증
5. maintenance window에서 write freeze
6. final delta 반영
7. Oracle을 새 primary로 전환
8. Supabase Free를 다시 subscriber/warm standby로 재구성

## 10. 백업 보존안

초기 제안:

| 종류 | 주기 | 보존 | 위치 |
| --- | --- | --- | --- |
| WAL | 지속 | RPO에 맞게 | OCI + 필요 시 타 리전 |
| DB logical dump | 매일 | 최근 7일 | OCI Object Storage |
| 주간 dump | 주 1회 | 8주 | OCI + Oracle 외부 |
| 월간 dump | 월 1회 | 12개월 | Oracle 외부 암호화 보관 |
| Block Volume backup | 정책 기반 | 비용/용량 재검토 | OCI |
| Object versions | lifecycle 기반 | 별도 정책 | OCI Object Storage |

DB 크기가 작을 때는 보존 기간을 넉넉히 두고 실제 storage 사용량을 측정한 뒤 조정한다.

## 11. 로컬 PC / Google Drive 사용 원칙

로컬 하드나 Google Drive는 **좋은 3차/4차 백업 위치**다. 다만 production recovery automation의 1차 저장소로 사용하지 않는다.

권장 사용:

- 매주 encrypted dump 자동 또는 반자동 다운로드
- 외장 디스크에도 복사
- Google Drive에는 encrypted artifact만 업로드
- checksum manifest 같이 보관
- 분기/월 단위로 실제 restore test

Google Drive나 로컬 PC에 보관된 backup은 `Oracle 전체 접근 불가` 또는 `cloud account/IAM 사고` 시 사람이 꺼내 쓰는 최후 복구본으로 간주한다.

## 12. Restore rehearsal

백업은 생성 성공이 아니라 **복구 성공**으로 검증한다.

월 1회 이상 다음 절차를 실행하는 것을 목표로 한다.

1. 격리된 PostgreSQL 준비
2. 최신 full dump 다운로드
3. SHA-256 검증
4. `pg_restore`
5. Prisma migration 상태 확인
6. 핵심 table row count 비교
7. 대표 사용자/board/share relation 무결성 확인
8. RLS/policy/extension 존재 확인
9. 대표 object reference가 Storage에서 실제 열리는지 확인
10. 소요 시간 기록

restore rehearsal은 production write를 발생시키지 않는다.

## 13. 초기 목표 RPO / RTO

초기 설계 목표:

- **RPO: 15분 이내**
- **RTO: 약 1시간 이내**

의미:

- 장애 시 최대 데이터 손실 목표: 약 15분 이하
- 새 primary 확보가 가능하다는 전제에서 서비스 재개 목표: 약 1시간 이내

실제 값은 self-hosted Supabase와 logical replication/WAL archive를 운영해 측정한 뒤 갱신한다.

## 14. 구현 우선순위

### Phase 0 — 문서/검증만

- [x] 방향 기록
- [x] 현재 managed Supabase DB/Storage 실사용량 재측정
- [ ] Oracle PAYG A1 무료 할당량과 실제 tenancy billing 확인 — Always Free 계산은 확인했지만 billing 화면 실측은 별도
- [x] Vercel DR project/plan 조건 확인 — `aura-board-dr` project 생성과 Next.js preset/Seoul runtime 설정을 확인했고, Supabase DR 연결 후 exact-SHA production deployment는 Phase 3에서 별도 검증 완료
- [ ] Supabase Free DB/Realtime 한도와 현재 aura-board 사용량 비교

### Phase 1 — Oracle self-hosted Supabase staging

- [x] A1 4 OCPU / 24 GB resize 및 live host 확인
- [x] Supabase OSS ARM64 runtime 검증
- [x] PostgreSQL/Docker용 100 GB 별도 Block Volume 배치
- [x] managed Supabase `public` schema/data + Storage core metadata staging restore
- [x] PostgREST/RLS 검증
- [x] Realtime `postgres_changes` 실제 event 검증
- [x] Realtime Broadcast 실제 publish/subscribe 검증
- [x] Storage object payload 1,226건 staging migration + sample SHA-256 8/8 검증
- [x] Storage API -> OCI Object Storage S3 backend 및 API download SHA-256 8/8 검증
- [x] persisted `*.supabase.co/storage/v1/object/` URL inventory(11 column/1,173 row) 및 endpoint/backfill 전략 확정
- [x] `supabase.aura-board.com` public nginx/TLS 및 Cloudflare proxied DNS endpoint 구축. Auth/REST unauthenticated `401`, Storage status `200`, Auth/Storage healthy 확인. private/signed download와 persisted URL 최종 smoke는 app-env cutover gate로 유지
- [x] Bastion session keeper IAM policy 적용, local port-forwarding SSH E2E, public TCP/22 폐쇄 검증

### Phase 2 — Backup hardening

- [ ] 기존 `backup-supabase.sh`를 local PostgreSQL backup으로 전환
- [x] full dump retention policy — private OCI bucket의 backup prefix에 30일 lifecycle 적용
- [ ] WAL archive/PITR 설계 및 테스트
- [ ] OCI cross-region 또는 외부 copy
- [x] encrypted local/offsite backup 도구 — AES-256-GCM+scrypt, 원자적 no-overwrite publish와 변조/오암호 거부 검증
- [x] restore rehearsal 자동화 — digest-pinned Supabase PG17 ARM64 격리 컨테이너와 실제 A1 full dump 복원 통과

2026-08-20 검증에서는 `restore-rehearsal.sh`가 실제 self-hosted Supabase full dump의 checksum/archive를 재검증하고, network/port가 없는 read-only 컨테이너의 bounded tmpfs에 복원했다. Supabase PG17 이미지가 요구하는 최소 capability와 임시 pgsodium key만 제공했으며 복원 후 소유 label이 일치하는 컨테이너만 제거되고 잔존 컨테이너가 없음을 확인했다. `offsite-backup.mjs`는 실제 암복호화 round trip, wrong passphrase, tamper, malformed header/KDF, symlink, destination race 및 decrypt no-overwrite를 검증한다. 다만 암호화 도구가 Oracle 외부 위치로 파일을 전송하지는 않으므로 실제 offsite 사본 배치는 별도 미완료 항목이다.

### Phase 3 — Supabase Free / Vercel warm DR (범위 포함)

- [x] `coseung-sk` CLI profile로 Seoul `aura-board-dr` 생성·연결 및 secret manager 분리 보관
- [x] DR Supabase schema/RLS/catalog parity 구축
- [x] Oracle → Supabase Free logical replication 실제 167-table 초기 copy·추종
- [x] DDL migration 동기화 절차 — affected write fence, DR에 migration SQL 선적용, Oracle에 Prisma migration 적용, migration history row 복제, 신규 table publication refresh, catalog 비교 순서
- [x] replication lag heartbeat 1분 갱신 및 DR health fail-closed 계약
- [x] Vercel DR project 생성 및 Next.js framework preset 적용
- [x] Vercel DR production env 42개를 production-only로 주입하고 DB/Supabase 값을 DR로 교체
- [x] Vercel DR exact-SHA deployment 및 `/api/health` 검증 — `f35286e1`, production `READY`, `icn1`, DB reachable, replication fresh, degraded notice 확인
- [x] Osaka Object Storage 장애 시 media degraded-mode 구현·행동 테스트
- [ ] Cloudflare 수동 failover runbook
- [ ] failback rehearsal

### Phase 4 — Production cutover

- [x] managed Supabase -> Oracle self-hosted cutover (2026-08-21 완료)
- [x] 웹/모바일 endpoint 전환 (Oracle production으로 전환 완료)
- [x] rollback window: seal 완료로 managed rollback 종료. managed Supabase는 2026-09-03까지 read-only 안정화용으로 보존
- [x] DR replica 정상 추종 확인
- [x] backup/restore 재검증

2026-08-21 완료: production DB password rotation, read-only/pg_cron fence, export,
candidate restore/verify, promotion, runtime env write, release switch 및
`--seal-before-writers`를 완료했다. 같은 날짜의 아래 preflight/중단 기록은 cutover
완료 전의 이력이며 운영 상태 판단은 `production-cutover-runbook.md`의 최신 상태를
단일 기준으로 사용한다.

## 15. 하지 않을 것

초기 범위에서 다음은 하지 않는다.

- Oracle과 Supabase DR 양쪽을 동시에 writable로 운영
- 자체 Realtime/SSE를 Supabase Realtime보다 먼저 도입
- production DB dump 평문을 Google Drive에 저장
- VM 로컬 filesystem을 유일한 Storage source of truth로 사용
- backup 생성 성공만 보고 restore rehearsal 생략
- 장애 감지 즉시 완전 자동 DR promotion
- 기존 Oracle primary와 DR primary를 검증 없이 다시 merge

## 16. 관련 파일

- [`infrastructure-handoff.md`](infrastructure-handoff.md) — 현재 4-provider 운영 상태
- [`../infra/oracle/README.md`](../infra/oracle/README.md) — Oracle 운영 runbook
- [`../infra/oracle/backup-supabase.sh`](../infra/oracle/backup-supabase.sh) — 현재 PostgreSQL logical backup 기반
- [`../infra/oracle/aura-supabase-backup.service`](../infra/oracle/aura-supabase-backup.service) — backup systemd unit
- [`../infra/oracle/aura-supabase-backup.timer`](../infra/oracle/aura-supabase-backup.timer) — 현재 daily timer
- [`architecture.md`](architecture.md) — 현재 Supabase/PostgREST/Realtime 애플리케이션 계약

## 17. 다음 결정 사항

다음 구현/cutover 전에 아래를 확정한다.

1. **결정됨:** primary PostgreSQL/Docker data volume은 Osaka 100 GB Block Volume(`/srv/aura-board`)을 사용
2. OCI Storage 전용 private bucket 이름/compartment와 Customer Secret Key 발급 주체 및 최소 IAM policy
3. Storage S3 backend 전환 전 1,226개 payload migration/검증 순서와 rollback 보존 기간
4. persisted managed Supabase public URL을 stable aura-board domain/proxy로 유지할지 DB backfill할지
5. WAL archive 대상 bucket/region
6. Oracle 외부 backup 위치: 로컬 외장 디스크만 둘지, Google Drive까지 둘지
7. 암호화 도구와 recovery key 보관 위치
8. **결정됨:** Supabase Free를 logical replica로 사용
9. **결정됨:** Vercel DR deployment를 warm standby로 포함
10. DR object payload 복제 또는 media degraded-mode 정책
11. manual failover 승인 기준과 담당자
12. 목표 RPO/RTO를 실제 운영 요구에 맞게 유지할지 조정할지
