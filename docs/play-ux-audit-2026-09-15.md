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
- [ ] 1. 공통 상태/목록/종료 메타데이터 및 즉시 전파. 오류/복구, 복수 방, terminal, 가입 이력/온라인 의미 테스트 후 커밋.
- [ ] 2. 노래 맞히기 공개 점수와 카테고리 기반 보기. Rust/API/웹·모바일 계약, 새로고침·재시도·동점 테스트 후 커밋.
- [ ] 3. 노래 맞히기 생성·재생 UX. 생성 중복/실패, 실제 길이 반복, deadline, autoplay 거부, 배경 전환 테스트 후 커밋.
- [ ] 4. 오목·꼬들·그림자연합·스피드게임 화면/역할/복귀 정리. 기능별 테스트와 웹/Expo typecheck 후 커밋.
- [ ] 5. 통합 검증, 검사 결과·남은 실기기/운영 게이트 기록, 최종 커밋 및 main 푸시.

각 단계는 기능적으로 복구 가능한 단위로 유지한다. 운영 DB 조작·배포·앱 스토어 빌드는 이번 요청 범위 밖이다. 사용자가 요청한 커밋/최종 푸시 외에 원격 변경을 하지 않는다.

## 흐름 및 KLM 비교

웹 교사의 자동 출제 확정 부분만 비교한다. 카테고리·구간·문제 수·출제 대상·답변 방식은 동일한 사용자 결정으로 남는다.

기존: 문제 준비하기 → 게임 만들기. 목표: 게임 만들기. 코드에서 추적한 경로이며 실제 사용자 소요시간 실측이 아니다.

`python3 .codex/skills/ux-flow-audit/scripts/klm_score.py score 'M P B M P B' 'M P B'`

모델 출력: M 2 → 1, 5.10 → 2.55초, ΔM -1 / -2.55초. 네트워크/음원 준비시간은 이 계산에 포함되지 않는다. 모바일 탭 비용으로 같은 시간을 재사용하지 않는다. 기존 학생 방 생성은 별도 준비 버튼이 없으므로 자동 출제 단계 축소를 모바일 성과로 중복 계산하지 않는다.

## 검증 기록

초기: KLM selftest 및 경로 점수 계산 통과. 작업 전 main은 원격보다 기존 UX 스킬 관련 4커밋 앞서며 작업 트리는 깨끗했다. 실제 구현/검증 결과는 아래에 단계별 추가한다.

필수 회귀: 생성/입장/시작/제출/공개/다음/종료/복귀, 응답 유실·동일 requestId, 낡은 snapshot 거부, 두 클라이언트 동시 입장, 완료 방 재노출 방지, 역할별 링크, 웹/Expo 계약. 실제 기기 및 운영 인증이 없는 검증은 fixture/code-only로 명시한다.
