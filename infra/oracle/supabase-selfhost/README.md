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

staging Storage global file limit은 managed `aura-board-uploads` bucket의 100 MB 제한과 맞춰 `104857600` bytes로 둔다. official compose 기본 50 MB를 그대로 사용하면 기존 50 MB 초과 object 복원이 실패한다.

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

## 8. Storage payload staging migration

DB restore로 `storage.buckets`와 `storage.objects` metadata를 먼저 복원한 뒤 실제 object payload를 별도로 복사한다. `migrate-storage.py`는 production managed Storage를 service-role로 읽는다. 기본 `storage-api` mode는 loopback self-hosted Storage API에 기존 object를 `PUT`으로 갱신한다. 다만 metadata가 payload보다 먼저 복원된 경우 Storage API의 upsert가 거부될 수 있으므로, 이 순서의 staging migration에는 `--target-mode s3-direct`를 반드시 사용한다. direct mode는 OCI S3-compatible endpoint에 boto3 S3v4 path-style로 직접 기록하며 object 이름이나 credential 값은 로그에 남기지 않는다.

2026-08-19 staging 기준선은 `aura-board-uploads` 1개 bucket, 1,226 objects, metadata 기준 1,040,594,444 bytes다. 실행 전에는 반드시 dry-run count/bytes가 production 기준선과 맞는지 확인한다.

```bash
sudo python3 /srv/aura-board/migration/migrate-storage.py --target-mode s3-direct --dry-run
sudo systemd-run \
  --unit=aura-storage-migrate \
  --collect \
  --property=Nice=10 \
  --property=CPUQuota=100% \
  --property=MemoryMax=1G \
  python3 /srv/aura-board/migration/migrate-storage.py \
  --target-mode s3-direct --verify-samples 8
sudo journalctl -u aura-storage-migrate.service -f
```

dry-run 로그의 `manifest_sha256`는 C 순서의 object metadata 이름·크기·MIME·`version`
manifest 식별자다. 중단 후 재개할 때는 같은 dry-run에서 확인한 digest를 함께 지정한다.
재개 실행은 `status=partial`과 exit code `2`를 반환하므로, 전체 bucket 완료로
간주하지 말고 마지막에 전체 dry-run/count와 sample hash를 다시 확인한다.

```bash
python3 /srv/aura-board/migration/migrate-storage.py \
  --target-mode s3-direct \
  --start-index <next-index> \
  --expected-manifest-sha256 <dry-run-manifest-sha256> \
  --verify-samples 8
```

`storage-api` mode의 source credential은 `/etc/aura-board/app.env`의 `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`, target credential은 `/srv/aura-board/supabase/.env`의
`SERVICE_ROLE_KEY`에서 읽는다. `s3-direct` mode는 target `.env`에서
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GLOBAL_S3_ENDPOINT`,
`GLOBAL_S3_BUCKET`, `REGION`, `STORAGE_TENANT_ID`만 읽고 `boto3`를 사용한다.
source는 읽기만 하고 target staging만 갱신한다. 성공 후 크기 구간별 sample object를
source와 target에서 다시 다운로드해 SHA-256을 비교한다. direct mode의 target
검증은 Storage API를 거치지 않는다.

### OCI Object Storage backend 전환 전제

self-hosted Storage의 S3 backend는 OCI CLI Instance Principal이 아니라 S3-compatible Access Key / Secret Key가 필요하다. OCI에서는 별도 Customer Secret Key를 사용하고, Storage 전용 bucket을 backup bucket과 분리한다. credential은 source control이나 shell history에 기록하지 않는다.

전환 시 Storage container에 최소 다음 값을 주고 staging에서 먼저 검증한다.

```text
STORAGE_BACKEND=s3
GLOBAL_S3_BUCKET=<storage-only-bucket>
GLOBAL_S3_ENDPOINT=https://<namespace>.compat.objectstorage.ap-osaka-1.oci.customer-oci.com
GLOBAL_S3_PROTOCOL=https
GLOBAL_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=<customer-secret-access-key>
AWS_SECRET_ACCESS_KEY=<customer-secret-key>
REGION=ap-osaka-1
STORAGE_TENANT_ID=<storage-tenant-id>
```

`STORAGE_TENANT_ID`는 Storage container가 사용하는 tenant ID이며 configurator가
관리하는 S3 설정 8개에는 포함되지 않는다. direct mode의 object key는 Storage
upstream의 `withOptionalVersion` 계약을 따른다. 기본은 version이 있을 때
`<tenant-id>/<metadata bucket id>/<object name>/<version>`이고 version이 null/empty면
suffix가 없다. `TUS_USE_FILE_VERSION_SEPARATOR=true`인 배포는 `/version` 대신
`-$v-<version>`을 사용한다.

### S3 환경변수 안전 설정

기존 self-hosted Docker `.env`에 위 설정을 적용할 때는 다음 CLI를 사용한다.
`--env-file`, bucket, endpoint, region은 인자로 전달하지만 Access Key와 Secret
Key는 **단일 JSON 객체로 stdin에서만** 전달한다. 비밀값을 인자, shell history,
문서, 로그에 넣지 않는다.

먼저 stdin을 읽지 않고 파일도 변경하지 않는 dry-run을 실행한다.

```bash
sudo python3 /srv/aura-board/migration/configure-storage-s3.py \
  --env-file /srv/aura-board/supabase/.env \
  --bucket <storage-only-bucket> \
  --endpoint https://<namespace>.compat.objectstorage.ap-osaka-1.oci.customer-oci.com \
  --region ap-osaka-1 \
  --dry-run
```

write mode의 stdin은 secret manager 등 보호된 파이프라인에서 다음 필드만 포함한
JSON을 공급한다. JSON 자체를 command line에 작성하지 않는다.

write mode는 위 명령의 `--dry-run`을 `--write`로 바꾼 경우에만 활성화된다.
두 flag 중 하나를 반드시 지정해야 하므로 flag 누락이 env 변경으로 이어지지 않는다.

```text
{"accessKeyId":"<customer-secret-access-key>","secretAccessKey":"<customer-secret-key>"}
```

CLI는 `STORAGE_BACKEND`, `GLOBAL_S3_BUCKET`, `GLOBAL_S3_ENDPOINT`,
`GLOBAL_S3_PROTOCOL`, `GLOBAL_S3_FORCE_PATH_STYLE`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `REGION`을 정확히 한 줄씩 갱신한다. 다른 라인과 주석은 보존하고 대상 키의 중복은 하나로
합친다. write mode는 같은 디렉터리에 원본의 mode `0600` timestamped backup을
먼저 만들고, mode `0600`인 임시 파일을 같은 디렉터리에서 원자적으로 교체한다.
파일과 디렉터리는 지원되는 플랫폼에서 fsync한다. HTTPS endpoint의 credential,
query, fragment와 빈 값·제어문자·Docker Compose dotenv에서 안전하지 않은 문자,
잘못된 stdin JSON은 거부하며 secret 값은 출력하지 않는다. OCI Access Key와
Secret Key는 ASCII `A-Z a-z 0-9 . _ ~ + / = -` 문자만 허용한다.

env 변경 후에는 compose가 실제 storage container에 새 값을 주는지 검증하고
container를 recreate한 뒤 health를 기다린다.

```bash
cd /srv/aura-board/supabase
sudo docker compose config --quiet
sudo docker compose up -d --force-recreate --wait storage
sudo docker compose ps storage
sudo docker exec supabase-storage sh -c '
  for key in STORAGE_BACKEND GLOBAL_S3_BUCKET GLOBAL_S3_ENDPOINT GLOBAL_S3_PROTOCOL GLOBAL_S3_FORCE_PATH_STYLE REGION TENANT_ID; do
    printf "%s=" "$key"
    printenv "$key"
  done
'
```

위 출력은 credential을 포함하지 않아야 하며 `TENANT_ID`는 `.env`의
`STORAGE_TENANT_ID`와 정확히 같아야 한다. `s3-direct`가 쓰는 key prefix와
Storage API가 읽는 prefix가 달라지는 것을 막기 위해 이 대조를 생략하지 않는다.

그 다음에 metadata restore가 끝났고 `STORAGE_TENANT_ID`가 확인된 상태에서
`--target-mode s3-direct` migration을 실행한다. OCI backend와 payload가
검증되기 전에는 local file backend의 payload를 삭제하지 않는다.


### pg_cron / Vault cutover

managed production에는 `notification-outbox-retry-sweep`, `student-morning-digest`, `student-morning-tasks-08-kst` pg_cron job과 notification worker URL/secret Vault 값이 남아 있다. staging에는 이 job/secret을 복제하지 않는다. Oracle은 이미 `notification-push`를 매분 실행하고 `attendance-reminder`를 매일 `23:00 UTC`에 실행하므로 self-host cutover에서는 Oracle cron을 단일 scheduler로 유지해 중복 callback을 피한다. DB에 복원된 Vault 참조 함수는 secret이 없으면 no-op이어야 한다.

## 9. Public endpoint two-stage rollout

`supabase.aura-board.com`은 Studio나 postgres-meta를 공개하지 않고 Auth, PostgREST,
Realtime, Storage, Functions, GraphQL client API prefix만 loopback gateway로 전달한다.
DNS·TLS·self-host public URL은 다음 순서로만 적용한다. 이 단계만으로 production 앱 env나
database source of truth는 전환되지 않는다.

1. Cloudflare DNS tool을 public origin IPv4와 `--proxied false`로 dry-run한다.
2. DNS-only A record를 생성한다. API token은 exact stdin JSON으로만 전달한다.
3. A1 installer dry-run 후 write를 실행해 HTTP-01 certificate와 private-NIC TLS nginx를 설치한다.
4. self-hosted `.env`의 public URL 두 값을 원자적으로 갱신하고 Auth/Storage를 recreate한다.
5. 외부 HTTPS, REST allowed/denied request, Realtime WebSocket, Storage download를 확인한다.
6. 같은 DNS tool을 `--proxied true`로 다시 실행하고 Cloudflare 경유 smoke를 반복한다.

```bash
python3 infra/oracle/supabase-selfhost/configure-cloudflare-dns.py \
  --content <ORACLE_PUBLIC_IPV4> --proxied false --dry-run

# write mode stdin shape only; value는 shell argv/history에 넣지 않는다.
# {"apiToken":"<zone-scoped DNS edit token>"}
secure-token-producer | python3 infra/oracle/supabase-selfhost/configure-cloudflare-dns.py \
  --content <ORACLE_PUBLIC_IPV4> --proxied false --write

sudo bash infra/oracle/supabase-selfhost/install-public-endpoint.sh --dry-run
sudo bash infra/oracle/supabase-selfhost/install-public-endpoint.sh --write

sudo python3 infra/oracle/supabase-selfhost/configure-public-url.py \
  --env-file /srv/aura-board/supabase/.env --dry-run
sudo python3 infra/oracle/supabase-selfhost/configure-public-url.py \
  --env-file /srv/aura-board/supabase/.env --write
cd /srv/aura-board/supabase
sudo docker compose config --quiet
sudo docker compose up -d --force-recreate --wait auth storage

secure-token-producer | python3 infra/oracle/supabase-selfhost/configure-cloudflare-dns.py \
  --content <ORACLE_PUBLIC_IPV4> --proxied true --write
```

Cloudflare token은 `aura-board.com` 단일 zone의 DNS read/edit만 허용한다. Wrangler의
기본 OAuth token은 zone read 권한만 있으므로 DNS write 증거로 간주하지 않는다.
installer는 DNS를 변경하지 않으며, Certbot 또는 최종 `nginx -t` 실패 시 직전 nginx
config/symlink로 rollback한다. `configure-public-url.py`는 기존 secret 라인을 출력하지
않고 `SUPABASE_PUBLIC_URL=https://supabase.aura-board.com`과
`API_EXTERNAL_URL=https://supabase.aura-board.com/auth/v1`만 mode-0600 backup 후
원자 교체한다.

## 9A. Oracle-to-Supabase DR replication endpoint

이 endpoint는 Oracle Osaka A1 ARM64의 `/srv/aura-board/supabase` self-hosted
PostgreSQL을 Supabase Free DR subscriber가 접근하기 위한 별도 경로다. TLS 1.3,
PostgreSQL ALPN, dedicated role/HBA, 외부 5432 및 실제 logical subscription은 A1에서
검증했다. 아래 installer는 그 interim 상태를 재현 가능한 contract로 고정한다.

현재 interim hostname은 `replication.129-225-159-251.sslip.io`다. DNS 편집 권한이
준비되면 `replication.aura-board.com` 같은 안정적인 `aura-board.com` hostname을
우선 사용하고, installer의 `--domain`으로 명시한다. managed Supabase outbound IP는
고정되지 않고 NAT64도 관찰되었으므로 `/32` allowlist를 주장하지 않는다.

사전 조건:

- 대상 host가 `aarch64`/ARM64이고 root로 실행되며, `supabase-db`가 공개 port를
  publish하지 않는지 확인한다.
- `aura_board_dr_replication` dedicated role을 안전한 operator 절차로 먼저
  provision한다. installer는 password를 만들거나 읽거나 출력하지 않고, LOGIN,
  REPLICATION, BYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE 및 bounded
  connection limit만 `supabase_admin`으로 검증한다.
- host nginx ARM64 stream module이 설치되어 있어야 한다. installer는 top-level
  stream include를 독립 module config로 설치하지만 module 자체가 없으면 exact apt
  instruction을 출력하고 자동 설치하지 않는다.
- DNS와 public HTTP/80이 A1으로 도달해야 HTTP-01이 성공한다.

dry-run이 기본이며, write는 명시적으로 실행한다.

```bash
sudo bash infra/oracle/supabase-selfhost/install-replication-endpoint.sh \
  --dry-run --domain replication.129-225-159-251.sslip.io --private-ip <PRIVATE_IP>
sudo bash infra/oracle/supabase-selfhost/install-replication-endpoint.sh \
  --write --domain replication.129-225-159-251.sslip.io --private-ip <PRIVATE_IP>
```

write는 `docker-compose.replication.yml` override로 `127.0.0.1:15433 -> db:5432`만
publish하고, 기존 `/etc/postgresql-custom` volume에 persistent HBA와 `hba_file`
override를 설치한다. HBA는 exact Docker gateway
`172.18.0.1/32`에서 `postgres` database와 physical/logical `replication` protocol에
대한 해당 role만 먼저 허용한다. dedicated role은 그 외 모든 IPv4/IPv6 source에서
먼저 reject해 broad RFC1918 grants로 fall-through하지 않게 하고, 같은 gateway의
다른 role도 reject한다. 그 뒤 private CIDR를 유지하고 나머지 public IPv4/IPv6는
reject한다. nginx stream은 private NIC의
TCP/5432에서 TLS를 종료해 loopback 15433으로 보내며, `ssl_alpn postgresql`, TLS
1.2/1.3, exact Certbot certificate/key, bounded connect/idle/handshake timeout,
socket keepalive를 적용한다. HTTP는 ACME challenge path만 200이고 나머지는 404이며
Studio와 HTTP API proxy를 이 endpoint에 추가하지 않는다.

앱 health probe는 redirect나 401을 성공으로 보지 않고 HTTP 2xx만 허용한다. host
firewall allow에는 선택한 private NIC destination을 함께 넣고, `ss` 결과의 TCP/5432
listener가 정확히 그 주소 하나인지 확인한다. 다른 주소나 wildcard listener가 있으면
write가 실패한다.

OCI NSG는 host installer가 변경하지 않는다. 승인된 operator가 artifact를 사용해
TCP/5432의 최소 inbound rule을 추가한다. source는 managed outbound NAT가
동적이므로 의도적으로 `0.0.0.0/0`이고, 보상 통제는 TLS hostname verification과
dedicated random SCRAM role이다.

```bash
oci network nsg rules add --region ap-osaka-1 --nsg-id "$OCI_NSG_ID" \
  --security-rules file://infra/oracle/nsg-replication-5432.json
# 응답의 새 security rule id를 별도 operator 기록에 보관한다.
oci network nsg rules remove --region ap-osaka-1 \
  --nsg-id "$OCI_NSG_ID" --security-rule-ids "[\"$REPLICATION_RULE_ID\"]" --force
```

첫 명령의 반환 rule id가 rollback 식별자다. NSG rule을 먼저 삭제한 뒤 host에서
다음 명시적 rollback을 실행한다. write 성공 시 installer는
`/var/lib/aura-board/replication-endpoint` 아래 root 소유 durable snapshot에
직전 파일 상태와 설치 후 digest를 보관한다. 같은 설치를 idempotently rerun하면
이미 관리 중인 상태로 이 pre-install snapshot을 덮어쓰지 않는다.
기존 managed 일반 파일은 write 전에 `root:root`와 mode `0644`를 요구하고 renewal
hook만 `0755`를 요구한다. 따라서 rollback이 알 수 없는 기존 owner/mode를 임의로
넓히지 않는다. 첫 endpoint 변경 전에는 mode `0600` pending journal을 원자적으로
게시한다.

```bash
sudo bash infra/oracle/supabase-selfhost/install-replication-endpoint.sh \
  --rollback --domain replication.129-225-159-251.sslip.io --private-ip <PRIVATE_IP>
```

rollback은 snapshot owner/path, domain/private-IP, 현재 설치 파일 digest를 검증한
뒤 host TCP/5432 rule과 `/etc/iptables/rules.v4`, nginx include/config, compose
override, custom HBA를 복원하고 복원된 compose 조합으로 db를 recreate한다. db와 앱
health는 HTTP 2xx 기준으로 다시 확인한다. 자동 복구나 명시적 rollback이 중간에
실패하면 pending/in-progress journal과 snapshot을 남기므로 원인을 해결한 뒤 같은
`--rollback` 명령으로 idempotently 재시도한다. journal은 전체 복원과 health/nginx
검증이 성공한 뒤에만 제거된다. Certbot renewal deploy hook은 `nginx -t` 성공 때만 reload한다.
installer는 dedicated role credential을 생성·읽기·출력·백업하지 않는다.

Certbot 표준 layout에서 `live/<cert-name>`은 일반 directory이고 그 안의
`fullchain.pem`/`privkey.pem` 등이 `archive/`를 가리키는 symlink다. 이 layout은
허용되는 것으로 확인했으며, installer의 일반 경로 보호(상위 directory symlink와
target symlink 거부)는 완화하지 않는다.

## 10. 중지/제거

staging 중지:

```bash
cd /srv/aura-board/supabase
sudo docker compose down
```

`down -v`, official `reset.sh`, staging directory 삭제는 PostgreSQL/Storage 데이터를 파괴할 수 있으므로 별도 승인 없이 실행하지 않는다.

## 11. production cutover 금지 사항

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
