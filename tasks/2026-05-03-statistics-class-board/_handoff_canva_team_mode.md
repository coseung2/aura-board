# 핸드오프: statistics-class-board → Canva 스타일 자율 팀 구성

## 현재 상태 (2026-05-03 세션 종료 시)

### 배포된 것
- 통계활용대회 보드 생성 가능 (layout="statistics")
- 11단계 미션 UI (학생용 사이드바 + 교사용 대시보드)
- API 7개 구현 완료
- **현재 팀 구성 방식: 보드 생성 시 section(팀) N개 자동 생성 → 교사가 학생 배정**

### 문제
- 교사 중심 팀 배정은 사용자 플로우에 맞지 않음
- 학생들이 직접 협업할 사람들을 초대하는 방식(Canva 스타일)으로 변경 필요

---

## 변경 방향: Canva 스타일 공동작업자 초대 모드

### 핵심 원칙
1. **보드 생성 시 section을 미리 생성하지 않음**
2. **학생이 직접 팀을 만들고 팀원을 초대**
3. **우상단 "+" 버튼 → 학생명부 검색 → 초대 → 수락**
4. **학생명부(board.classroomId → Student 테이블)와 작성자 태그 정보 활용**

---

## 구현 체크리스트

### 1. 보드 생성 API 수정 (`src/app/api/boards/route.ts`)
- [ ] statistics 보드 생성 시 **section 자동 생성 로직 제거**
- [ ] 현재: `for (let g = 1; g <= groupCount; g++) { tx.section.create(...) + tx.mission.createMany(...) }`
- [ ] 변경: section과 mission을 **아예 생성하지 않음** (학생이 팀 만들 때 생성)

### 2. 팀 만들기 API (신규)
- `POST /api/boards/[id]/teams`
- 기능:
  1. Section 생성 (`title`: 학생 이름 기반 또는 "팀 {studentName}")
  2. 11개 Mission row 자동 생성 (기존 `/api/sections/[id]/missions`의 시딩 로직 재활용)
  3. BreakoutMembership 생성 (요청 학생 → 해당 section)
- 응답: `{ sectionId, teamName }`

### 3. 팀원 초대 API (신규 또는 기존 수정)
- `POST /api/sections/[sectionId]/memberships` (이미 있음, 학생 권한 체크 추가)
- 수정사항:
  - 학생도 자신이 속한 팀의 sectionId에 대해 membership 추가 가능해야 함
  - 현재는 `getBoardRole`로 교사만 체크 → 학생 본인 소속 팀이면 허용
  - 한 학생은 하나의 section에만 속할 수 있음 (`@@unique([sectionId, studentId])`는 section당 하나, 학생당 여러 section은 가능하지만 **정책상 하나**로 제한)

### 4. 학생명부 조회 API (이미 있음, 재활용)
- `GET /api/boards/[id]/roster` 또는 dashboard API의 `roster` 필드
- 이미 구현됨: classroomId → Student.findMany

### 5. 프론트엔드 수정

#### 5-1. StatisticsBoardClient (`src/components/statistics/StatisticsBoardClient.tsx`)
- [ ] 학생이 팀이 없을 때: "팀 만들기" 버튼 표시 (기존 "아직 팀이 구성되지 않았습니다" 대체)
- [ ] 팀이 있을 때: 기존 미션 UI 표시
- [ ] 우상단 "+" 버튼 추가: `StatisticsTeamInviteButton` 컴포넌트

#### 5-2. StatisticsTeamInviteButton (신규)
- 위치: `src/components/statistics/StatisticsTeamInviteButton.tsx`
- UI:
  - 우상단 원형 "+" 버튼
  - 클릭 시 모달/드롭다운: 학생명부 리스트 + 검색 input
  - 학생 선택 → "초대" 버튼
  - POST `/api/sections/${sectionId}/memberships` 호출

#### 5-3. 팀원 표시
- MissionPanel 상단에 현재 팀원 목록 표시 (아바타 또는 이름)
- Canva 스타일: 작은 원형 아바타들을 가로로 나열

### 6. TeacherDashboard 수정
- [ ] "팀 구성" 버튼 제거 (또는 옵션으로 변경)
- [ ] 교사는 학생들의 팀 구성 현황만 조회 (팀 이름, 인원, 진행률)

### 7. DB 제약
- [ ] `BreakoutMembership.assignmentId`는 이미 optional로 변경됨
- [ ] `@@unique([sectionId, studentId])` 유지 → 한 학생이 같은 팀에 중복 배정 불가
- [ ] 학생당 하나의 팀만 허용하려면: 학생이 이미 다른 팀에 속해있는지 API에서 체크 필요

---

## 참조 파일

| 파일 | 설명 |
|---|---|
| `src/app/api/boards/route.ts` | 보드 생성 API (section 자동 생성 제거 대상) |
| `src/app/api/sections/[sectionId]/memberships/route.ts` | 팀원 배정 API (학생 권한 추가 필요) |
| `src/components/statistics/StatisticsBoardClient.tsx` | 학생 메인 컴포넌트 (팀 없음 상태 UI 변경) |
| `src/components/statistics/TeacherDashboard.tsx` | 교사 대시보드 (팀 구성 버튼 제거) |
| `prisma/schema.prisma` | `BreakoutMembership` 모델 (이미 optional assignmentId) |

---

## 기존 삭제/변경 대상

1. **`src/components/statistics/StatisticsTeamManager.tsx`** → 제거 또는 옵션으로 숨김
2. **`src/app/api/boards/[id]/missions/dashboard/route.ts`** → section + roster 반환 유지 (교사 조회용)
3. **`src/app/api/boards/route.ts` lines 266-330** → statistics section 자동 생성 로직 제거

---

## 와이어프레임

```
[학생 화면 - 팀 없음]
┌──────────────────────────────────────┐
│  📊 통계활용대회                      │
│                                      │
│      ┌─────────────────┐             │
│      │   팀 만들기     │             │
│      │   (+ 버튼)      │             │
│      └─────────────────┘             │
│                                      │
│  팀을 만들어 미션을 시작하세요!       │
└──────────────────────────────────────┘

[학생 화면 - 팀 있음]
┌──────────────────────────────────────┐
│  📊 통계활용대회        [+][김철수]  │  ← 우상단 + 버튼
│                                      │
│  [1 주제카드] [2 질문사다리] ...     │
│                                      │
│  팀원: 😀김철수 😀이영희 😀박민수    │  ← 팀원 아바타
│                                      │
│  [미션 내용...]                      │
└──────────────────────────────────────┘

[초대 모달]
┌────────────────────────┐
│  팀원 초대          [x] │
│  ┌──────────────────┐  │
│  │ 김...           ▼ │  │  ← 검색 + 드롭다운
│  └──────────────────┘  │
│  ┌────┐ ┌────┐        │
│  │김철수│ │이영희│ ...  │  ← 학생명부 리스트
│  └────┘ └────┘        │
│        [초대하기]       │
└────────────────────────┘
```
