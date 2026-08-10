# Realtime 안전 부하 테스트 계획

## 배경과 한도

2026-08-09 수신한 Supabase 할당량 안내 메일은 Realtime 동시 연결을 550 미만으로 낮추라고 요청했고, 관측 최고치는 1,000이었다. 2026-09-09부터 Fair Use가 적용되며, 그 전에라도 큰 초과가 계속되면 제한이 앞당겨질 수 있다. 메일함 식별자 등 개인 정보는 이 문서에 기록하지 않는다.

현재 Pro 프로젝트의 공식 한도는 동시 연결 500, 프로젝트 전체 메시지 500/초, 채널 join 500/초이다. 최고 성공 동시 연결 수는 해당 결제 주기의 Peak Connections 과금에 반영된다. 이 저장소는 승인 없는 실행에 총 예상 연결 450 이하, 연결 한도 500 이하, 연결 headroom 50 이상, join 100/초 이하, 전달 callback 400/초 이하, 메시지 한도 500 이하, 메시지 headroom 50 이상이라는 더 보수적인 상한을 적용한다.

HTTP 사용자 1,000명은 Realtime 연결 1,000개와 같은 의미가 아니다. HTTP 용량 검증과 장기 WebSocket 연결/팬아웃 검증은 자원과 과금 특성이 다르므로 반드시 별도 값으로 설정한다. 실행 전 Dashboard의 Realtime Reports에서 **Connected Clients 현재 기준값**과 **현재 메시지 Events/초 기준값**을 확인해 각각 `LOADTEST_REALTIME_BASELINE_CONNECTIONS`, `LOADTEST_REALTIME_BASELINE_MESSAGE_RATE`에 입력해야 한다. Realtime 클라이언트가 1명이라도 있으면 두 값 모두 필수다. Dashboard Events가 최종 권위 자료이며, 스크립트는 요청값을 자동 축소하지 않는다.

## 안전 프로필

- Smoke: HTTP 20명 / Realtime 20명.
- HTTP 용량: HTTP 1,000명 / Realtime 0명. 이 경우 baseline 입력은 필요 없다.
- Mixed: HTTP 1,000명 / Realtime은 `min(400, limit - headroom - baseline)` 이하. card/comment/like 도착 창은 각각 30초 이상으로 두되, 스크립트의 subscriber 분포 기반 보수적 preflight가 더 긴 창을 요구하면 그 값을 따른다.
- Realtime 1,000명: spend cap, 할당량, 비용 결정을 명시적으로 승인하고 Supabase 프로젝트 설정을 변경하기 전까지 금지한다. 안전 상한 완화에는 정확한 `LOADTEST_ALLOW_APPROVED_REALTIME_OVERRIDE=I_ACKNOWLEDGE_APPROVED_QUOTA_SPEND_AND_PROJECT_CHANGE`와 8~200자의 비어 있지 않은 `LOADTEST_REALTIME_APPROVAL_REFERENCE`가 동시에 필요하다. 승인 참조에는 비밀값을 넣지 않는다.

실행 설정에는 연결 한도/headroom, join 상한, callback 상한, `LOADTEST_REALTIME_MESSAGE_LIMIT`(기본 500), `LOADTEST_REALTIME_MESSAGE_HEADROOM`(기본 50), 승인 여부 boolean과 승인 참조만 결과 v2에 남긴다. 실제 subscriber의 보드별 분포와 `scheduledDelay` 결과로 card/comment/like 각 wave의 rolling 1초 peak를 계산한다. 전달 callback peak는 400/초 이하여야 하며, `전달량 + publish 이벤트 + baseline 메시지율`은 `message limit - headroom` 이하여야 한다. 모든 wave 추정치는 거부될 때도 결과에 남는다.

## 운영 절차

실행 전 Dashboard Realtime Reports에서 Connected Clients, Events, 채널 join 오류와 서비스 상태를 기록한다. baseline을 입력하고 예상 총 연결이 450 이하인지 확인한 뒤에만 실행한다.

실행 중에는 Connected Clients와 Dashboard Events 추이를 보고 다음 중 하나가 발생하면 즉시 중단한다: 예상 총 클라이언트가 450 초과, `too_many_connections`, `too_many_joins`, `tenant_events`, subscribe 실패, delivery 실패, 실제 transport callback 최고치 400/초 초과, 서비스 health 상실, outbox cleanup 실패. callback은 구독한 테스트 클라이언트가 관측한 하한일 뿐 전체 프로젝트 메시지량이 아니며, callback bucket이 상한을 넘으면 코드는 이후 예약 요청 발행을 즉시 멈추고 진행 중 요청 정리 후 cleanup으로 이동한다.

실행 후 Dashboard Realtime Reports에서 Connected Clients가 baseline으로 복귀했는지, 권위 자료인 Events/오류가 안정화됐는지 확인한다. 결과 JSON의 논리적 `changeCount` 전달 gate와 별도 transport callback 총계·이벤트별 합계·1초 bucket peak를 검토한다. 정확한 synthetic data 및 outbox cleanup이 모두 0인지 확인하고, 복귀하지 않거나 cleanup이 실패하면 추가 실행을 금지한다.
