# Aura Board Supabase self-host staging

상태: **staging 준비용 / production 미적용**

이 디렉터리는 Oracle A1 4 OCPU / 24 GB에서 공식 Supabase Docker 구성을 먼저 병렬 검증하기 위한 도구다. 운영 DNS, nginx, 현재 managed Supabase, production `DATABASE_URL`은 이 단계에서 변경하지 않는다.

## Upstream pin

초기 staging은 Supabase upstream commit을 다음 SHA로 고정한다.

```text
e66d8eb0947973fdd8f26921a9ee3ca08474beb6
```

해당 SHA의 공식 `docker/` 구성을 그대로 가져온 뒤 staging 전용 포트만 loopback으로 제한한다. upstream 갱신은 별도 검토와 ARM64 재검증 후 수행한다.

공식 self-host Docker 문서의 현재 요구사항은 최소 2 CPU / 4 GB RAM / 40 GB SSD, 권장 4 CPU+ / 8 GB+ / 80 GB+ SSD다. Aura Board의 4 OCPU / 24 GB resize는 CPU/RAM 권장치를 충족하지만, 실제 free disk와 기존 workload headroom은 서버에서 반드시 확인한다.

## 안전 경계

staging 기본 포트:

```text
Supabase API gateway   127.0.0.1:18000
Postgres session       127.0.0.1:15432
Supavisor transaction  127.0.0.1:16543
```

외부 인터넷에 staging Postgres/API를 직접 노출하지 않는다. production 검증 전에는 nginx route도 추가하지 않는다.

Auth는 Aura Board production 인증에 사용하지 않으므로 staging에서 신규 가입을 비활성화한다. 다만 official compose dependency 검증을 위해 첫 ARM64 smoke에서는 전체 기본 stack을 실행한다. 서비스 제거/경량화는 전체 stack이 정상 기동한 뒤 별도 단계에서 한다.

## 1. 호스트 preflight

서버에서 reviewed checkout 기준으로 실행한다.

```bash
sudo bash infra/oracle/supabase-selfhost/preflight.sh
```

확인 항목:

- ARM64
- 4개 이상 online CPU
- 약 24 GB RAM
- Docker / Docker Compose
- staging loopback port 충돌
- dedicated `/srv/aura-board` mount와 free disk
- Docker data-root가 `/srv/aura-board/docker`인지
- 현재 상위 RSS process

preflight가 RAM/CPU/port 조건에서 실패하면 staging bootstrap을 진행하지 않는다.

## 2. staging bootstrap

Docker가 준비된 뒤:

```bash
sudo bash infra/oracle/supabase-selfhost/bootstrap-staging.sh
```

bootstrap은 다음만 수행한다.

1. 공식 `supabase/supabase` repository를 임시 clone
2. 고정된 upstream SHA checkout 검증
3. `/srv/aura-board/supabase`에 official `docker/` 파일 복사
4. staging 전용 `.env` 생성 및 secret 생성
5. 신규 Auth signup 비활성화
6. API/DB/Supavisor host port를 loopback 전용으로 변경
7. `docker compose config --quiet`
8. container image pull

**컨테이너는 자동 시작하지 않는다.** 운영 workload를 관찰하면서 별도 명령으로 시작한다.

staging `.env`는 `/srv/aura-board/supabase/.env`에만 존재하며 source control에 넣지 않는다. bootstrap은 이미 staging directory가 있으면 overwrite하지 않고 실패한다.

## 3. ARM64 image pull 결과 확인

bootstrap이 `docker compose pull`까지 성공하면 첫 번째 ARM64 gate를 통과한 것이다. pull 실패 이미지가 하나라도 있으면 production 계획을 중단하고 해당 service/image의 multi-arch 지원을 조사한다.

```bash
cd /srv/aura-board/supabase
sudo docker compose images
```

## 4. 첫 기동

기존 backup/video heavy job이 실행 중이 아닌지 확인하고 시작한다.

```bash
systemctl is-active aura-supabase-backup.service || true
systemctl is-active aura-video-thumbnail-backfill.service || true

cd /srv/aura-board/supabase
sudo docker compose up -d --wait
sudo docker compose ps
```

실패 시 production 서비스는 건드리지 말고 staging log만 확인한다.

```bash
sudo docker compose ps
sudo docker compose logs --tail=200
```

## 5. loopback smoke

```bash
curl --fail http://127.0.0.1:18000/rest/v1/
```

Postgres/Supavisor는 staging `.env`의 generated credentials를 사용해 loopback에서만 확인한다. credential 값은 shell history, issue, PR, 문서에 기록하지 않는다.

API gateway가 `0.0.0.0` 또는 public NIC에 listen하면 실패로 간주한다.

```bash
ss -ltnp | grep -E ':(18000|15432|16543)\b'
```

모든 host bind가 `127.0.0.1`이어야 한다.

## 6. 리소스 관찰

전체 stack이 올라온 뒤 최소 다음 증거를 기록한다.

```bash
free -h
df -h / /srv/aura-board
docker stats --no-stream
systemctl show -p MemoryCurrent,MemoryPeak,CPUUsageNSec aura-board-app.service
systemctl show -p MemoryCurrent,MemoryPeak,CPUUsageNSec aura-play-engine.service
```

첫 목표는 "기동된다"가 아니라 **현재 Aura Board app/play-engine을 유지하면서 충분한 memory/CPU/disk headroom이 있는지** 확인하는 것이다.

## 7. 기능 검증 순서

전체 stack/ARM64 smoke가 통과한 뒤 다음 순서로 진행한다.

1. Postgres 17 및 extension inventory
2. 현재 Prisma schema/migrations restore
3. PostgREST + share RLS/header policy
4. Realtime Broadcast
5. `postgres_changes`
6. web share shell
7. mobile Realtime
8. Supabase Storage API
9. Storage backend를 OCI Object Storage로 전환
10. backup/restore rehearsal

managed Supabase production 데이터는 위 기반 검증 전에는 옮기지 않는다.

## 8. 중지/제거

staging 중지:

```bash
cd /srv/aura-board/supabase
sudo docker compose down
```

`down -v`, official `reset.sh`, staging directory 삭제는 PostgreSQL/Storage 데이터를 파괴할 수 있으므로 별도 승인 없이 실행하지 않는다.

## 9. production cutover 금지 사항

이 staging 단계에서는 다음을 하지 않는다.

- production `DATABASE_URL` 변경
- `NEXT_PUBLIC_SUPABASE_URL` 변경
- mobile `EXPO_PUBLIC_SUPABASE_URL` 변경
- Cloudflare DNS 변경
- nginx public Supabase endpoint 추가
- managed Supabase project 종료/다운그레이드
- production Storage object 이동/삭제
- logical replication 설정
- DR Supabase promotion

이 항목들은 staging 검증과 별도 cutover runbook 이후 수행한다.
