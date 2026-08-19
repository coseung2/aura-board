# Oracle 전환 설계안 — Supabase → 자체 Postgres + SSE Realtime

> 상태: **검토용 초안 (DRAFT, 미확정)**
> 목적: aura-board가 현재 Supabase(Postgres + Storage + Realtime)에 기대는 3가지를
> 오라클 A1(이미 앱/백엔드/워커/백업을 호스팅 중)으로 이전하는 범위와 방법을 정리.
> 브라우저 Realtime은 **SSE 푸시를 메인**으로. 폴링은 어디까지나 fallback.

## 1. 현재 상태

- **오라클 담당**: Next.js 앱, Rust 플레이 엔진(`play-server`), 크론, 미디어/썸네일 워커, 일일 백업(OCI Object Storage). `infra/oracle/README.md` 참고.
- **Supabase 담당**: ① Postgres(Prisma throug `DATABASE_URL`) ② Storage(`src/lib/supabase`, `BlobDeletionQueue`, 썸네일 preview) ③ Realtime(Broadcast 채널, `src/hooks/useRealtimeInvalidation` + `src/lib/realtime-broadcast.ts`).
- **Auth는 이미 오라클/자가 운영**: NextAuth v5 + 커스텀 학생/학부모 세션. Supabase Auth **미사용** → 이전 대상 아님.

## 2. 이전 범위 (3개 계층)

### 2.1 Postgres (🟢 쉬움 — Prisma로 추상화됨)

- Prisma 스키마(`prisma/schema.prisma`)는 provider-independent. `DATABASE_URL`만 자체 Postgres로 바꾸면 됨.
- **권장**: 오라클 A1에 ARM64 Postgres 17 설치(`infra/oracle`이 이미 `pg_dump`/`pg_restore` 요구 — 백업 파이프라인 재사용).
- 데이터 이관: Supabase `pg_dump` → 오라클 `pg_restore` (기존 `backup-supabase.sh` 재사용 가능).
- **할 일**: `prisma migrate deploy`, 시드, 기존 백업 주기를 오라클 → 오라클 자체로 전환.
- 리스크: 낮음. 단, 관리(백업/업데이트) 부담이 사용자로 이동.

### 2.2 Storage (🟡 보통 — Supabase 클라이언트 의존)

- 현재: `@supabase/supabase-js`의 `storage.from(...)` 사용 + `BlobDeletionQueue`로 지연 삭제 + WebP preview.
- **권장**: OCI Object Storage(S3 호환)로 교체. `oci` CLI + instance-principal 인증(이미 `infra/oracle`에서 백업에 사용) 재사용.
- 코드 영향: `src/lib/supabase/*`의 storage 래퍼를 S3/OCI SDK 래퍼로 대체. Attachment URL 생성 로직(`thumbUrl/previewUrl/thumbnailUrl`)은 그대로 두고 **업로드/삭제 계층만** 교체.
- **할 일**: storage 래퍼 인터페이스 분리, 업로드 → OCI presign/공개 URL, 삭제 → BlobDeletionQueue가 OCI로.

### 2.3 Realtime (🔴 핵심 — SSE 푸시 메인으로 전환)

현재 설계가 이미 **transport-swappable**:
- 구독: `useRealtimeInvalidation` (단일 훅, `channelName`+`event`+`refresh`)
- 발행: `realtime-broadcast.ts`의 `sendRealtimeBroadcast` + `announce*` 시리즈
- 키 스킴: `lib/realtime.ts`의 `*ChannelKey` + `RealtimeEvent` 타입
- 폴백: `useRealtimeInvalidation`의 `fallbackPollMs` (30s) — **유지**, fallback으로만.

**SSE 전환 설계 (이 PR의 스켈레톤 대상)**

```
[지금]  DB 변경 → (Rust/Next) → Supabase Broadcast → 클라 channel().on()
[전환]  DB 변경 → pg_notify('aura_realtime', json) → 오라클 SSE 서버 → 클라 EventSource
```

- **pg_notify(pub/sub)**: Postgres 내장. 트랜잭션 내 함수/트리거(또는 Rust play-server에서 명시 호출)로 발행.
- **SSE 서버**: Next.js Route Handler(`/api/realtime/stream?channel=...`)가 `ReadableStream`으로 `text/event-stream`을 유지. **클라 → 서버 방향 통신 불필요**(인증은 HTTP 쿠키/NextAuth 세션 그대로).
- **클라**: `useRealtimeInvalidation` 내부의 Supabase 구독 블록을 `EventSource` 구독으로 교체. `subscribed`/`stopFallbackPolling` 로직 동일하게 재사용 → **90여 개 훅은 그대로**.
- **키 스킴 유지**: `board:{id}`, `classroom:{id}:morning` 등 채널 키는 그대로 SSE 채널 구분자로 사용. `event` 오브젝트를 SSE `event:` 이름으로 매핑.

**발행 경로 통합**: 기존 `announce*` 시리즈의 입출력(`(channelKey, event, payload)`)을 그대로 두고 내부 `sendRealtimeBroadcast`만 `pg_notify` 호출로 대체하면 **발행 코드 전부 수정 불필요**. 이게 핵심 장점.

## 3. SSE 스켈레톤 (이 PR에 포함)

- `src/lib/realtime/sse-client.ts` — `EventSource` 구독 헬퍼 (Skeleton).
- `src/lib/realtime/sse-publish.ts` — `pg_notify` 발행 헬퍼 (Skeleton, 서버 전용).
- `prisma/` 또는 `infra/oracle/` — `aura_realtime` notification용 SQL 스키마 초안 (아래).
- `useRealtimeInvalidation` **실제 교체는 후속 PR** (이 PR은 스켈레톤 + 설계만, 기존 Supabase 경로 보존).

### 3.1 pg_notify 트리거 예시 (권장 초안)

Postgres는 트랜잭션 커밋 시에만 알림을 동기적으로 전송할 수 있다. 금지된 "커밋 후 알림"은
eschew(회피)하며, 다음과 같은 트리거에서 `NOTIFY`를 방출한다. 이벤트 전달은
`aura_realtime` 채널로 JSON 문자열을 보내고, 별도 SSE 서버가 이를 구독해 브로드캐스트한다.

```sql
-- 게시 준비: 채널 명은 lib/realtime.ts의 *ChannelKey 규약과 일치해야 한다.
CREATE OR REPLACE FUNCTION aura_notify_board_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'aura_realtime',
    json_build_object(
      'channel', 'board:' || NEW."boardId",
      'event', 'card_changed',
      'payload', json_build_object('changeType', TG_OP)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aura_card_changed_notify
AFTER INSERT OR UPDATE OR DELETE ON "Card"
FOR EACH ROW EXECUTE FUNCTION aura_notify_board_change();
```

주의:
- `json_build_object`로 **payload는 익명/검증된 요약(예: `changeType`)만** 담는다. 민감 컨텍스트(Cookie/원문)는 절대 포함하지 않는다.
- `NOTIFY`는 동기 전송이므로 카드 수정 경로에서 이벤트 스톰이 생기지 않도록 후속 단계에서 감사를 넣는다.
- 게임(Kordle/Speed/Omok)처럼 플레이 엔진(`play-server`)이 기록하는 변경은 트리거 대신 **명시적 호출** 권장 (Q1 참고).

## 4. 가격·운영 관점

| 항목 | Supabase Free/Pro | 전환 후 (오라클) |
|---|---|---|
| DB | 500MB~8GB(Pro $25) | 자체 PG, A1 2/12GB 내 추가 비용 없음 |
| Realtime | Free는 불안정/Pro 필요 | pg_notify+SSE, 추가 비용 없음 |
| Storage | 1GB(Free) | OCI Object Storage |
| 관리 부담 | Supabase가 담당 | **사용자가 담당** (백업/업데이트/모니터링) |
| 주의 | Realtime이 자꾸 떨어지는 문제 | 오라클은 독립·안정, 단 자체 운영 필요 |

**핵심 트레이드오프**: 비용/독립성 ↑, 관리 부담 ↑. "Supabase Pro $25/월을 Realtime 안정성 하나 때문에 내는" 현재 상태 대비, 오라클 전환은 유지비를 낮추고 종속을 없애는 대신 DB·Realtime 운영을 직접 책임지게 됨.

## 5. 마이그레이션 단계 (확정 시)

1. DB: 오라클에 PG17 설치 → `pg_dump`/`pg_restore` → `DATABASE_URL` 전환 → verify.
2. Storage: OCI 버킷 생성 → `oci` 업로드 래퍼 → BlobDeletionQueue 전환 → verify.
3. Realtime: `pg_notify` 트리거 + SSE Route Handler + `useRealtimeInvalidation` 전송 교체 → 폴링 fallback 유지 → verify.
4. Supabase 서비스 키 제거 → 완전 종료 판단.

## 6. 남은 질문 (확정 전 결정 필요)

- Q1. Realtime 이벤트 발행 주체: **pg 트리거** vs **Rust play-server 명시 호출** — 둘 중? (컨텐츠 보드=트리거가 natural, 게임=명시 호출이 natural. 하이브리드 권장)
- Q2. Storage URL 접근: OCI 공개 버킷 vs presigned URL — 보안 요구 수준?
- Q3. 게임(Kordle/Omok/Speed) SSE 지연 허용치 — SSE 단방향으로 충분한지, 폴링/개별 폴링 병행 필요한지.
