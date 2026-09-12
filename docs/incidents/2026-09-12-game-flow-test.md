# 놀이보드 5종 실기기·교사 흐름 테스트

- 일시: 2026-09-12 KST
- 대상: 오목, 스피드게임, 노래 맞히기, 그림자연합, 꼬들
- 기기: S23 `R3CW50BW8KB`(로그인 코드 `DCY366`), A20
  `R59M904MEMY`(로그인 코드 `BMU63C`)

## 기준

- 오목: 학생끼리 자동 매칭
- 스피드게임·그림자연합·꼬들: 교사 개설 후 학생 참가
- 노래 맞히기: 교사 개설과 학생 방 생성 흐름

## 현재 확인

- 두 Android 기기 ADB 연결 및 학생 로그인 성공
- 교사 웨일 세션과 놀이보드 접근 성공
- 오목 학생 매칭 대기 화면과 참가 인원 표시 확인
- 오목 교사 화면은 학생 매칭 안내 화면으로 표시됨

## 미완료 및 원인

- 다섯 게임 각각의 개설·참가·진행·결과까지의 순차 검증은 진행 중이다.
- 브라우저 제어 세션이 한 차례 끊겨 재연결했다.
- 오목을 교사 개설 게임처럼 취급한 초기 테스트는 잘못된 테스트 기준이었다.

## 추가 재현 증거

- 두 학생이 오목 매칭에 참가해 `playerCount=2`가 표시됐다.
- 두 번째 학생 POST 이후 Next API가 `503`을 반환했다.
- 원인 로그: `createStartedMatch`가 플레이 엔진 세션 생성 요청에서 `500`을 받아 `omok_match_create_500` 발생.
- API가 실패한 매칭 티켓을 대기 상태로 되돌려 화면에는 계속 2명 대기로 표시된다.
- Rust 플레이 엔진 Cargo 테스트는 72개 통과했으나 실제 로컬 세션 생성 경로는 실패했다.

## 우선 해결 대상

### 엔진 응답으로 확인한 직접 원인

- 임시 개발 진단을 추가하고 A20에서 매칭 취소 후 재참가하여 재현했다.
- 엔진 응답: `storage_error`, `new row violates row-level security policy for table "PlaySession"`.
- 진단 코드는 응답 확보 후 제거했다. 요청 데이터나 자격증명은 기록하지 않았다.
- `20260802160000_game_ui_platform` 마이그레이션은 PlaySession 등 게임 테이블에 FORCE ROW LEVEL SECURITY를 적용한다.
- 로컬 엔진 DB 역할이 해당 정책 아래에서 INSERT할 수 없는 것은 확인됐다. 역할 이름과 승인된 서버용 연결은 아직 확인해야 한다.
- 꼬들·스피드게임 테이블에도 같은 마이그레이션이 적용되므로 다른 게임의 실제 동작도 별도 검증해야 한다. 공통 원인 여부는 아직 가설이다.

1. 로컬 플레이 엔진의 실제 세션 생성 500 응답 body와 서버 로그 확보
2. Next API와 엔진의 DB, 내부 인증, 생성 payload 불일치 수정
3. 두 학생 실기기에서 매칭판 전환과 착수 동기화 재검증

## 후속

## 개발 DB 복구 및 재검증 (03:09–03:10 KST)

- 실제 접속: database/role 모두 `aura_dev`, superuser=false, bypassrls=false. 강제 RLS 게임 테이블 13개의 소유자도 aura_dev이며 서버 정책이 없었다.
- `scripts/repair-dev-game-rls.cjs --apply`를 Infisical dev로 실행했다. DB/역할/소유권과 브라우저 역할의 서버 역할 상속 부재를 검사하고 13개 게임 테이블에 aura_dev 전용 정책을 추가했다. RLS/FORCE RLS 및 브라우저 역할 권한은 변경하지 않았다.
- A20 매칭 취소/재참가 후 POST matchmaking 200. 두 휴대폰이 같은 `omok-match-52c88911-2c30-4e27-bd70-9dc50ea964c6` 대국판에 진입했다.
- S23 첫 착수 명령 200, 화면 버전 v1과 상대 차례로 전환 확인. 상대 수신·승패까지의 전체 대국 검증은 진행 중이다.
- 운영 DB에는 적용하지 않았다. 다른 네 게임은 여전히 실제 진행/종료 검증이 필요하다.

## 오목 양방향 재검증 및 지연 기준선 (추가 확인)

- S23 학생 `test`가 흑, A20 학생 `공서희`가 백으로 같은 board
  `cmtx9ttb50011vs30ai2j2pso`, session
  `fabf8167-1399-4f2f-99e4-4d2bf56c9d66`에 연결됐다.
- 흑 → 백 → 흑 → 백으로 양쪽에서 번갈아 착수했고, 두 기기 모두 최종
  version 4와 같은 네 돌을 표시했다. 따라서 같은 대국의 양방향 권위 상태
  수렴은 확인됐다.
- 명령 POST는 약 1.8초, 2.2초, 최대 2.9초로 측정됐다. 상대 전파는 Rust
  outbox → Next cron → Supabase invalidation → snapshot 재조회 경로가 늦을 때
  3초 active polling까지 추가로 기다릴 수 있었다.
- 모바일은 pending 명령을 SecureStore에 저장하는 작업을 기다린 뒤 HTTP
  요청을 보내고, 응답 snapshot 뒤에만 돌을 표시한다. 이 구조와 긴 HTTP/DB
  왕복이 느린 착수 반응의 직접 원인이다.
- assertion secret 불일치와 stale 하드코딩 저장소 경로/DB 우선순위도 로컬
  복구 중 확인됐다. `scripts/start-play-engine.ps1`은 현재 저장소 루트를
  동적으로 계산하고 Infisical이 주입한 secret/DB 값을 우선하도록 수정돼
  있다. secret 값 자체는 기록하지 않았다.
- 실시간화와 상용 UX 후속 계약은
  `docs/omok-realtime-commercialization-plan.md`에 기록했다. 운영 DB, 배포,
  다른 네 게임 상태는 변경하지 않았다.

## WebSocket Upgrade 403 원인 및 수정 상태 (추가 확인)

- 위 양방향 착수는 실제 WebSocket 명령이 아니라 3초 HTTP 복구 경로로
  성공했다. 두 기기는 약 1 → 2 → 4 → 8 → 15초 backoff로 새 티켓을 계속
  발급받았고, healthy socket에서는 없어야 할 active polling도 유지됐다.
- 수정 전 동일 `/v1/realtime` Upgrade probe는 Origin이 없을 때 `101`,
  `Origin: http://127.0.0.1:8788` 등 present Origin에서 `403`을 반환했다.
  설치된 React Native Android WebSocket 모듈은 호출자가 Origin을 주지 않으면
  `ws://127.0.0.1:8788`에서 `Origin: http://127.0.0.1:8788`을 자동 생성한다.
  Rust allowlist가 비어 있어 두 실기기의 모든 실제 handshake가 차단된 것이
  반복 티켓과 HTTP fallback의 확정 원인이다.
- 모바일은 고정 Origin `https://mobile.aura-board.invalid`를 명시하고, Rust는
  해당 값을 환경 allowlist에 정확히 설정한 경우에만 허용하도록 수정했다.
  빈 allowlist는 HTTP 플레이를 유지한 채 realtime만 fail-closed로 비활성화한다.
  최종 hardening 재검증에서는 Origin 누락과 비허용 Origin이 모두 Upgrade 전에
  `403`으로 거부됐고, 고정 mobile sentinel Origin은 ticket 인증 후 `ready`까지
  성공했다.
- 모바일은 ready 전 실패를 총 6회로 제한하고 이후 reconnect timer 없이
  HTTP-only degraded 상태로 전환한다. foreground 복귀와 session reset은 새
  bounded cycle을 연다. Rust는 인증된 `(session, role, actor)`별 소켓 하나만
  유지하며 교체 경쟁, stale cleanup, Pong heartbeat를 구분한다.
- 자동 회귀 검증 뒤 15:51–16:02 KST에 수정 후 실기기 경로를 재검증했다.
  S23/A20은 같은 board/session에서 각각 인증된 Rust WebSocket 하나를 지속했고,
  active connection 수는 최종 2개였다. healthy 상태에서 10초 이상 3초
  `/session` polling이 없었고, 착수 중 Next `/commands` POST도 없었다.
- 실제 WebSocket 경로로 흑 → 백 → 흑 → 백을 번갈아 착수했다. 마지막 백
  착수 뒤 두 판에 같은 새 백돌이 표시됐고 S23은 `내 차례`, A20은
  `상대 차례`로 수렴했다. 최종 session version 숫자는 별도 인증 조회로
  확인하지 않아 기록하지 않는다.
- S23을 background로 보냈을 때 해당 연결이 종료됐고, foreground/deep-link
  복귀 뒤 새 ticket과 두 번째 지속 소켓이 복구됐다. 단일 활성 소켓 교체 규칙도
  일시적인 세 번째 연결을 기존 연결과 교체해 다시 두 개로 정리했다.
- A20의 선택, 별도 확인, 즉시 pending 표시를 실기기에서 확인했다. Android
  녹화가 정적 프레임을 생략하고 ADB 입력 반환시간 편차가 커 정밀 latency
  수치는 산출하지 않았다. 따라서 p50/p95 목표는 후속 계측 게이트로 남지만,
  기존 정상 경로의 최대 3초 polling 대기는 제거된 것으로 확인했다.
- 최종 증거는
  `C:\Users\coseung2\AppData\Local\Temp\aura-board-omok-device-current`의
  `s23-after-final-white.png`, `a20-after-final-white.png`,
  `a20-final-white-selected.png`에 보존했다.

- 위 역할 기준으로 게임별 성공/실패를 기록한다.
- 실패 항목은 원인과 재현 절차를 추가한 뒤 수정하고 재검증한다.

## 구버전 Rust snapshot 롤링 호환 (16:40–17:06 KST)

- 증상: A20은 matchmaking 200으로 기존 match board에 이동했지만
  `대국 준비 중 / 연결을 확인해 주세요`에 머물렀다. 같은 시각 session GET은
  약 3초마다 HTTP 200이었고 DB/Rust session은
  `fabf8167-1399-4f2f-99e4-4d2bf56c9d66`, version 16, active였다.
- 확정 원인: 실행 중 Rust는 최신 소스보다 먼저 시작된 바이너리라 snapshot의
  `viewer`에 `role`, `slot`만 반환했다. 최신 Expo validator는
  `viewer.capabilities.canRematch`를 필수로 검사해 그 응답을
  `invalid_omok_snapshot`으로 거부했다. stale ticket이나 사라진 session은
  원인이 아니었다.
- 잘못된 초기 대응: matched GET마다 Rust current-session을 추가 조회해 404
  ticket을 정리하는 `703c8725`는 이번 원인을 해결하지 않고 로비 지연과 엔진
  의존성만 늘렸다. 검토 후 `2f0b7415`로 비파괴 revert했다.
- 수정: Expo contract parser가 `capabilities` own property가 완전히 없을 때만
  입력을 변이하지 않은 clone에 `{ canRematch: false }`를 넣고 strict validator를
  다시 통과시킨다. HTTP current/command/rematch와 WebSocket ready,
  command_committed, snapshot, command_rejected, session_replaced에 적용했다.
  null·부분·잘못된 capabilities 및 다른 malformed field는 계속 거부한다.
- 검증: compatibility/move/socket Vitest 59개, mobile typecheck,
  `design:check`, scoped diff check가 통과했다. 현재 Metro bundle을 명시적으로
  reload한 A20은 version 16, 16수, `상대 차례` 판을 복원했다. reload 과정에서
  열린 기권 확인창은 취소했고 command/resign POST가 없음을 로그로 확인했다.
- 증거: 같은 임시 증거 폴더의 `a20-legacy-contract-baseline.png`와
  `a20-after-rn-reload.png`. 이후 S23/A20 direct-link 동시 캡처는 Expo Go route
  history가 일반 보드 목록으로 복귀해 완료하지 못했으므로 새 양방향 검증으로
  세지 않는다.
- 영향 및 후속: session/DB 상태 손상은 없었다. 실행 중 Rust 재시작, 정밀
  p50/p95, Postgres restart와 slow-network/ack-loss 장애 주입, 제한 학급 rollout은
  남아 있다. 운영 배포는 하지 않았다.

## Realtime-ticket 503 및 qualification 중단 경계 (17:40–18:00 KST)

- 증상: S23 `R3CW50BW8KB`와 A20 `R59M904MEMY` 모두 session
  `fabf8167-1399-4f2f-99e4-4d2bf56c9d66`의 realtime-ticket POST에서 반복
  503을 받았고 응답 body는 `{"error":"realtime_disabled"}`였다.
- 확정 원인: Next ticket route가 Rust에 도달하기 전에 realtime disabled로
  거부했다. Infisical dev 환경의 값이 아닌 존재 여부만 검사한 결과 enable,
  ticket secret, public WS URL, allowed origins 네 설정이 모두 부재했다. 따라서
  구버전 Rust PID 31788만 controlled restart하는 것으로 복구 가능한 설정
  drift가 아니다.
- 대응: 비밀값이나 환경을 변경하지 않았고 Next 35292, Metro 1628, Rust 31788을
  모두 보존했다. ticket 200/socket-ready는 복구되지 않았다. PID 28800/15434는
  원격 `100.120.114.62` Postgres로 향하는 SSH 포워드라 중지하지 않았다.
- qualification 판정: touch→pending native paint, engine commit/ack,
  peer-device native render는 모두 **blocked, count 0, p50/p95 unavailable**이다.
  layout 표식만 instrumented 상태이며 native paint로 부르지 않는다. Rust restart,
  slow-network, ack-loss, slow-subscriber도 ready socket 없이 최종 수렴을 증명할 수
  없어 physically not run으로 남긴다. Postgres restart는 안전 경계 미증명으로
  prohibited다.
- 안전 사건: S23에서 재확인을 누르려다 기권 확인창이 열렸지만 기권 명령이나
  `/commands` POST는 없었다. 취소 버튼을 눌렀고
  `s23-after-resign-cancel.xml/png`에서 dialog가 닫힌 기존 16수 판을 재확인했다.
- 증거: 원시 logcat, 양 기기 framestats, UI hierarchy/screenshots, process ledger,
  0-sample JSON과 nearest-rank 계산 출력은
  `C:\Users\coseung2\AppData\Local\Temp\aura-board-omok-device-current\qualification-2026-09-12`
  에 보존했다.
- 영향/잔여 조치: authoritative session/board를 변경하지 않았고 배포도 하지
  않았다. 승인된 dev realtime 설정이 주입되어 ticket 200/socket-ready가 된 뒤
  native frame-present 상관 측정과 scoped fault/restart 시나리오를 다시 수행해야
  상용화 readiness를 판단할 수 있다.

## Realtime 복구 및 장애 qualification 완료 (18:39–19:16 KST)

- 복구: task-owned supervisor로 Next와 Rust에 승인된 dev realtime 설정을 주입했다.
  양 기기는 같은 session `fabf8167-1399-4f2f-99e4-4d2bf56c9d66`에 WebSocket으로
  재인증했고, 12초 healthy 구간에 `/session` HTTP poll 증가는 0이었다.
- 정상 경로: S23 v18→19와 A20 v19→20 착수가 각각 한 번만 commit됐고 양 기기가
  같은 판으로 수렴했다. requester pending layout은 34ms/109ms, ack는
  1.106s/1.162s, requester layout은 1.144s/1.276s, peer layout은 98ms/37ms였다.
- Rust-only restart: listener 재시작 후 socket 2개가 같은 session에 복구됐고
  S23 v20→21 착수가 duplicate 없이 성공했다. pending 24ms, ack 1.138s,
  requester layout 1.157s, A20 peer layout 95ms였다. restart 순간 input gate는
  직접 샘플링하지 못했다.
- 느린 네트워크: A20 WebSocket에 편도 650ms 지연을 주입했다. request
  `place_stone.mty867zo.lh3ghmeb1jk`가 v21→22를 한 번만 commit했고 양 기기가
  수렴했다. pending 123ms, ack 2.527s, requester layout 2.631s,
  S23 peer layout 31ms였다.
- ack 유실: S23의 첫 `command_committed`를 버렸다. 동일 request
  `place_stone.mty89m2q.u23mobaowl`가 재전송되어 첫 응답 `replayed:false`,
  재전송 응답 `replayed:true`를 확인했고 v22→23은 한 번만 증가했다.
  pending 93ms, replay ack 4.604s, requester layout 4.641s,
  A20 peer layout 96ms였다.
- slow reader: S23 upstream read를 6초 중단한 동안 A20 v23→24가 성공했고,
  stall 종료 직후 S23은 snapshot v24 하나로 따라잡았다. A20 pending 117ms,
  ack 1.114s, requester layout 1.175s, S23 snapshot→layout 35ms였다. Rust의
  send-timeout/drop seam은 deterministic test로 별도 통과했다.
- 최종 상태: active v24, 다음 차례 first, proxy 8788/8789/8790은 모두 종료,
  양 기기 reverse는 8787로 복원됐다. Metro PID 1628과 Postgres SSH PID 28800은
  보존했다. Postgres restart는 소유권·rollback 경계 미증명으로 prohibited다.
- 성능 판정: 위 값은 RN layout/ack 경계다. S23의 frame-present 값은 대상 frame과
  신뢰성 있게 결합되지 않았고 A20에는 `DisplayPresentTime`이 없어 native-paint
  표본은 0, p50/p95는 unavailable이다. layout 수치를 paint로 승격하지 않는다.
- 증거: 같은 qualification 폴더의 `fault-slow-a20.jsonl`,
  `fault-drop-ack-s23.jsonl`, `fault-stall-s23.jsonl`, 각 v21–v24 log/XML/PNG,
  supervisor ledger와 framestats를 보존했다. 배포는 수행하지 않았다.
