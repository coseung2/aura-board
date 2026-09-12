# 오목 실시간화·상용화 구현 계획

## 목적과 현재 기준선

오목의 권위 상태와 판정은 계속 Rust 플레이 엔진과 Postgres가 소유한다.
이번 작업은 그 엔진을 실제 대국의 주 실시간 경로로 연결하고, 모바일에서
착수 직후 반응하는 게임 UX와 복구 가능한 네트워크 동작을 완성하는 작업이다.

2026-09-12 KST 개선 전 실기기 기준선:

- S23 `R3CW50BW8KB`(1080×2340, 학생 `test`, 흑)와 A20
  `R59M904MEMY`(720×1560, 학생 `공서희`, 백)가 같은 대국에서
  흑 → 백 → 흑 → 백을 진행했다.
- board `cmtx9ttb50011vs30ai2j2pso`, session
  `fabf8167-1399-4f2f-99e4-4d2bf56c9d66`에서 두 기기 모두 최종
  version 4와 같은 네 돌을 표시했다.
- 명령 POST는 약 1.8초, 2.2초, 최대 2.9초였다. 상대 기기는 outbox 전달이
  늦으면 3초 polling까지 기다릴 수 있었다.
- 현재 모바일은 SecureStore 쓰기를 기다린 뒤 HTTP 명령을 보내고, 응답을
  받은 뒤에만 돌을 그린다. 따라서 규칙 정확성은 지키지만 착수 감각이 느리다.

2026-09-12 KST 구현·검증 상태:

- Kiro Opus와 Sol이 Rust/모바일 경계를 나눠 구현한 뒤 서로의 변경을 교차
  리뷰했다. 마지막 통합에서는 Origin fail-closed, actor별 단일 활성 소켓,
  stale async ticket 차단, bounded reconnect, durable pending replay가 같은
  연결·복구 계약을 지키는지 다시 확인했다.
- S23 `R3CW50BW8KB`와 A20 `R59M904MEMY`가 위 board/session의 같은 판에서
  실제 Rust WebSocket 두 개를 유지한 채 흑 → 백 → 흑 → 백을 왕복했다.
  마지막 백 착수 뒤 S23은 `내 차례`, A20은 `상대 차례`와 동일한 새 백돌을
  표시했다.
- healthy socket 동안 Next 로그에 3초 `/session` polling이나 `/commands`
  POST가 없었다. 착수는 HTTP fallback이 아니라 Rust WebSocket으로 처리됐다.
- S23을 background로 보냈을 때 해당 소켓이 종료됐고, foreground 복귀 뒤
  새 ticket과 소켓으로 최신 판에 수렴했다. 최종적으로 actor별 활성 연결은
  다시 두 개였다.
- 선택 직후와 확인 직후의 aim/pending 반응은 실기기에서 확인했다. 다만
  Android 화면 녹화의 정적 프레임 생략과 ADB 입력 반환시간 편차 때문에
  touch → pending, commit/ack, peer render의 정밀 p50/p95 수치는 이번 패스에서
  신뢰성 있게 산출하지 않았다. 기존 3초 polling 지연이 정상 경로에서 제거된
  것은 로그와 두 기기 상태로 확인했다.
- 실기기 증거는
  `C:\Users\coseung2\AppData\Local\Temp\aura-board-omok-device-current`의
  `s23-after-final-white.png`, `a20-after-final-white.png`,
  `a20-final-white-selected.png`에 보존했다. 최종 session version 숫자는 별도
  인증 조회로 확인하지 않았으므로 화면 수렴만 검증된 사실로 기록한다.

## 완료 기준

- 터치 후 로컬 pending 돌 표시 p95 100ms 이하.
- Rust가 명령을 승인하고 요청자에게 확정 snapshot을 보내는 시간 p95 500ms
  이하, 정상 네트워크에서 최대 1초.
- 상대 기기에 확정 snapshot이 보이는 시간 p95 1초 이하.
- 어떤 클라이언트도 DB commit 전에 확정 상태를 받지 않는다.
- 연결 중단, 앱 background, 응답 유실, 중복 전송, version 충돌 후에도 두
  기기는 같은 권위 version과 판으로 수렴한다.
- 종료·기권·재대국과 종료 후 착수 거부가 두 실기기에서 일치한다.

시간은 `touchAt`, `queuedAt`, `engineReceivedAt`, `committedAt`,
`requesterRenderedAt`, `peerRenderedAt`으로 나누어 측정한다. 평균만으로
완료를 판단하지 않고 p50/p95와 실패율을 기록한다.

## 목표 구조

```text
Expo
  -> 기존 Next 학생 인증
  -> POST /api/play/sessions/:sessionId/realtime-ticket
  <- { transport: "websocket", 짧은 session-bound ticket, wss URL }
     또는 { transport: "http", reason: "bot_session" }
  -> Rust WebSocket 연결
  -> 첫 프레임으로 ticket 인증
  -> requestId + expectedVersion + command 전송
  -> Rust actor/slot 확인 및 기존 repository 명령 실행
  -> Postgres state + receipt + outbox 원자적 commit
  -> commit 성공 뒤 session hub 알림
  <- 요청자와 상대에게 각 actor 기준 권위 snapshot 전파

복구 경로
  Expo -> 기존 Next HTTP snapshot/command
  Rust outbox -> Next cron -> Supabase invalidation -> snapshot 재조회
```

WebSocket은 활성 대국의 주 경로다. 기존 HTTP snapshot, durable receipt,
outbox, Supabase invalidation은 최초 진입, 재접속, background 복귀, 서버
재시작, WebSocket 장애 시 복구 경로로 유지한다. 정상 구독 중 3초 polling은
중단하고, 연결 실패나 복구 중에만 bounded fallback으로 사용한다.

컴퓨터 대국은 현재 Next HTTP command가 사람의 착수 뒤 bot 후속 착수를
호출한다. 그 orchestration을 Rust로 옮기기 전에는 realtime ticket을 발급하지
않고 인증된 200 응답
`{"transport":"http","reason":"bot_session","pollIntervalMs":3000}`을
반환한다. 사람 대 사람 대국만 WebSocket v1 대상이다. 인증 실패, 접근 거부,
세션 없음은 각각 기존 401/403/404를 유지하며 transport 선택으로 숨기지 않는다.

## 접속 티켓과 신뢰 경계

Next는 기존 세션 인증과 제품 접근 정책으로 actor를 해석하고, 대상
`sessionId`의 참가자 또는 host인지 확인한 뒤 티켓을 발급한다.

- 기본 유효기간은 30초이며 새 연결에만 사용한다. 소켓에도 최대 연결 수명을
  두고, 만료되면 새 티켓으로 재연결해 계정·session 권한 변경이 무기한
  지연되지 않게 한다.
- 티켓은 `protocolVersion`, `sessionId`, `role`, `actorKey`,
  `expiresAtMs`, `nonce`를 서명한다.
- `actorKey`는 공유 비밀과 도메인 분리 문자열, session, role, 실제 actor
  subject, 만료, nonce로 만든 HMAC 파생값이다. 티켓 payload에 학생 ID나
  원본 actor subject를 넣지 않는다.
- Rust는 session의 저장된 host/participant 후보로 actorKey를 재계산해 한
  actor와 일치시킨다. session/role 불일치, 만료, 변조 티켓은 연결을 닫는다.
- 티켓은 URL query, 로그, 오류 body, analytics에 넣지 않는다. 클라이언트는
  소켓 연결 후 5초 안에 첫 JSON 인증 프레임으로 보낸다.
- 운영은 `wss://`만 허용하고 허용된 Origin 및 최대 frame 크기를 제한한다.
  개발의 명시적 loopback 연결만 `ws://`를 허용한다. 설치된 React Native
  Android WebSocket 모듈은 호출자가 Origin을 생략하면 URL에서 Origin을 만들어
  전송하므로, 모바일은 모든 연결에 고정 sentinel Origin
  `https://mobile.aura-board.invalid`를 명시한다. Rust는 이 값을 환경 allowlist에
  정확히 설정한 경우에만 허용하며 코드에서 자동 추가하거나 wildcard로 완화하지
  않는다. Origin이 없는 비브라우저 연결은 첫 프레임 ticket 인증을 통과해야만
  사용할 수 있다. Origin은 identity가 아닌 defense-in-depth이며 browser와
  native handshake를 두 실기기로 검증한다.

별도 티켓 테이블을 추가하지 않는 stateless v1을 우선한다. 이 선택은 30초
안에 탈취된 티켓으로 병렬 소켓을 열 수 있는 잔여 위험을 가진다. 재사용을
반드시 차단해야 한다는 운영 요구가 생기면 nonce 저장소와 1회성 소비를 v2
보안 결정으로 추가한다.

## WebSocket wire protocol v1

Realtime is opt-in. `PLAY_ENGINE_REALTIME_ENABLED` defaults to disabled and
must be exactly `true` after trimming (case-insensitive) in both Next and Rust.
`PLAY_ENGINE_REALTIME_TICKET_SECRET` is a separate secret of at least 32 bytes,
`PLAY_ENGINE_PUBLIC_WS_URL` is the fixed public `wss://` endpoint returned by
Next, and `PLAY_ENGINE_REALTIME_ALLOWED_ORIGINS` is the Rust comma-separated
Origin allowlist. It must explicitly include
`https://mobile.aura-board.invalid` for the native client and every approved
browser Origin. An empty allowlist disables realtime fail-closed; a present
Origin must match exactly, while an absent Origin is accepted only subject to
first-frame ticket authentication. Missing or invalid realtime configuration
disables only `/v1/realtime` and ticket issuance with 503; existing HTTP play
routes remain available. TLS terminates at the deployment ingress, not in the
Rust process.

`lastSeenVersion` is only a bounded hint and validation field for the full
actor-projected `ready.snapshot`; protocol v1 does not provide incremental
replay.

모든 메시지는 최대 크기가 제한된 JSON object이고 `protocolVersion: 1`을
가진다. 알 수 없는 version/type, 과대 frame, 인증 전 command는 거부한다.

클라이언트 프레임:

```json
{"type":"authenticate","protocolVersion":1,"ticket":"...","lastSeenVersion":4}
{"type":"command","protocolVersion":1,"requestId":"place_stone...","expectedVersion":4,"commandSchemaVersion":1,"command":{"type":"place_stone","position":{"row":7,"column":7}}}
```

서버 프레임:

```json
{"type":"ready","protocolVersion":1,"sessionId":"...","snapshot":{}}
{"type":"command_committed","protocolVersion":1,"sessionId":"...","requestId":"place_stone...","commandType":"place_stone","previousVersion":4,"version":5,"replayed":false,"snapshot":{}}
{"type":"snapshot","protocolVersion":1,"sessionId":"...","reason":"session_changed","snapshot":{}}
{"type":"command_rejected","protocolVersion":1,"sessionId":"...","requestId":"place_stone...","commandType":"place_stone","error":"version_conflict","retryable":false,"currentVersion":5,"snapshot":{}}
{"type":"connection_error","protocolVersion":1,"error":"ticket_expired","retryable":true}
{"type":"session_replaced","protocolVersion":1,"reason":"rematch","previousSessionId":"...","sessionId":"...","snapshot":{}}
```

- `ready.snapshot`은 인증 actor에게 투영한 현재 snapshot이며 재접속 catch-up도
  담당한다.
- 요청자 성공은 항상 `command_committed`로 receipt 상관관계와
  `previousVersion`, `version`, replay 여부를 보존한다. peer와 catch-up은
  `requestId` 없는 `snapshot`을 받는다. 같은 version도 actor별로 다시 투영해
  viewer/slot 정보가 섞이지 않게 한다.
- durable pending은 `sessionId`, `requestId`, `commandType`이 모두 일치하는
  `command_committed`만 성공으로 해소한다. generic `ready`/`snapshot`은 판을
  수렴시켜도 receipt commit의 증거가 아니며 pending을 지우지 않는다.
- `command_rejected`는 현재 actor에게 투영한 권위 snapshot을 확보한 경우에만
  이를 포함한다. 상관관계가 맞는 비재시도 rejection은 pending을 rollback하고,
  일시적인 transport/server 오류는 같은 requestId 재전송을 위해 유지한다.
- command의 기존 `requestId`, `expectedVersion`, command schema,
  receipt/idempotency 의미는 HTTP와 완전히 같다. 전송 수단 변경으로 새 명령
  의미를 만들지 않는다.
- WebSocket ack가 유실되면 동일 requestId를 HTTP 또는 새 소켓으로 재전송할
  수 있다. receipt replay는 version 검사보다 먼저 일어난다.
- snapshot은 session별 단조 증가 version만 판에 적용한다. 완전한 snapshot의
  높은 version은 중간 version을 건너뛰어도 그대로 수렴시킨다. 낮은 version의
  `command_committed` replay는 판을 되돌리지 않지만 같은 requestId의 durable
  결과를 증명할 수 있다. decode/session/schema 실패는 HTTP snapshot으로
  복구하고, 일반 snapshot만으로 pending receipt가 commit됐다고 단정하지 않는다.
- 다른 session snapshot은 `session_replaced` 또는 명시적인 current-session/
  matchmaking 결과에서만 받아들인다. rematch 뒤 version은 새 session 안에서
  다시 비교하며 0부터 시작할 수 있다.

## commit 이후 전파와 backpressure

repository가 성공 `Execution`을 반환하는 시점은 Postgres commit 이후여야
한다. HTTP/WebSocket handler는 그 성공 반환 뒤에만 session hub에 version을
publish한다. transaction 안이나 commit 시도 전에 확정 snapshot을 publish하지
않는다. receipt replay는 요청자에게 `replayed: true`로 응답하지만 이미 알려진
version을 hub에 다시 publish하지 않는다.

session hub는 무제한 snapshot queue 대신 session별 최신 version을 보존하는
bounded/watch 채널을 사용한다. 각 구독자는 알림을 받으면 최신 record를 읽고
자신의 actor로 snapshot을 투영한다. 느린 구독자는 중간 version을 건너뛸 수
있지만 최신 version으로 수렴하며 메모리를 무한히 늘리지 않는다. 연결별
send timeout, 최대 pending frame, ping/pong 및 idle timeout을 둔다.

Rust 프로세스 재시작이나 다중 인스턴스에서는 인메모리 hub 이벤트가 유실될
수 있다. 이때 최초 `ready` snapshot, reconnect, HTTP snapshot, 기존 outbox
invalidaton이 권위 복구를 보장한다. 다중 인스턴스에서 p95 1초를 보장해야
하는 배포 단계에서는 Postgres NOTIFY나 전용 broker를 별도 결정한다. outbox
polling만을 활성 대국의 정상 주 경로로 되돌리지는 않는다.

## 모바일 착수 상태 모델

좌표 선택, 착수 확인, 네트워크 확정을 분리한다.

1. 판은 하나의 연속 touch surface로 동작한다. 빈 교차점을 터치하면 가장 가까운
   합법 좌표를 선택해 aim 표식과 좌표를 보여주되 아직 명령을 보내지 않는다.
2. 별도의 44dp 이상 확인 control을 누르는 같은 JS frame에서 synchronous lock을
   먼저 획득하고 requestId 하나와 `pendingMove`를 만든 뒤 반투명 돌을 그린다.
   같은 frame의 두 번째 확인과 추가 판 터치는 거부한다.
3. `sessionId + commandType` 범위의 pending envelope를 SecureStore에 저장하고
   WebSocket 전송을 시작한다. UI는 SecureStore 완료를 기다리지 않는다. 기존
   board 단위 key는 한 번만 안전하게 migration하고 rematch 사이에 재사용하지
   않는다.
4. 같은 `sessionId`, requestId, commandType의 `command_committed`가 오면 pending을
   확정 돌로 전환하고 durable pending을 지운다. replayed commit은 중복 햅틱과
   착수 animation을 발생시키지 않는다.
5. 상관관계가 맞는 `version_conflict` 또는 terminal domain rejection은 pending을
   제거하고 권위 snapshot으로 rollback한 뒤 짧고 구체적인 오류를 표시한다.
   generic snapshot은 version 기준으로 판에 merge하지만 pending receipt를
   해소하지 않는다.
6. ack timeout은 즉시 실패로 단정하지 않는다. 입력을 잠그고 `확인 중`으로
   바꾼 뒤 HTTP snapshot 또는 같은 requestId 재전송으로 결과를 확인한다.
7. background/종료 후에는 SecureStore의 같은 requestId를 한 번 재시도한다.
   이미 commit됐으면 receipt replay, 아니면 conflict snapshot으로 정리한다.

pending 돌, 마지막 확정 수, 일반 돌은 색 외에도 테두리/투명도/표식으로
구별한다. optimistic 상태를 실제 승패나 저장 성공의 증거로 사용하지 않는다.

## 상용 UI/UX 계약

- 판을 화면의 주 작업으로 만들고 작은 휴대폰에서도 가능한 최대 너비를 준다.
  상태/참가자 정보는 한두 줄 HUD로 압축한다.
- `AUTHORITATIVE OMOK`, `vN`, 정상 상태의 `동기화됨` 같은 내부 구현 문구는
  사용자 화면에서 제거한다. 연결 복구 중, offline, 확인 실패처럼 조치가
  필요한 경우에만 연결 상태를 노출한다.
- 상단에는 흑/백 돌, 이름, `나`, 현재 차례를 한눈에 구분한다. `내 차례`를
  판 가까이에 가장 강하게 표시하고 상대 차례는 차분하게 표현한다.
- 마지막 확정 수, 선택한 aim, pending 수를 색 외의 표식으로 분명히 구분한다.
  15×15 교차점 각각에 겹치지 않는 44dp hit area를 강제하지 않는다. 판 전체에서
  가장 가까운 합법 좌표를 선택하고 좌표 읽기·취소와 44dp 이상 확인 control을
  제공한다. 접근성 action도 선택 좌표 확인과 취소를 노출한다.
- 활성 대국 중에는 하단 전역 탭을 숨기거나 대국 전용 full-screen route를
  사용해 오동작과 공간 낭비를 막는다. Android Back/화면 이탈은 진행 중
  대국 확인을 거친다.
- 기권은 확인 dialog를 거친다. 종료 화면에는 승자/종료 이유와 나가기,
  권한이 있는 경우 재대국을 제공한다. actor-projected
  `viewer.capabilities.canRematch`는 현재 terminal session의 host에게만 true다.
  종료 이후 판 입력은 항상 막는다.
- 로딩, 매칭, 내 차례, 상대 차례, pending, 재연결, offline, conflict rollback,
  기권 확인, 승/패/무승부, 재대국 대기를 각각 검증한다.
- 색만으로 상태를 전달하지 않고 dynamic type, screen reader label, reduced
  motion을 지원한다.

## 규칙 결정 게이트

이번 구현은 현재 `rulesVersion: 1`과 15×15 판, 교대 착수, 5목, 무승부,
기권 동작을 그대로 보존한다. 다음 항목은 코드 구현 전에 제품 결정과 규칙
version 상승이 필요하다.

- 자유룰인지 렌주룰인지, 정확히 5목과 장목의 승리 처리
- 흑의 3-3, 4-4, 장목 금수 및 금수 위치 안내 여부
- 착수 제한시간, 연결 끊김 유예, 시간패
- 선후공 결정, 관전, 대국 기록/복기, 신고·차단, 랭킹
- 양쪽 동의형 재대국을 별도로 도입할지 여부. v1은 기존 계약대로 host만
  `canRematch`를 가지며 기존 HTTP rematch endpoint를 사용한다.

이 결정 없이 현재 판정을 관행에 맞춰 임의 변경하지 않는다.

## 단계별 구현

아래 0~2단계의 코드는 Kiro Opus·Sol 구현과 상호 리뷰, 통합 자동 검증 및
S23/A20 실기기 왕복 착수까지 완료됐다. 3단계의 추가 상용 화면 정리와
4단계 전체 장애 주입·점진 rollout은 계속 남아 있다.

### 0. 계약과 계측

- wire 타입, ticket signer/verifier, connection/command latency metric을 먼저
  추가한다.
- 기존 HTTP/receipt/outbox 테스트를 회귀 기준으로 고정한다.
- 기능 flag로 WebSocket command와 optimistic move를 독립 전환할 수 있게 한다.

### 1. Rust/Next 실시간 경로

- Axum WebSocket upgrade, ticket 인증, session hub, command frame 처리를
  구현한다.
- Next ticket route가 현재 actor와 session membership을 확인하고 ticket과
  allowlisted URL만 반환한다. bot session은 ticket 없이 명시적인 HTTP
  transport 응답을 반환한다.
- commit 후에만 publish하고, replay/conflict/error를 기존 HTTP와 같은 shape로
  보낸다.

### 2. 모바일 transport와 pending 착수

- 연결 lifecycle, reconnect backoff, foreground catch-up, monotonic merge,
  HTTP fallback을 transport 모듈로 분리한다.
- UI는 터치 즉시 pending 돌을 표시하고 confirm/rollback/timeout을 처리한다.
- UI는 좌표 선택 뒤 확인 control을 누르는 즉시 pending 돌을 표시하고
  confirm/rollback/timeout을 처리한다.
- 정상 WebSocket 연결 중 3초 active polling을 끈다.

### 3. 상용 화면 정리

- 판 중심 HUD, 참가자/차례, 마지막 수, pending, 기권·종료·재대국을 다듬는다.
- active 대국의 전역 하단 탭과 이탈 동작을 정리한다.
- S23/A20의 서로 다른 높이에서 판 크기, safe area, scroll, touch target을
  확인한다.

### 4. 장애복구와 rollout

- 서버 재시작, Wi-Fi 중단, background/foreground, ack 유실, 중복 submit,
  stale version, 느린 subscriber를 주입한다.
- WebSocket flag를 내부/개발 → 제한된 학급 → 전체 순으로 확대한다.
- 오류율이나 p95 기준을 넘으면 WebSocket command flag를 끄고 기존 HTTP와
  outbox 복구 경로로 되돌린다. DB schema와 receipt는 그대로이므로 rollback이
  상태를 손상하지 않는다.

## 자동 검증

Rust:

- `cargo fmt --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`
- ticket 변조/만료/session/role binding, 인증 timeout, frame size
- commit 실패 시 broadcast 없음, commit 성공 뒤 양쪽 actor snapshot
- 동일 requestId replay, payload 변경 재사용, stale expectedVersion
- disconnect/reconnect/version catch-up, slow subscriber/backpressure

Next:

- 익명, 비참가자, 다른 session, feature-disabled actor의 ticket 거부
- ticket TTL과 actor/session binding, 원본 actor subject 및 비밀 미노출
- bot session의 HTTP transport 선택, present/missing Origin 정책
- 기존 HTTP snapshot/command와 status/error/header 계약 유지

모바일:

- 좌표 aim/취소, 확인 시 pending 즉시 표시, 같은-frame 중복 차단,
  correlated commit, rejection rollback
- ack timeout 후 권위 확인, background/reconnect, durable replay
- 더 낮은 version 무시, 높은 complete snapshot gap 수렴, session replacement,
  socket 장애 HTTP fallback
- typecheck, mobile tests, `design:check`, line/encoding checks

## 두 실기기 승인 시나리오

같은 session에 S23과 A20을 연결하고 각 항목의 timestamp와 최종 version을
기록한다.

1. 흑 → 백 → 흑 → 백 착수. 선택 좌표를 확인한 기기에는 pending이 100ms
   안에, 상대에는 확정 수가 p95 1초 안에 보여야 한다.
2. 같은 version에서 양쪽이 거의 동시에 명령을 보내 한쪽만 commit되고 다른
   쪽은 conflict snapshot으로 정확히 rollback되어야 한다.
3. 한 기기의 네트워크를 끊고 상대가 진행한 뒤 복구한다. 재연결 `ready`
   snapshot으로 최신 version을 받은 뒤에만 입력 가능해야 한다.
4. 착수 직후 앱을 background/재실행한다. 같은 requestId replay 또는 최신
   snapshot으로 한 번만 놓인 상태를 확인한다.
5. 한쪽이 기권하면 양쪽이 같은 종료 이유와 승자를 표시하고, 이후 착수는
   서버와 UI 모두 거부해야 한다.
6. host만 기존 HTTP endpoint로 재대국을 만들 수 있어야 한다. old-session
   `session_replaced` 또는 current-session 복구로 새 session ID, 이전 session
   링크, 초기 version, 규칙에 맞는 선후공을 얻고 두 기기가 새 ticket으로
   같은 판에 연결되어야 한다.

자동 테스트 통과만으로 이 승인 시나리오를 대체하지 않는다. 배포, 운영 DB
변경, store release도 이 문서의 구현 완료와 별도 승인 대상이다.
