# 놀이보드 UX 감사 및 단계별 개선 — 2026-09-15

## 범위와 근거

공식 PLAY 5종(노래 맞히기, 오목, 꼬들, 그림자연합, 스피드게임)의 웹 교사/학생 및 Expo 학생 화면, 부모 게임 허브, 생성·입장·진행·종료·복귀 경로를 대상으로 한다. 허브의 잼라이브 링크는 별도 수업 퀴즈이며 이번 게임 규칙 변경에 포함하지 않는다.

절차: `.codex/skills/aura-ux-audit/SKILL.md` + `.codex/skills/ux-flow-audit/SKILL.md`. 제품 계약은 `game-ui-platform-spec.md`, 검증 기준은 `verification-checklist.md`를 따른다. 코드/테스트 근거와 실제 기기·운영 관측을 구별한다. 이번 초기 감사는 코드 경로 분석이며 실제 운영 DB 분포, 접속 지연, 기기 재현을 실측했다고 주장하지 않는다.

사용자 결정: 자동 출제는 설정 후 게임 만들기 한 번, 정답 공개 전 공개 점수/순위 동결, 라운드 동안 음원 자동 반복, 같은 카테고리의 그럴듯한 객관식 보기, 종료된 방은 활성 목록에서 제외한다. 미디어 길이/라운드 시간은 메타데이터·서버 deadline에서 읽으며 15초/30초를 새로운 UX 상수로 만들지 않는다. 기존 버전별 음원 수용 규칙은 별도 마이그레이션 없이 바꾸지 않는다.

## 발견 사항 및 처리 경계

| ID | 영향 | 근거 | 개선 목표 |
|---|---|---|---|
| G01 | P0 상태 오표시 | `src/app/api/game-hub/status/route.ts`: 한 session만 조회, 완료 상태/가입 이력으로 현재 표시 도출 | 활성 세션/실제 참가 의미를 분리하고 terminal 상태 및 복수 방 집계 검증 |
| G02 | P1 지연 | 웹 `GameHubCatalog` 정상 경로 15초 interval; 게임마다 다른 broadcast 경로 | 구독 가능한 채널을 반환하고 허브도 이벤트 기반 재조회, 장애 시에만 fallback |
| G03 | P0 종료/정리 | song-guess DB 목록과 advance_due/terminal persistence 경로 | 마지막 화면이 사라져도 due transition을 읽기에서 확정, 종료 메타데이터 및 활성 목록 일관성 |
| G04 | P1 입장/명령 전파 | 오목 HTTP proxy, 그림자연합 PATCH, 꼬들 참가자 구독 | commit 후 즉시 알림, 기존 outbox/권위 WebSocket/복구 경로 유지 |
| S01 | P1 불필요 단계 | `SongGuessPoolPicker` → `SongGuessSetupControls` | 답변 방식/출제 대상을 처음부터 선택; 준비+생성을 한 행동으로, 실패/재시도 보존 |
| S02 | P0 결과 선노출 | Rust `model_song_guess.rs`, 웹/Expo scoreboard | 공개 snapshot에서 현재 라운드 득점/정답 여부 차단; reveal 시 갱신 |
| S03 | P1 분리된 재생 | 웹 `SongGuessPlayer`, Expo `SongGuessPlayerCard` | 실제 음원 반복 및 deadline 정지, autoplay 실패만 복구 버튼, 배경/이탈 정지 |
| S04 | P1 선택지 품질 | `choices.ts`, `server.ts`, `student-rooms.ts` | 소스/카테고리를 보존한 후보 선정; 다른 카테고리로 몰래 보충하지 않음 |
| O01 | P1 플레이 방해 | 웹 `OmokBoard` 정상 refresh 버튼·syncing 입력 잠금 | 정상 동기화는 조용히, 오류 재시도 유지; terminal 복귀 행동 |
| K01 | P1/P2 단계/위계 | `KordleTeacherControls/Board/Participants` | 실제 검수/교사 시작 경계 유지 여부 확인; 역할/단계에 맞는 제어와 중복 설명 축소 |
| H01 | P1/P2 정보 과밀 | `ShadowAllianceTeacherGame` 설명 carousel, 항상 종료/이어하기 | 게임 방법을 선택적 도움말로; 종료 상태에서 불가능한 행동 제거 |
| F01 | P0/P1 역할/완료 | `SpeedGameTerminalPanel` 교사 학생 링크; 완료/조기 종료 경쟁 | 역할에 맞는 복귀, 정상 완료와 조기 종료 구분, 위험 확인 유지 |
| F02 | P2 내부 정보 | `SpeedGameBoard` run/version/board/classroom footer | 내부 정보 제거, 상태 변화 중 플레이 영역 보존 |

위 항목의 실제 원인은 구현 단계에서 재확인한다. 화면에 남은 방을 OS 고아 프로세스로 단정하지 않는다. `current`, 종료 시각, phase, roster membership, online presence, 매칭 ticket은 서로 다른 사실이다. 이탈/네트워크 단절만으로 게임을 끝내거나 과거 전적을 삭제하지 않는다.

## 단계별 계획

- [x] 0. 범위·근거·검증 기준 기록 및 계획 커밋.
- [x] 1. 공통 상태/목록/종료 메타데이터 및 즉시 전파. 오류/복구, 복수 방, terminal, 가입 이력/온라인 의미 테스트 후 커밋.
- [x] 2. 노래 맞히기 공개 점수와 카테고리 기반 보기. Rust/API/웹·모바일 계약, 새로고침·재시도·동점 테스트 후 커밋.
- [x] 3. 노래 맞히기 생성·재생 UX. 생성 중복/실패, 실제 길이 반복, deadline, autoplay 거부, 배경 전환 테스트 후 커밋.
- [x] 4. 오목·꼬들·그림자연합·스피드게임 화면/역할/복귀 정리. 기능별 테스트와 웹/Expo typecheck 후 커밋.
- [x] 5. 통합 검증, 검사 결과·남은 실기기/운영 게이트 기록, 최종 커밋 및 main 푸시.

각 단계는 기능적으로 복구 가능한 단위로 유지한다. 운영 DB 조작·배포·앱 스토어 빌드는 이번 요청 범위 밖이다. 사용자가 요청한 커밋/최종 푸시 외에 원격 변경을 하지 않는다.

## 흐름 및 KLM 비교

웹 교사의 자동 출제 확정 부분만 비교한다. 카테고리·구간·문제 수·출제 대상·답변 방식은 동일한 사용자 결정으로 남는다.

기존: 문제 준비하기 → 게임 만들기. 목표: 게임 만들기. 코드에서 추적한 경로이며 실제 사용자 소요시간 실측이 아니다.

`python3 .codex/skills/ux-flow-audit/scripts/klm_score.py score 'M P B M P B' 'M P B'`

모델 출력: M 2 → 1, 5.10 → 2.55초, ΔM -1 / -2.55초. 네트워크/음원 준비시간은 이 계산에 포함되지 않는다. 모바일 탭 비용으로 같은 시간을 재사용하지 않는다. 기존 학생 방 생성은 별도 준비 버튼이 없으므로 자동 출제 단계 축소를 모바일 성과로 중복 계산하지 않는다.

## 검증 기록

초기: KLM selftest 및 경로 점수 계산 통과. 작업 전 main은 원격보다 기존 UX 스킬 관련 4커밋 앞서며 작업 트리는 깨끗했다. 실제 구현/검증 결과는 아래에 단계별 추가한다.

필수 회귀: 생성/입장/시작/제출/공개/다음/종료/복귀, 응답 유실·동일 requestId, 낡은 snapshot 거부, 두 클라이언트 동시 입장, 완료 방 재노출 방지, 역할별 링크, 웹/Expo 계약. 실제 기기 및 운영 인증이 없는 검증은 fixture/code-only로 명시한다.

### 1단계 결과

- 웹/Expo 방 목록의 정상 5초 폴링과 웹 허브 15초 폴링을 이벤트 구독으로 교체했다. 서버가 제공한 다음 전이 시각에만 단발 재조회를 추가해 자동 종료를 읽기 경로에서도 확정한다. 최초 구독과 HTTP 사이 이벤트 누락, 모바일 healthy socket에서 HTTP만 실패하는 복구 누락을 보완했다.
- 허브는 완료 세션을 활성 게임으로 취급하지 않고 복수 자유 방을 집계한다. 초대 명단과 확인된 참가를 구분하며 온라인 소켓 수라고 표현하지 않는다. 교사 시도는 꼬들 학생 수에 포함하지 않는다.
- 노래 맞히기 자동/명시 종료의 completedAtMs를 함께 저장하고, catch-up 직후 완료된 방을 같은 응답에 다시 반환하지 않는다. 오목 terminal 세션에 속한 transient 방/ticket은 명령·목록 읽기·outbox 복구에서 정리한다. 결과/receipt/대국 기록은 삭제하지 않는다.
- 검증: 공통 경로 12파일/82테스트, 오목 정리·outbox·모바일 realtime 4파일/24테스트, 추가 허브 API/상태/정리 묶음 7파일/50테스트 통과(서로 중복되는 테스트 수를 합산하지 않음). 웹 typecheck와 diff check 통과. Rust workspace는 97테스트 통과, Docker 재시작 통합 1건은 환경 요구로 ignored.
- 당시 모바일 typecheck 오류는 후속 재검증에서 설치된 Expo 54와 저장소가 선언한 Expo 57의 불일치로 확인됐다. 잠금 파일 기준 `npm ci` 후 소스 우회 수정 없이 모바일 typecheck/design:check가 통과했다. 실제 두 클라이언트 지연·기기 화면 및 운영 DB 전파는 아직 실측하지 않았다.

### 2단계 결과

- Rust snapshot의 공개 누적 점수와 roundScore/정답 flag를 reveal 경계에 맞췄다. 객관식 command receipt는 공개 전 정답 여부를 반환하지 않는다. API에도 멱등 공개 projection을 두어 이전 v2 응답을 새 엔진 응답과 섞어도 획득 점수를 두 번 차감하지 않는다. 개인 서술형 정답 입력 잠금은 유지한다.
- 자동 출제는 sourceCatalogSongId를 서버에서 저장하고 기존 음원을 다시 저장할 때도 출처를 보존한다. 신규 nullable 컬럼 마이그레이션만 추가했으며 실제 DB에는 적용하지 않았다. 카테고리 없는 기존 수동 문제는 모호하지 않은 제목/아티스트 일치로만 출처를 복원하거나 명시적 수동 팩 안에서 보기를 만든다.
- 같은 카테고리 후보, 동의어/아티스트 중복 제거, 원본 ID 복원, 부족한 후보 오류, 공개 전 점수 고정·새로고침·reveal를 검증했다. 노래 관련 6파일/47테스트 및 API projection/route 4파일/18테스트 통과. Rust workspace 97테스트 통과(Docker 재시작 1건 ignored), 웹 typecheck/diff check 통과.

### 3단계 결과

- 교사는 분류/구간/문제 수/출제 대상/답변 방식을 먼저 선택하고 `게임 만들기` 한 번으로 준비와 세션 생성을 진행한다. 같은 구성의 실패 재시도는 준비된 팩과 requestId를 재사용하고, 서버는 다른 화면이 바꾼 구성으로 잘못 생성하지 않도록 expectedRoundIds를 검사한다. 수동 음원 편집의 명시적 저장/검수는 유지한다.
- 신규 엔진은 생성 시 로비를 함께 연다. 구엔진 Draft 응답은 내부 재시도 가능한 open_lobby 명령으로 처리하며 기존 요청의 직렬화/해시 기본값은 보존한다.
- 웹/Expo는 실제 media loop를 사용하고 서버 deadline에 정지한다. 재생 버튼/음원 별 타이머/진행바는 제거하고 차단 또는 실패 상태에서만 소리 켜기/재시도를 제공한다. 음소거는 유지한다. 모바일은 포그라운드 복귀 시 최신 snapshot 확인 후 재생하며 이전 라운드의 늦은 음원 응답을 버린다.
- 모바일 방 생성/목록도 카테고리·구간·문제 수와 입장 가능 여부 중심으로 축소했다. 진행 방으로의 복귀와 신규 입장을 구별한다.
- 검증: 노래 관련 Vitest 35파일/384테스트, Rust workspace 99테스트 통과(Docker 재시작 1건 ignored), 웹/모바일 typecheck와 모바일 design:check, diff check 통과. 재생 테스트는 실제 production hook/component에 모의 media 포트를 연결한 자동 검증이며 브라우저 자동재생 정책·실기기 청취/지연 실측을 대신하지 않는다.

### 4단계 결과

- 오목: 정상 Realtime reconcile 중 `실시간 연결`/`동기화 중`과 상시 `최신 상태 확인`을 제거했다. 평상시 refresh는 판 입력을 잠그지 않으며, 미확인 명령·오류에서만 복구 행동을 노출한다. 기권은 확인을 거치고, terminal에서는 capability 기반 재대국과 교사/학생 역할별 게임 목록 복귀를 제공한다. 내부적인 same-frame 중복 명령도 잠갔다.
- 스피드게임: teacher active 화면에서 `다음 라운드`와 `게임 완료`가 동시에 경쟁하지 않게 현재 단계에 맞는 주 행동 하나만 보여 준다. `조기 종료`는 별도 위험 행동으로 확인을 유지한다. run/version/board/classroom ID footer를 제거하고, 연결 복구 문구는 장애 때만 표시한다. 학생 기권 성공 뒤 게임 목록으로 복귀하고, 웹·Expo 모두 중복 participant/answer mutation을 차단한다. 완료 화면의 게임 목록 링크도 역할별 목적지로 고쳤다.
- 그림자연합: 정상 연결 badge와 `교사 본부` 같은 구현/역할 반복 문구를 제거했다. 긴 게임 설명은 기본 접힘 `게임 방법`으로 내리고, `다음에 이어하기`/`게임 종료`는 `게임 관리`에 묶어 현재 게임 행동과 경쟁하지 않게 했다. 종료 후 라운드 제어가 다시 나타나지 않으며 `새 게임`/`게임 목록`만 제공한다.
- 꼬들: 초대/과거 attempt와 현재 대기실 접속을 분리했다. 웹·Expo 대기실은 별도 Supabase Presence 채널로 실제 접속 학생만 표시하고, HTTP의 durable participant 데이터는 pet 등 표시 보강에만 사용한다. 종료된 퍼즐의 과거 참가자를 다음 문제의 현재 참가자처럼 재사용하지 않는다. 문제 생성 뒤 DRAFT는 교사의 실제 검수 경계로 유지하되 새 문제 생성 UI는 숨기고 `게임 시작`/`문제 취소`만 남긴다. LIVE에서는 종료 확인만 제공한다.
- 단계별 커밋: `24930749`(오목), `c5c4a044`(스피드게임), `cd1b41ba`(그림자연합), `c37e4b3a`(꼬들).
- 검증: 오목/스피드게임/그림자연합/꼬들 핵심 컴포넌트·realtime 테스트가 모두 통과했고, 웹 typecheck, Expo typecheck, Expo `design:check`, `git diff --check`가 통과했다. 꼬들 Presence에는 cleanup/observer failure 회귀 테스트를 추가했다.

### 5단계 통합 검증

- 전체 root Vitest: **464파일 / 2,796테스트 통과**. PLAY 5종, game hub/status, realtime invalidation, terminal cleanup, song-guess projection/audio/rooms, 오목 lobby lifecycle, 스피드게임 runtime, 그림자연합 engine/parity, 꼬들 puzzle/realtime/presence를 포함한다.
- 웹 `npm run typecheck`, Expo `npm run typecheck --prefix apps/mobile`, Expo `npm run design:check --prefix apps/mobile` 통과.
- `npm run build` production build 통과. Next.js production compile, TypeScript, 159개 static page generation과 최종 최적화가 완료됐다.
- 최종 Rust 재실행은 현재 DevSpace Linux 셸에 `cargo` 실행 파일이 없어 수행할 수 없었다. 같은 변경 묶음의 가장 최근 Rust 검증은 3단계 직후 workspace **99테스트 통과**이며 이후 4단계는 TypeScript/UI/Presence 경로만 변경했다. 이 환경 제약을 Rust 미통과로 오해하지 않되, 배포 전 Rust CI가 다시 녹색인지 확인한다.
- `npm run check:lines`는 저장소 기준선부터 실패한다. `origin/main`에서도 `apps/mobile/theme/tokens.ts` 840줄, `src/components/AddCardModal.tsx` 801줄이며, 이번 작업 뒤 `SongGuessBoard.tsx` 833줄(기준 810), `SongGuessGame.module.css` 802줄(기준 799)도 한도를 넘는다. UX 변경을 숨기기 위한 무관한 대규모 파일 분해는 이번 범위에 섞지 않았고 별도 리팩터링 부채로 남긴다.
- 실제 두 기기 동시 참가 반영 지연, 브라우저 autoplay 정책, foreground/background, 운영 DB에 대한 terminal 방 제거는 자동 테스트가 대체하지 않는다. S23/A20 및 운영/staging acceptance는 후속 실기기·배포 게이트다.
