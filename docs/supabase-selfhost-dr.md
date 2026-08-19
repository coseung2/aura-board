# Oracle self-hosted Supabase + DR/백업 설계

기준일: 2026-08-19  
상태: **설계 기록 / 미적용**

이 문서는 Aura Board의 managed Supabase 의존성을 Oracle Cloud A1의 self-hosted Supabase로 이전할 경우, 단일 Oracle 인스턴스 장애가 전체 서비스 장애로 확대되는 위험을 어떻게 줄일지 정리한다.

현재 운영 상태의 source of truth는 [`infrastructure-handoff.md`](infrastructure-handoff.md)이며, 이 문서의 내용은 실제 cutover 전까지 운영 상태로 간주하지 않는다.

## 1. 결정 요약

우선 검토 방향은 다음과 같다.

1. Oracle A1을 주 운영 환경(primary)으로 사용한다.
2. PostgreSQL, PostgREST, Realtime, Storage API는 직접 재구현하지 않고 **Supabase OSS를 self-host**한다.
3. Aura Board 애플리케이션은 현재 `@supabase/supabase-js`, RLS, Realtime 계약을 최대한 유지한다.
4. 일반 파일·이미지의 실제 object payload는 VM 로컬 디스크가 아니라 OCI Object Storage에 둔다.
5. Supabase Free + Vercel은 평상시 트래픽을 받는 active-active가 아니라 **재해복구용 warm standby** 후보로 유지한다.
6. DB 백업은 Oracle 내부 백업만으로 끝내지 않고, 암호화된 사본을 로컬 PC/외장 디스크 및 필요 시 Google Drive 같은 Oracle 외부 위치에도 보관한다.
7. 자동 failover보다 **반자동 promotion**을 우선한다. Oracle과 DR DB가 동시에 writable한 split-brain 상태를 만들지 않는다.

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
                    +---- logical replication 후보 ----+
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
- [ ] 현재 managed Supabase DB/Storage 실사용량 재측정
- [ ] Oracle PAYG A1 무료 할당량과 실제 tenancy billing 확인
- [ ] Vercel DR 플랜/사용 조건 확인
- [ ] Supabase Free DB/Realtime 한도와 현재 Aura 사용량 비교

### Phase 1 — Oracle self-hosted Supabase staging

- [ ] A1 4 OCPU / 24 GB resize
- [ ] Supabase OSS ARM64 runtime 검증
- [ ] PostgreSQL 별도 volume 배치
- [ ] PostgREST/RLS 검증
- [ ] Realtime Broadcast + `postgres_changes` 검증
- [ ] Storage API -> OCI Object Storage 검증

### Phase 2 — Backup hardening

- [ ] 기존 `backup-supabase.sh`를 local PostgreSQL backup으로 전환
- [ ] full dump retention policy
- [ ] WAL archive/PITR 설계 및 테스트
- [ ] OCI cross-region 또는 외부 copy
- [ ] encrypted local/offsite backup
- [ ] restore rehearsal 자동화

### Phase 3 — Supabase Free / Vercel warm DR

- [ ] DR Supabase schema/RLS 구축
- [ ] logical replication proof-of-concept
- [ ] DDL migration 동기화 절차
- [ ] replication lag monitor
- [ ] Vercel DR deployment
- [ ] Cloudflare 수동 failover runbook
- [ ] failback rehearsal

### Phase 4 — Production cutover

- [ ] managed Supabase -> Oracle self-hosted cutover
- [ ] 웹/모바일 endpoint 전환
- [ ] rollback window 유지
- [ ] DR replica 정상 추종 확인
- [ ] backup/restore 재검증

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

실제 구현 전에 다음을 확정한다.

1. PostgreSQL data volume 크기와 backup volume 정책
2. WAL archive 대상 bucket/region
3. Oracle 외부 backup 위치: 로컬 외장 디스크만 둘지, Google Drive까지 둘지
4. 암호화 도구와 recovery key 보관 위치
5. Supabase Free를 logical replica로 실제 사용할지
6. Vercel DR이 현재 서비스 운영 조건에 적합한지
7. manual failover 승인 기준과 담당자
8. 목표 RPO/RTO를 실제 운영 요구에 맞게 유지할지 조정할지
