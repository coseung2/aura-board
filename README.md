# Aura-board

나만의 Aura-board 웹앱. 실시간 협업 보드 + 카드 기반 콘텐츠 + 드래그앤드롭 레이아웃. 솔로 프로젝트.

> **MVP 상태**: Notion 테마 확정 (2026-04-10). 인증/권한 체계는 레거시(`owner/editor/viewer`)에서 3개 Identity(teacher/parent/student)로 이전 중.

---

## 빠르게 돌려보기

```bash
npm install           # 의존성 설치 + prisma generate
npm run db:push       # SQLite 스키마 생성 (prisma/dev.db)
npm run seed          # 3 users + 데모 보드 + 카드 12개
npm run dev           # http://localhost:3000
```

첫 방문 시 `/board/demo`로 리디렉트됩니다.

## 카드에 붙일 수 있는 콘텐츠

- 이미지 (업로드 또는 URL)
- 일반 링크 (OG 메타 프리뷰)
- YouTube URL → iframe 임베드
- **Canva 디자인 URL → 라이브 iframe 임베드** (공개 디자인. 비공개는 일반 링크 프리뷰로 폴백)

향후 Google Slides / Docs / Sheets, Figma, Notion, Desmos, GeoGebra 등 임베드는 `tasks/2026-04-12-embed-research/findings.md` 에 후보로 보관.

### 인증 방식

셋 중 하나로 로그인:
- 👩‍🏫 **교사** — Google OAuth (NextAuth)
- 👦 **학생** — QR/코드 → HMAC 서명 쿠키
- 👪 **학부모** — 매직 링크 → 랜덤 토큰 쿠키

> 한 브라우저가 여러 세션을 동시에 가질 수 있음 (교사+학부모 등). `resolveIdentities()`가 모든 신원을 취합.

---

## 프로젝트 구조

```
padlet/
├── CLAUDE.md                   # 에이전트 하네스 루트 오케스트레이션
├── _handoff.md                 # 기획 단계 핸드오프 노트
├── prompts/                    # 에이전트 계약서 (feature / incident / research)
├── tasks/                      # 작업 단위 산출물 (감사 이력)
│   └── 2026-04-09-initial-padlet-app/   # ← 현재 task
├── prisma/
│   ├── schema.prisma           # User / Board / BoardMember / Card
│   └── seed.ts                 # 멱등 시드 스크립트
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # → /board/demo
│   │   ├── globals.css         # Notion 테마 토큰 시스템
│   │   ├── board/[id]/page.tsx # board view (server component)
│   │   └── api/
│   │       ├── boards/[id]/route.ts
│   │       ├── cards/route.ts  (POST)
│   │       └── cards/[id]/route.ts (PATCH, DELETE)
│   ├── components/
│   │   ├── BoardCanvas.tsx     # dnd-kit 래퍼
│   │   ├── DraggableCard.tsx
│   │   ├── AddCardButton.tsx
│   │   └── UserSwitcher.tsx
│   ├── lib/                     # 인증/권한/prisma 유틸
│   ├── styles/
│   │   └── plant.css
│   └── proxy.ts                # Next.js 16 request proxy
├── .env                        # DATABASE_URL
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 기술 스택 (phase3 architect가 확정)

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 App Router |
| 런타임 | Node.js 24 |
| DB | SQLite (Prisma) — Postgres 호환 스키마 |
| ORM | Prisma 6 |
| UI | 순수 CSS + CSS 변수 (Tailwind 없음) |
| 드래그 | @dnd-kit/core |
| 검증 | zod |
| 디자인 | Notion-inspired (warm neutrals, whisper border, soft shadows) |

**Postgres 이행**: `prisma/schema.prisma`의 `provider = "sqlite"` → `"postgresql"` + `DATABASE_URL` 교체 + `prisma db push --force-reset`. 스키마는 `@db.*` 타입 어노테이션을 쓰지 않아 호환됨.

---

## RBAC 규칙

레거시 `BoardMember(owner/editor/viewer)`에서 **Identity 기반(`card-permissions.ts`)** 으로 이전 중. 현재는 둘 다 사용.

| Action | 교사 | 학생 | 학부모 |
|---|---|---|---|
| 보드/카드 보기 | ✅ | ✅ | ✅ (자녀만) |
| 카드 생성/편집 | ✅ | ✅ (자기 카드만) | ❌ |
| 카드 삭제 | ✅ | ✅ (자기 카드만) | ❌ |

> 자세한 권한 로직은 `src/lib/card-permissions.ts` 참조.

---

## 개발 명령

```bash
npm run dev         # Next.js dev server
npm run build       # 프로덕션 빌드
npm run start       # 프로덕션 서버
npm run typecheck   # tsc --noEmit
npm run db:push     # Prisma 스키마 → SQLite 반영
npm run db:reset    # DB 초기화 (주의: 데이터 삭제)
npm run seed        # 시드 재실행 (멱등)
```

---

## 에이전트 하네스

이 저장소는 Claude Code 기반 **에이전트 하네스**로 개발됩니다. 작업은 세 파이프라인 중 하나로 분기:

- `feature` — 새 기능/화면 추가 → `prompts/feature/_index.md`
- `incident` — 버그/사고 대응 → `prompts/incident/_index.md`
- `research` — 기술/UX 탐색 → `prompts/research/_index.md`

각 phase 파일에는 역할, 입력/출력 계약, 사용할 gstack 스킬이 명시되어 있습니다. 오케스트레이션 규약은 `CLAUDE.md` 참조.

---

## 다음 단계

1. phase8 (code_reviewer) — staff engineer 리뷰 + 보안 체크
2. phase9 (qa_tester) — 실제 브라우저 e2e + 수용 기준 매트릭스
3. phase11 (doc_syncer) — docs/architecture.md 초기 작성
4. (별도 feature task) 카드 inline 편집 UI
5. (별도 research task) 실시간 동기화 방식 결정 (Liveblocks vs Yjs)
6. (별도 feature task) 실제 인증 (NextAuth/Clerk) 도입
7. (선택) Docker Desktop 활성 시 Postgres 이행
