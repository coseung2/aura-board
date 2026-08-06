# 전체 이용자 라이브 퀴즈

Aura-board 놀이보드의 공개 실시간 4지선다 퀴즈입니다. 학급이나 보드에 종속되지 않고 로그인한 교사와 학생이 같은 전역 세션에 참여합니다.

## 방송 규칙

- 방송 시각: 매일 오후 1시 30분(Asia/Seoul)
- 세션 확정 기준: 오후 1시 25분. 세션 레코드가 나중에 생성되더라도 이 시각의 승인 상태를 기준으로 문항을 고정합니다.
- 문항 수: 승인 문제 중 최대 10개, 방송 시작 최소 4개
- 문항 진행: 답변 20초 + 정답/해설 공개 5초
- 진행자 화면이나 MC는 없으며 서버 시간을 기준으로 모든 이용자 화면이 자동 전환됩니다.
- 같은 이용자는 문항당 한 번만 답할 수 있습니다.

## 문제 풀과 검수

`/admin/live-quiz`에서 운영자가 문제를 직접 만들면 즉시 승인 문제 풀에 들어갑니다. 교사와 학생은 라이브 화면의 **문제 추천** 탭에서 문제·선택지 4개·정답·해설을 제출할 수 있습니다.

추천 문제는 기본적으로 `pending` 상태이며 운영자가 문구와 선택지를 수정한 뒤 승인하거나, 이유와 함께 반려할 수 있습니다. 승인된 문제만 이후 방송 세션 후보가 됩니다. 이용자별 추천 한도는 최근 24시간 동안 5개입니다.

## 진입 경로

- 교사: 상단 📡 버튼 또는 `/live-quiz`
- 학생: 놀이보드의 **오늘의 라이브 퀴즈** 카드 또는 `/student/live-quiz`
- 운영자: 라이브 화면의 검수 버튼 또는 `/admin/live-quiz`

## API

- `GET /api/live-quiz/state`: 현재 서버 시각, 세션·문항 단계, 본인 점수 및 답변 상태
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

세 테이블은 교사/학생 다형 참가자 키와 고정 JSON 문항 목록을 사용하므로 현재 런타임에서는 Prisma의 매개변수화된 raw SQL API로 접근합니다. 새 마이그레이션은 배포 전에 `npm run db:migrate`로 적용해야 합니다.
