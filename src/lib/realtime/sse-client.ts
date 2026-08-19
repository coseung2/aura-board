/**
 * SSE Realtime 클라이언트 스켈레톤 (이전 설계안의 일부)
 *
 * 현재는 `useRealtimeInvalidation`이 Supabase Broadcast를 구독한다.
 * 오라클 이전 시 이 파일의 구독을 `EventSource`로 바꿔 같은 시그니처를 제공한다.
 * 기존 `useRealtimeInvalidation`의 `subscribed`/`stopFallbackPolling` 로직을
 * 그대로 재사용할 수 있도록 구독 상태 콜백을 노출한다.
 *
 * NOTE: 이 파일은 스켈레톤이며, 아직 `useRealtimeInvalidation`에 연결되지 않았다.
 * 연결은 후속 PR에서 `supabase.channel().on().subscribe()` 블록을
 * `createSseRealtimeSubscription()` 호출로 교체하여 수행한다.
 */

export type RealtimeSubscriptionStatus =
  | "CONNECTING"
  | "OPEN"
  | "CLOSED"
  | "ERROR";

export type RealtimeMessage = {
  channel: string;
  event: string;
  payload: unknown;
};

export type SseRealtimeSubscription = {
  /** EventSource를 닫고 자원을 정리한다. */
  close: () => void;
};

export type SseRealtimeOptions = {
  /** 예: `board:abc` — lib/realtime.ts의 *ChannelKey 함수 출력 재사용 */
  channelName: string;
  /** 예: `card_changed` — lib/realtime.ts의 이벤트 이름 재사용 */
  events: string[];
  /** 이벤트 수신 시 호출된다. */
  onMessage: (message: RealtimeMessage) => void;
  /** 구독 상태 변화 시 호출된다. OPEN이 되면 폴링을 멈춘다. */
  onStatusChange?: (status: RealtimeSubscriptionStatus) => void;
  /**
   * SSE endpoint 경로. 기본값은 설계안의
   * `/api/realtime/stream?channel=<encoded>`. 커스텀 필요 시 주입.
   */
  streamPath?: string;
};

function sseUrl(channelName: string, streamPath: string): string {
  return `${streamPath}?channel=${encodeURIComponent(channelName)}`;
}

/**
 * 서버 -> 클라이언트 단방향 실시간 이벤트를 EventSource로 구독한다.
 * 브라우저 EventSource는 자동 재연결을 내장하며,
 * `next.js` Route Handler가 내보내는 `text/event-stream`에 대응한다.
 *
 * 스켈레톤: 채널 구독/해제 수명주기만. 실제 SSE 스트림(서버 발행)은
 * `sse-publish.ts`와 새 `/api/realtime/stream` Route Handler에서 처리한다.
 */
export function createSseRealtimeSubscription({
  channelName,
  events,
  onMessage,
  onStatusChange,
  streamPath = "/api/realtime/stream",
}: SseRealtimeOptions): SseRealtimeSubscription {
  // 이벤트 필터링은 SSE stream에서 이미 channel 단위로 이뤄진다.
  // 여기서는 event name 필터를 추가로 보관(서버가 channel+event 모두 보낼 때).
  const allowed = new Set(events);

  const source = new EventSource(sseUrl(channelName, streamPath));

  source.onopen = () => onStatusChange?.("OPEN");
  source.onerror = () => {
    // EventSource는 네트워크 문제 시 자동으로 재연결을 시도한다.
    // 이 상태를 CONNECTING/ERROR로 구분해 fallback 폴링을 제어할 수 있게 한다.
    onStatusChange?.(
      source.readyState === EventSource.CONNECTING
        ? "CONNECTING"
        : "ERROR",
    );
  };

  // SSE는 단일 엔드포인트가 여러 이벤트 유형을 보낼 수 있으므로,
  // 클라이언트에서 관심 있는 이벤트만 골라내도록 named event 리스너를 단다.
  for (const eventName of events) {
    source.addEventListener(eventName, (raw) => {
      const messageEvent = raw as MessageEvent;
      let payload: unknown = messageEvent.data;
      try {
        payload = JSON.parse(String(messageEvent.data));
      } catch {
        // not JSON — keep raw string
      }
      onMessage({
        channel: channelName,
        event: eventName,
        payload,
      });
    });
  }

  return {
    close: () => {
      source.close();
      onStatusChange?.("CLOSED");
    },
  };
}

/**
 * SSE 구독 도우미 — `useRealtimeInvalidation`에서 폴백 폴링과 결합해 쓰는 래퍼.
 *
 * 실제 초기화가 끝나지 않았어도 `open`/`error` 중 어느 상태가 먼저 오는지에
 * 따라 호출자가 폴링을 시작/중지할 수 있게 한다. 구독 전에도 스냅샷을
 * 1회 수행하는 `useRealtimeInvalidation`의 기존 동작(마운트 시 requestRefresh)
 * 은 그대로 유지되어야 한다.
 */
export function subscribeSseRealtime(
  options: SseRealtimeOptions,
): SseRealtimeSubscription {
  return createSseRealtimeSubscription(options);
}
