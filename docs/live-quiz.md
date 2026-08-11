# 전체 이용자 라이브 퀴즈

Aura-board 놀이보드의 공개 실시간 4지선다 퀴즈입니다. 학급이나 보드에 종속되지 않고 로그인한 교사와 학생이 같은 전역 세션에 참여합니다.

## 방송 규칙

- 방송 시각: 매일 오후 1시 30분(Asia/Seoul)
- 세션 확정 기준: 오후 1시 25분. 세션 레코드가 나중에 생성되더라도 이 시각의 승인 상태를 기준으로 문항을 고정합니다.
- 문항 수: 승인 문제 중 최대 10개, 방송 시작 최소 4개
- 문항 진행: 답변 20초 + 정답/해설 공개 5초
- 진행자 화면이나 MC는 없으며 서버 시간을 기준으로 모든 이용자 화면이 자동 전환됩니다.
- 오후 1시 25분 이후 최소 문항 수를 채우지 못한 날은 다음 날 방송 준비 상태로 전환되고, 화면을 켜 둔 이용자도 다음 방송 시각에 자동 재동기화합니다.
- 같은 이용자는 문항당 한 번만 답할 수 있습니다.

## 실시간 동기화

라이브 화면은 반복 API 폴링을 사용하지 않습니다.

1. 입장할 때 `GET /api/live-quiz/state`로 개인 점수와 현재 문제를 한 번 동기화합니다.
2. Realtime 구독이 처음 활성화되면 최초 스냅샷과 구독 사이의 누락 이벤트를 막기 위해 상태를 한 번 대조합니다.
3. 세션 생성과 문항별 전체 응답 수는 Supabase Realtime의 PostgreSQL 변경 이벤트로 전달합니다. 다음 문제 스냅샷보다 먼저 도착한 응답 수 이벤트도 문항별로 보관했다가 합칩니다.
4. 답변 종료·정답 공개·다음 날 방송처럼 서버 시각으로 이미 결정된 경계에서는 해당 시각에 단 한 번 상태를 다시 읽습니다.
5. Realtime 연결이 끊겼다가 복구된 경우에만 누락 이벤트 확인을 위해 한 번 재동기화합니다.

상태 응답의 서버 시각은 요청 왕복 시간의 중간점을 기준으로 보정해 느린 네트워크에서도 답변 마감 카운트다운이 과도하게 늦어지지 않게 합니다. 자동 동기화가 실패하면 현재 화면을 유지하면서 직접 다시 동기화할 수 있습니다.

Realtime publication과 클라이언트 경로는 `LiveQuizPublicSession`과 `LiveQuizQuestionCounterShard`만 사용합니다. 레거시 `LiveQuizQuestionCounter`는 명시적으로 은퇴했으며 더 이상 갱신·공개·구독하지 않습니다. 공개되는 두 테이블에는 방송 시각·문항 수·문항별 샤드 응답 수만 있으며, 참가자 식별자·선택 답안·정답·해설은 포함하지 않습니다. 브라우저는 같은 문항의 샤드 수를 합쳐 총응답 수를 표시합니다. 내부 `LiveQuizQuestion`, `LiveQuizSession`, `LiveQuizAnswer` 테이블은 RLS와 권한 회수로 직접 접근을 차단합니다.

## 문제 풀과 검수

`/admin/live-quiz`에서 운영자가 문제를 직접 만들면 즉시 승인 문제 풀에 들어갑니다. 교사와 학생은 라이브 화면의 **문제 추천** 탭에서 문제·선택지 4개·정답·해설을 제출할 수 있습니다.

추천 문제는 기본적으로 `pending` 상태이며 운영자가 문구와 선택지를 수정한 뒤 승인하거나, 이유와 함께 반려할 수 있습니다. 승인된 문제만 이후 방송 세션 후보가 됩니다. 이용자별 추천 한도는 최근 24시간 동안 5개입니다. 이 한도는 참가자별 PostgreSQL 트랜잭션 advisory lock으로 검사와 저장을 직렬화하므로 동시 요청으로 우회할 수 없습니다.

## 진입 경로

- 교사: 보드 화면의 **놀이** 탭에 있는 **잼라이브** 카드 또는 `/live-quiz`
- 학생: 놀이보드의 **잼라이브** 카드 또는 `/student/live-quiz`
- 운영자: 라이브 화면의 검수 버튼 또는 `/admin/live-quiz`

## API

- `GET /api/live-quiz/state`: 최초 입장, 시간 경계, Realtime 재연결 시 현재 안전 상태 동기화
- `POST /api/live-quiz/answer`: 현재 답변 구간의 선택지 저장
- `GET /api/live-quiz/suggestions`: 본인이 추천한 최근 문제와 검수 상태
- `POST /api/live-quiz/suggestions`: 추천 문제 제출
- `POST /api/admin/live-quiz/questions`: 운영자 기획 문제 생성
- `PATCH /api/admin/live-quiz/questions/:questionId`: 승인·반려·보관

모든 이용자 API는 `private, no-store`로 응답합니다. 정답과 해설은 각 문항의 20초 답변 시간이 끝난 뒤에만 전송됩니다.

## 저장 구조

`20260806_add_global_live_quiz` 마이그레이션은 다음 PostgreSQL 테이블을 추가합니다.

- `LiveQuizQuestion`: 기획·추천 문제와 검수 상태
- `LiveQuizSession`: 날짜별 고정 문항 ID 목록과 방송 시간
- `LiveQuizAnswer`: 교사·학생 참가자별 답변과 정오표
- `LiveQuizPublicSession`: Realtime에 공개하는 안전한 세션 일정 투영
- `LiveQuizQuestionCounter`: Realtime에 공개하는 문항별 총응답 수 투영

`20260811_shard_global_live_quiz_counters` 마이그레이션은 다음 변경을 적용합니다.

- `LiveQuizQuestionCounterShard` 테이블 신규 생성: 전역 동시 쓰기를 128개 행으로 분산하는 안전한 문항별 응답 수 투영
- `LiveQuizAnswer` 쓰기를 막는 테이블 잠금을 획득한 뒤 기존 답변을 backfill하고 트리거를 교체합니다. 이 과정은 하나의 명시적 트랜잭션이므로 실패하면 전체가 롤백됩니다.
- 기존 `LiveQuizQuestionCounter`는 레거시 투영으로 은퇴시켜 Realtime publication과 공개 SELECT 정책·권한에서 제거합니다. 물리 테이블만 배포 이력 확인을 위해 유지합니다.

세션과 응답 INSERT 트리거가 공개 투영을 같은 DB 트랜잭션에서 갱신합니다. 응답 INSERT는 참가자의 안정적인 샤드 번호를 사용하므로 한 문항의 모든 쓰기가 단일 카운터 행 잠금을 기다리지 않으며, 문항당 한 번만 답할 수 있는 고유 제약은 그대로 유지됩니다. 브라우저는 Realtime 구독을 먼저 연 뒤 현재 샤드 스냅샷을 읽고, 그 사이 도착한 이벤트와 최댓값으로 합쳐 최초 HTTP 총계에서 끊기지 않게 이어갑니다. 같은 렌더 프레임의 변경은 한 번만 화면에 반영합니다.

`LiveQuizQuestionCounter`의 은퇴 상태는 의도된 최종 상태입니다. 물리 테이블은 배포 이력 보존용일 뿐 새 트리거가 갱신하지 않고 Realtime publication에도 포함되지 않습니다. 샤딩은 DB 행 잠금 병목을 줄이지만, 답변마다 모든 전역 구독자에게 PostgreSQL 변경 이벤트 하나가 전달되는 fan-out 자체는 줄이지 않습니다. 따라서 외부 부하 시험은 Realtime 동시 연결·메시지 한도를 지켜야 하며, 그 한도를 넘는 규모는 서버 집계 배치나 별도 broadcast 계층이 필요한 잔여 용량 경계입니다.

브라우저는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용하며, 기존 환경은 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 호환합니다. 새 마이그레이션은 배포 전에 `npm run db:migrate`로 적용해야 합니다.

현재 자동 검증은 트랜잭션·잠금·backfill·트리거 교체 순서와 JS/SQL 샤드 호환성을 결정적으로 검사합니다. 이 작업 환경에서는 별도 PostgreSQL 인스턴스에 동시 INSERT를 발생시키는 실제 마이그레이션 경합 시험을 실행하지 않았습니다. 배포 전 스테이징 PostgreSQL에서 마이그레이션 중 INSERT가 대기한 뒤 새 샤드 카운터에 정확히 한 번 반영되는지 확인해야 합니다.
