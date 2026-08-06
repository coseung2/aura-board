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

Realtime publication에는 `LiveQuizPublicSession`과 `LiveQuizQuestionCounter`만 포함됩니다. 두 테이블에는 공개 가능한 방송 시각·문항 수·문항별 총응답 수만 있으며, 참가자 식별자·선택 답안·정답·해설은 포함하지 않습니다. 내부 `LiveQuizQuestion`, `LiveQuizSession`, `LiveQuizAnswer` 테이블은 RLS와 권한 회수로 직접 접근을 차단합니다.

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

세션과 응답 INSERT 트리거가 공개 투영을 같은 DB 트랜잭션에서 갱신합니다. 브라우저는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용하며, 기존 환경은 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 호환합니다. 새 마이그레이션은 배포 전에 `npm run db:migrate`로 적용해야 합니다.
