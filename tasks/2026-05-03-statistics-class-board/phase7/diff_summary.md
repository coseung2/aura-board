# Phase 7 — Coder 산출물

## diff_summary.md

### 데이터베이스
- **prisma/schema.prisma**: `Mission` 모델 + `MissionStatus` enum 추가. `Section` 관계에 `missions` 연결.
- **prisma/migrations/20260503_add_mission_table/migration.sql**: 신규 마이그레이션 (이전 세션에서 생성됨)

### API 엔드포인트 (7개)
- **GET /api/sections/[sectionId]/missions**: 팀별 11개 미션 목록 + 자동 시딩
- **GET /api/sections/[sectionId]/missions/[step]**: 특정 미션 조회
- **PATCH /api/sections/[sectionId]/missions/[step]**: content 수정 + 낙관적 잠금(version)
- **POST /api/sections/[sectionId]/missions/[step]/submit**: 승인 요청
- **POST /api/sections/[sectionId]/missions/[step]/approve**: 교사 승인 + 다음 미션 잠금 해제
- **POST /api/sections/[sectionId]/missions/[step]/reject**: 교사 반려 + feedback
- **POST /api/sections/[sectionId]/missions/[step]/llm-feedback**: AI 피드백 요청 (5초 타임아웃, 모든 provider 지원)
- **GET /api/boards/[boardId]/missions/dashboard**: 교사용 대시보드 (팀별 진행 + 승인 대기 목록)

### 프론트엔드 컴포넌트
- **StatisticsBoardClient**: 메인 클라이언트 컴포넌트 (학생/교사 분기)
- **MissionStepper**: 수직 스텝퍼 (11단계, 상태 뱃지, 잠금 처리)
- **MissionPanel**: 현재 미션 패널 (저장/제출/상태 표시)
- **QuestionLadderAccordion**: 질문 사다리 6단계 아코디언 + AI 조언 버튼
- **TeacherDashboard**: 교사 대시보드 (3초 폴평, 승인/반려 액션, 팀별 진행 표)

### 스타일
- **src/styles/statistics.css**: statistics 전용 CSS (사이드바, 스텝퍼, 패널, 아코디언, 버튼, 반응형, 교사 대시보드)
- **src/app/globals.css**: `@import "statistics.css"` 추가

### 기존 코드 수정
- **src/app/board/[id]/page.tsx**: `layout === "statistics"` 분기 + `StatisticsBoardClient` 렌더링
- **src/components/CreateBoardModal.tsx**: layout 피커에 "statistics" 옵션 추가
- **src/lib/layout-meta.ts**: 이미 "statistics" 포함됨 (이전 세션)
- **src/app/api/boards/route.ts**: 이미 "statistics" 처리됨 (이전 세션)

### 스키마/타입
- **src/lib/statistics/schemas.ts**: Zod 스키마 (MissionContent, QuestionLadder, Patch/Submit/Approve/Reject 스키마)

### 테스트
- **src/lib/statistics/statistics.vitest.ts**: Zod 스키마 단위 테스트

### 핵심 변경 요약
이번 세션에서는 API 타입 에러 수정(getCurrentUser/getCurrentStudent 패턴 적용), 누락된 3개 API(reject/llm-feedback/dashboard) 구현, 교사 대시보드 컴포넌트 구현, CreateBoardModal 연동, Zod 스키마 단위 테스트 추가를 완료했다. 이전 세션에서 작성된 Prisma 스키마/컴포넌트/CSS와 결합하여 feature의 핵심 기능이 모두 구현되었다.
