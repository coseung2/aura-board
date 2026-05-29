# 🔬 karpathy-compact 분석 리포트: aura-board

**분석일:** 2026-05-28  
**분석자:** OWL (karpathy-compact 코드 품질 분석 에이전트)  
**대상 프로젝트:** aura-board (Next.js + TypeScript Aura 보드 시스템)  
**코드 범위:** `src/app/api/` (API Routes), `src/features/`, `src/lib/`, `src/components/`

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프레임워크** | Next.js 16 + React 19 + TypeScript 5 |
| **DB/ORM** | Prisma 6 + Vercel Blob + Upstash Redis |
| **인증** | NextAuth 5 (beta) + 학생 HMAC + 부모 세션 |
| **파일 수** | 소스 600+ 파일 (src/ 기준) |
| **테스트** | Vitest 24 파일 (lib 레벨 위주), tsx 러너 일부 |
| **상용 기능** | 보드, 반 관리, 과제, 평가, 퀴즈, 포트폴리오, 부모 포털, 결제, 음악(DJ), 드로잉, AI 피드백, 놀이터(Vibe Arcade) |

---

## Karpathy 6원칙 분석

### 1. Orient (방향 설정) — 코드가 무엇을 하는지 즉시 이해 가능한가?

**평가: A-**

**강점:**
- **주석이 뛰어남.** `assignment-state.ts`는 상태 머신의 목적, 교사/학생 전이 규칙, API 계층과의 역할 분담을 상단 독스트링으로 명확히 설명함
- **card-permissions.ts**는 왜 레거시 Role 모델이 폐기되었는지, 멀티 아이덴티티가 왜 필요한지를 설계 동기부터 설명
- **portfolio-acl-pure.ts**와 **portfolio-acl.ts**의 분리 — "I/O 없는 pure 함수" vs "세션 resolving" 책임 분리가 주석으로 명시
- **rate-limit.ts**의 3축 슬라이딩 윈도우 설계가 상단에 표 형태로 정리됨
- 파일 헤더에 설계 계약(부모-자식 스키마 불변, 응답 envelope 불변 등)이 명시된 사례가 다수 (DrawingStudio 등)

**약점:**
- **ColumnsBoard.tsx (825줄)** — 하나의 컴포넌트 파일에 카드 CRUD, 섹션 재정렬, Canva 임포트/익스포트, 드래그앤드롭 동기화, 정렬 모드 저장, AI 피드백 트리거 등 6개 이상의 관심사가 혼재. 헤더만 읽으면 "컬럼 보드"인 줄 알겠지만 안에 들어가면 Canva/DJ/백업/정렬 등의 부수 로직이 뒤엉킴
- **ClassroomDetail.tsx (555줄)** — 탭 전환, 역할 관리, 학생 명단, 은행, 상점 등이 하나의 파일
- API route 파일 중 일부에서 핵심 비즈니스 로직(Zod 검증 → 인증 → Canva/oEmbed enrichment → DB 트랜잭션 → 응답 매핑)이 300줄 이상의 POST 핸들러에 선형적으로 배치되어 있어, 전체 흐름을 한눈에 파악하기 어려움 (route.ts POST)

**근거 파일:**
- `src/lib/assignment-state.ts` (142줄, 깔끔한 구조)
- `src/components/ColumnsBoard.tsx` (825줄, 과도한 책임)
- `src/app/api/cards/route.ts` (311줄 POST 핸들러)

---

### 2. Simplify (단순화) — 불필요한 복잡성이 없는가?

**평가: B+**

**강점:**
- **card-permissions.ts의 Identity × Ownership 순수 함수 설계** — `isBoardReader`, `canViewCard`, `canEditCard`, `canDeleteCard`, `canAddCardToBoard`가 모두 I/O 없는 순수 함수로, 동일한 타입에 대해 일관된 패턴(true/false 반환). 테스트하기 극도로 쉬움
- **assignment-state.ts의 상태 머신** — `computeTeacherTransition`, `computeStudentSubmit`, `canStudentSubmit`의 분리가 깔끔. 각 함수가 하나의 전이 책임만 짐
- **assessment-grading.ts** — MCQ/SHORT  채점이 66줄의 결정적 함수로 간결하게 구현
- **realtime.ts** — 채널 키 헬퍼가 인라인 검증(`if (!boardId) throw`)을 포함하여 방어적으로 설계되면서도 복잡하지 않음
- `IframeLRU` 클래스가 단 61줄로 캡 기반 제거 로직을 깔끔하게 캡슐화

**약점:**
- **RBAC의 이중 구조** — `rbac.ts` (레거시 Role 기반) + `card-permissions.ts` (신규 Identity 기반)가 공존. 레거시 모듈에 `@deprecated` 표시와 이유가 명시되어 있고 마이그레이션 전략도 주석에 있으나, 두 시스템이 혼재된 것 자체가 인지 부하를 만듦
- **rate-limit.ts에서 정의한 PERMISSIONS 매트릭스**가 이미 `card-permissions.ts`의 순수 함수로 대체되는 중이나, `requirePermission`이 아직 17개 호출처에서 사용 중 (rbac.ts 모듈 헤더 주석에서 확인)
- **ColumnsBoard.tsx**의 825줄에서 동일한 패턴(`fetch → optimistic update → rollback on failure`)이 `moveCard`, `moveSectionTo`, `handleAdd`, `handleEditCard`, `handleDuplicateCard`에서 반복. 이를 재사용 가능한 `useMutation` 훫으로 추상화하면 40~50% 줄일 수 있을 것으로 보임
- **useBoardStream.ts**의 `sortSections` 함수가 `ColumnsBoard.tsx`의 `sortSections`와 중복 정의됨 (동일 로직이 두 파일에 존재)

**근거 파일:**
- `src/lib/card-permissions.ts` (순수 함수, 218줄, 이상적인 구조)
- `src/lib/rbac.ts` (레거시 + 신규 이중 구조)
- `src/components/columns/useBoardStream.ts` (중복 sortSections)

---

### 3. Cut Surgically (정밀 절제) — 불필요한 코드를 정확히 제거했는가?

**평가: B**

**강점:**
- **@deprecated 마킷이 명확함** — `rbac.ts`의 Role/Action 타입과 `requirePermission`에 `@deprecated`와 함께 대체 경로(`card-permissions.ts`)가 주석으로 안내됨. 이것으로 IDE에서 deprecated 경고가 발생하므로 신규 호출 방지 가능
- **realtime.ts의 노오프(no-op) publish** — `_event` 언더스코어 파라미터, `// no-op until a realtime engine is adopted` 주석. 인터페이스를 깔끔하게 유지하면서 구현을 미루는 합리적 트레이드오프
- **ensureUpstash()의 lazy singleton** — Redis 연결이 필요 시점에만 초기화되며, 프로세스 시작 시점의 부작용이 없음
- **사업 로직의 I/O 분리** — `portfolio-acl-pure.ts`(순수)와 `portfolio-acl.ts`(I/O)의 분리가 잘 되어 있어, 테스트 시 DB 연결 없이 로직 검증 가능

**약점:**
- **`assignment-state.test.ts`가 Vitest가 아닌 커스텀 tsx 러너 사용** — `npx tsx src/lib/__tests__/assignment-state.test.ts` 방식. 같은 프로젝트의 다른 테스트들이 Vitest를 사용하므로, 이 파일만 별도의 러너를 유지하는 것은 불필요한 복잡성. 프로젝트 레벨의 `@deprecated` 대상
- **`__test__` export** — `rate-limit.ts`에서 `export const __test__ = { mem }`으로 내부 상태를 테스트용으로 노출. 프로덕션 코드에 테스트 전용 export가 포함되어 있음. `#if dev` 컨디셔널 export나 `vi.importActual`을 활용하는 것이 더 깔끔
- **`computeTeacherTransition`의 `switch`에서 `default` 분기 누락** — `input.transition`의 모든 케이스가 명시되어 있지만, `as BreakoutVisibilityMode` 캐스팅이 런타임에 실패했을 때의 방어가 약함 (279-281줄)
- **Legact `.test.ts` vs `.vitest.ts` 확장자 혼용** — `assignment-state.test.ts`, `blob-thumb.test.ts` 등이 tsx 러너 사용. 통일 필요

**근거 파일:**
- `src/lib/__tests__/assignment-state.test.ts` (커스텀 러너)
- `src/lib/rate-limit.ts:148` (__test__ export)
- `src/lib/realtime.ts:75-83` (no-op)

---

### 4. Preserve Guarantees (보장 유지) — 변경 시 기존 안전성이 유지되는가?

**평가: A-**

**강점:**
- **API route의 Zod 검증이 철저함** — `/api/cards/route.ts`에서 `CreateCardSchema`가 URL 형식, 길이, 첨부 수 제한까지 검증. 서비스 계층 진입 전에 입력이 방어됨
- **파일 화이트리스트 이중 검증** — `fileUrl`이 `/api/upload` 출처인지 스키마 레벨이 아니라 핸들러 레벨에서 추가 검증 (`isAllowedFileUrl`). Codex 리뷰 반영 사명이 주석에 명시되어 있어 왜 이중 검증인지 추적 가능
- **트랜잭션 경계가 명확함** — `db.$transaction`으로 Card 생성 + CardAuthor + CardAttachment가 원자적으로 커밋. 이후 `touchBoardUpdatedAt`만 best-effort로 분리 (트랜잭션 성공 후에도 실패 허용)
- **타입 가드와 스키마 분리 잘 됨** — `isRole(x)` 타입 가드, `asIdentities()` 레거시 리프트, `validateStudentName`의 결과 유니온 타입 등에서 컴파일 타임 안전성을 확보
- **timing-safe token 비교** — `rbac.ts`의 `timingSafeEqual`로 타이밍 채널 공격 방지
- **인증 우선순위가 명시적** — `getCurrentUser()` → `getCurrentStudent()` 폴백 순서가 주석으로 이유 설명 ("A leftover student_session cookie from prior testing must NOT hijack a teacher-initiated POST")

**약점:**
- **`computeTeacherTransition`에서 `break` 누락 없음은 좋으나**, 모든 transition에 대해 `default`가 없으므로 TypeScript의 exhaustive check가 작동하지 않음. `switch` 문에 `default` 분기에서 `never` 단언을 추가하면 컴파일 타임에 새로운 transition 타입 추가 놓치기를 방지할 수 있음
- **rollback 패턴이 수동적** — `handleDeleteCard`, `handleEditCard`, `setSortFor`에서 `const prev = [...cards]; ... setCards(prev)` 패턴이 반복. 실패 경계에서 rollback이 누락되면 클라이언트-서버 불일치 발생 가능. 트랜잭션 수준의 보장이 아니므로 경합 조건에 취약
- **`useBoardStream`의 304 폴링이 mount 시에만 1회** — 주석에서는 "one-time snapshot sync on mount"라고 명시. 이는 다른 탭/기기의 변경사항이 실시간 반영되지 않는다는 보장의 약화. 사용자 경험 트레이드오프로 보이나, "보장"의 관점에서는 약점

**근거 파일:**
- `src/app/api/cards/route.ts` (Zod + 화이트리스트 + 트랜잭션)
- `src/lib/assignment-state.ts` (상태 머신 완전성)
- `src/components/columns/useBoardStream.ts` (폴링 전략)

---

### 5. Verify (검증) — 코드가 올바른지 확인하는 테스트가 있는가?

**평가: B+**

**강점:**
- **24개 테스트 파일이 lib/ 레벨에 존재** — 핵심 비즈니스 로직(card-author, card-permissions, assessment-grading, assignment-state 등)에 대한 커버리지가 있음
- **assignment-state.test.ts가 훌륭한 패턴** — 상태 전이 행렬의 모든 분기를 체계적으로 테스트 (canStudentSubmit 7케이스, open/return/review/grade 각각 invalid 포함). `check()` 헬퍼로 assertion을 통일하여 가독성 확보
- **순수 함수가 많아 테스트하기 쉬운 구조** — card-permissions.ts, assessment-grading.ts, student-name.ts 등이 I/O 없는 순수 함수로 설계되어 단위 테스트가 용이
- **Zod 스키마 검증이 테스트 부담을 줄임** — 입력 타입 오류를 Zod가 캐치하므로 테스트가 비즈니스 로직에 집중 가능

**약점:**
- **UI 컴포넌트 테스트 부재** — ColumnsBoard(825줄), ClassroomDetail(555줄), DrawingStudio(460줄) 등 주요 컴포넌트에 대한 테스트가 없음. `@testing-library/react`가 devDependencies에 있으나 실제 컴포넌트 테스트 파일을 발견하지 못함
- **API route 통합 테스트 부재** — 24개 테스트가 모두 `src/lib/__tests__` 또는 `src/components/**/__tests__`에 있으며, API route 레벨의 테픽 테스트는 발견되지 않음
- **커스텀 tsx 러너와 Vitest의 이중화** — `assignment-state.test.ts`, `realtime.test.ts` 등 일부 파일이 Vitest가 아닌 `npx tsx` 러너 사용. CI 파이프라인(`npm run test` = `vitest run`)에서 이 파일들이 실행되지 않을 가능성
- **엣지 케이스 커버리지** — `rate-limit.ts`의 fail-open/fail-close 전환, 메모리 누수 (Map이 무한 성장), race condition에 대한 테스트가 부족해 보임

**근거 파일:**
- `src/lib/__tests__/` (24개 파일)
- `src/lib/__tests__/assignment-state.test.ts` (모범 사례)
- `package.json` scripts (test = vitest run)

---

### 6. Report Honestly (정직한 보고) — 코드가 자신의 한계를 명확히 드러내는가?

**평가: A-**

**강점:**
- **주석이 설계 결정의 "왜"를 설명함** — 단순히 "무엇"이 아니라 "왜 이렇게 했는지"를 기술. 예: DrawingStudio의 "parent seed + v1 계약 유지" 설명, cards/route.ts의 "codex 리뷰 반영: /api/upload 우회 stored-XSS 차단"
- **운영 환경 전제 조건을 명시** — `rate-limit.ts`에서 "Process-local, so not fit for multi-instance production — the platform env should provide Upstash to meet AC-06"라고 한계를 상단에 고지
- **deprecated + 대체 경로 안내** — `rbac.ts` 모듈 헤더에서 `@deprecated`와 "Do NOT add new callers; prefer resolveIdentity + the pure predicates"라고 명시
- **추상화 미비를 주석으로 표시** — `realtime.ts`에서 "The actual pub/sub engine (Supabase Realtime, PartyKit, Pusher, …) has not been chosen yet — that decision is deferred"라고 미완성을 정직하게 고지
- **Consensus를 명시** — `AGENTS.md`의 Frontend/Backend Audit Scope에서 P0/P1/P2 심각도 분류와 "confirmed bugs from residual risks" 구분을 지침으로 설정

**약점:**
- **성능 관려 한계가 문서화되지 않음** — ColumnsBoard가 825줄에 카드 수백 개를 클라이언트 상태로 관리하지만, 렌더링 성능 프로파일이나 최대 카드 수 제한에 대한 언급이 없음
- **useBoardStream의 polling이 의도적으로 "one-time on mount"로 제한**된 것은 주석으로 표시되나, 이는 실시간 동기화의 보장을 약화시키므로 "known limitation"으로 더 명시적 표기 필요
- **보안 관련: `tokensEqual`에서 length가 다르면 early return** 하는 것이 주석으로 설명되나, 이것이 timing-safe의 예외 조건임을 명확히 표기하면 더 좋겠음 (실제로는 buf 길이가 다르면 timingSafeEqual이 throw하므로 guard가 필요한 것이나, 이 "왜"가 초보자에게는 불명확)

**근거 파일:**
- `src/lib/rate-limit.ts:12-16` (운영 한계 명시)
- `src/lib/realtime.ts:4-11` (추상화 미비 고지)
- `src/lib/rbac.ts:11-16` (deprecated + 대체 경로)

---

## 종합 점수표

| # | 원칙 | 점수 | 핵심 근거 |
|---|------|------|-----------|
| 1 | **Orient** (방향 설정) | **A-** | 모듈 독스트링과 설계 동기 주석이 우수. 그러나 ColumnsBoard 825줄의 과도한 책임이 가독성 저하 |
| 2 | **Simplify** (단순화) | **B+** | card-permissions.ts의 순수 함수 설계가 모범적. RBAC 이중 구조와 반복 mutation 패턴이 불필요한 복잡성 유발 |
| 3 | **Cut Surgically** (정밀 절제) | **B** | @deprecated 마킷과 I/O 분리 잘 됨. 커스텀 테스트 러너 부리, __test__ export, sortSections 중복 등 제거 대상 존재 |
| 4 | **Preserve Guarantees** (보장 유지) | **A-** | Zod + 화이트리스트 이중 검증, 트랜잭션 경계, timing-safe 비교. 수동 rollback의 경합 조건 가능성은 잔여 리스크 |
| 5 | **Verify** (검증) | **B+** | 순수 함수 단위 테스트 충실. UI/API 통합 테스트 부재, 커스텀/Vitest 러너 이중화 |
| 6 | **Report Honestly** (정직한 보고) | **A-** | 한계와 설계 결정의 "Why"를 주석으로 명시하는 문화가 확립됨. 성능/SLA 관련 문서화는 개선 여지 |

### 종합 등급: **A-**

---

## 개선 제안 (우선순위별)

### 🔴 P0 — 즉시 조치 권장

1. **ColumnsBoard.tsx 분해 (825줄 → 5~7개 컴포넌트)**
   - `CardActions` (CRUD + 드래그앤드롭)
   - `SectionReorder` (섹션 드래그 + PATCH)
   - `CanvaIntegration` (임포트/익스포트)
   - `ColumnSortControl` (정렬 모드 저장)
   - `AiFeedbackTrigger`
   - **근거:** 하나의 파일에 6개 이상의 관심사가 혼재. "Simplify" 원칙 위반. 825줄은 A등급 컴포넌트 대비 5~8배 크기

2. **커스텀 tsx 테스트 러너를 Vitest로 통합**
   - `assignment-state.test.ts` 등 `.test.ts` 확장자 파일을 `.vitest.ts`로 마이그레이션
   - `check()` 헬퍼 패턴을 `expect()`로 변환
   - **근거:** CI에서 실행되지 않는 테스트는 "Verify" 원칙의 허점

### 🟡 P1 — 스프린트 내 조치 권장

3. **ColumnsBoard의 반복 mutation 패턴을 `useApiMutation` 훅으로 추상화**
   - `fetch → optimistic update → rollback on failure` 패턴이 5회 반복
   - 공통 훅: `function useApiMutation<T>(mutate, { onOptimistic, onRollback })`
   - **근거:** "Simplify" + "Cut Surgically" 동시 개선

4. **sortSections 함수 중복 제거**
   - `ColumnsBoard.tsx:26-31`과 `useBoardStream.ts:125-130`에 동일 로직 존재
   - `@/lib/sections.ts` 등 공통 위치로 추출
   - **근거:** DRY 위반, "Preserve Guarantees" 관점에서 불일치 리스크

5. **API route POST 핸들러를 Service 계층으로 분리**
   - `cards/route.ts`(311줄)의 POST 핸들러에서 Canva/oEmbed enrichment 로직 분리
   - `POST(req)` → `CardService.create(input, ctx)`로 단순화
   - **근거:** "Orient" 원칙 — route 파일은 입력/출력 매핑만 담당해야 핵심 로직 파악이 쉬움

### 🟢 P2 — 점진적 개선 권장

6. **UI 컴포넌트 테스트 도입**
   - `ClassroomDetail`, `ColumnsBoard`에 대한 최소 1~2개의 테스트 작성
   - `@testing-library/react`가 이미 설치되어 있으므로 인프라 비용 없음
   - **근부:** "Verify" 원칙 강화

7. **`__test__` export 패턴 정리**
   - `rate-limit.ts`의 `export const __test__` 제거
   - `vi.spyOn` 또는 DI 패턴으로 내부 상태 접근
   - **근거:** "Cut Surgically" — 프로덕션 번들에 테스트 전용 코드 포함 방지

8. **`switch` exhaustive check 추가**
   - `computeTeacherTransition`의 `switch`에 `default: const _exhaustive: never = input.transition; return _exhaustive;`
   - **근거:** "Preserve Guarantees" — 새로운 transition 타입 추가 시 컴파일 타임 에러

---

## 결론

aura-board 프로젝트는 **전반적으로 높은 코드 품질**을 보여줍니다. 특히:

- **순수 함수 우선 설계** (card-permissions, assignment-state, assessment-grading)가 Karpathy의 "Simplify"와 "Preserve Guarantees" 원칙을 잘 반영
- **주석 문화**가 뛰어나며, 코드의 한계와 설계 동기를 정직하게 드러냄 ("Report Honestly")
- **보안 인프라** (Zod + 화이트리스트 이중 검증, timing-safe 비교, 트랜잭션 경계)가 견고

주요 개선 포인트는 **대형 컴포넌트의 분해**와 **테스트 인프라의 통합**입니다. 825줄의 ColumnsBoard.tsx가 이 프로젝트의 가장 큰 기술 부채이며, 이를 분해하면 Orient/Simplify/Cut 세 원칙이 동시에 개선됩니다.

**종합 A-는 한국 EdTech 스타트업의 프로덕션 코드로서 매우 우수한 수준**입니다.

---

*본 리포트는 2026-05-28 기준 코드 스냅샷을 분석한 것입니다. 최신 커밋의 반영이 되어 있지 않을 수 있습니다.*
