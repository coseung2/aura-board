/**
 * SSE Realtime 서버측 발행 스켈레톤 (이전 설계안의 일부)
 *
 * 현재 `realtime-broadcast.ts`의 `sendRealtimeBroadcast`가 Supabase Realtime에
 * HTTP로 이벤트를 보낸다. 오라클 이전 시 `pg_notify`(Postgres 내장 pub/sub)로
 * 발행을 대체해 같은 시그니처를 제공한다.
 *
 * 이 스켈레톤은 다음을 보여준다:
 *   - `aura_realtime` notification payload 스키마 (JS 쪽)
 *   - 발행을 `pg_notify`로 보내는 함수
 *
 * NOTE: 이 파일은 스켈레톤이다. 실제 연결은 후속 PR에서
 * `sendRealtimeBroadcast` 내부를 이 모듈 호출로 교체해 수행한다.
 * 서버 전용이므로 `import "server-only"`를 사용한다.
 */

import "server-only";

/**
 * aura_realtime notification payload.
 * Postgres 트리거 또는 play-server가 `pg_notify('aura_realtime', json)` 에 담는다.
 * 형상은 `prisma` 마이그레이션(add)에 정의될 SQL 트리거와 일치해야 한다.
 */
export type PgNotifyPayload = {
  /** 채널 키 (lib/realtime.ts의 *ChannelKey) — 예: `board:abc` */
  channel: string;
  /** 이벤트 이름 — 예: `card_changed` */
  event: string;
  /** 선택적 부하 페이로드 (인증/권한 정보는 절대 담지 않는다) */
  payload?: unknown;
};

/**
 * pg_notify로 발행한다.
 *
 * NOTE: `sql`은 스켈레톤용 예시다. 다음 연결 단계에서:
 *   - Next.js(또는 play-server)가 사용하는 Postgres 커넥션 풀에서 실행.
 *   - 대량 안 함: 이벤트당 한 번의 `SELECT pg_notify(...)`.
 */
function notifyCommand(payload: PgNotifyPayload): string {
  const data = JSON.stringify(payload);
  // SQL 인젝션 방지: pg_notify의 첫 인자는 Literal이므로 파라미터로 처리해야 한다.
  // 아래는 의사코드 — 실제 구현은 준비된 statement($1)로 바인딩한다.
  return `SELECT pg_notify('aura_realtime', $1::text)`;
}

/**
 * 알림 payload를 Postgres에 넣기 전 검증/정규화한다.
 * 채널·이벤트 이름을 제한해 잘못된 값이 알림 채널로 흘러가지 않게 한다.
 */
export function normalizePgNotifyPayload(input: unknown): PgNotifyPayload | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const channel = typeof record.channel === "string" ? record.channel.trim() : "";
  const event = typeof record.event === "string" ? record.event.trim() : "";
  // lib/realtime.ts의 *ChannelKey는 세그먼트가 콜론으로 구분된다. 길이와 문자 제한.
  const safeChannel = /^[a-z0-9][a-z0-9_-]*(\:[a-z0-9][a-z0-9_-]*){0,8}$/i;
  const safeEvent = /^[a-z0-9][a-z0-9_\-]{0,127}$/i;
  if (!safeChannel.test(channel) || !safeEvent.test(event)) return null;
  return { channel, event, payload: record.payload };
}

/**
 * 서버측에서 이벤트를 pg_notify로 전달한다.
 * `exec` 은 실제 DB 커넥션 실행 함수(예: pg Pool.query)를 주입한다.
 *
 * 이 함수는 `sendRealtimeBroadcast`와 동일한 호출 계약을 제공한다:
 *   await publishPgNotify({ channel, event, payload });
 */
export async function publishPgNotify(
  payload: PgNotifyPayload,
  exec: (sql: string, params: unknown[]) => Promise<unknown> = defaultExec,
): Promise<void> {
  const normalized = normalizePgNotifyPayload(payload);
  if (!normalized) throw new Error("invalid_pg_notify_payload");
  await exec(notifyCommand(normalized), [JSON.stringify(normalized)]);
}

/**
 * 기본 exec — 아직 DB 커넥션을 붙이지 않았으므로 항상 실패하게 둔다.
 * 후속 PR에서 pg Pool(pg 또는 postgres.js)을 주입한다.
 */
async function defaultExec(): Promise<never> {
  throw new Error(
    "pg_notify exec not wired yet — supply a pg.Pool.query to publishPgNotify",
  );
}
