# Aura Board surfaces — route inventory for flow audits

Counts below are generated from the tree, not from memory:

```bash
find src/app -name 'page.tsx' | wc -l          # 94
find apps/mobile/app -name '*.tsx' | wc -l     # 47 route files (4 layouts + 43 screens)
```

Every route is listed as a literal path so an audit can be checked against this file
mechanically: if a report names a surface, `grep` for the exact path before trusting the
finding. When the tree changes, regenerate this section in the same change.

## Personas and their primary surfaces

| Persona | Web entry | Mobile |
|---|---|---|
| 교사 (class owner/editor) | `/dashboard`, `/classroom/[id]/*`, `/board/[id]/*`, `/teacher/*` | — |
| 학생 | `/b/[slug]`, `/student/*`, `/quiz/[code]` | `app/(student)/*` |
| 학부모 | `/parent/(app)/*`, `/parent/onboard/*` | `app/(parent)/*` |
| 관리자 | `/admin/*` | — |
| 공개 · 익명 | `/`, `/landing`, `/s/[shortCode]`, `/share/[shareToken]`, `/privacy`, `/terms`, `/support`, `/qr/invalid` | — |

Cost model note: teacher surfaces are dense desktop management screens; student surfaces
are the most constrained (mobile-first, often QR or short-link entry, sometimes anonymous).
Score each persona separately — a step that is legitimate for a teacher is frequently
excise for a student.

## Web routes (94)


### 교사 · 학급 관리 (21)

```
/classroom
/classroom/[id]
/classroom/[id]/assignments
/classroom/[id]/bank
/classroom/[id]/boards
/classroom/[id]/check
/classroom/[id]/cleaning
/classroom/[id]/daily-banners
/classroom/[id]/dashboard
/classroom/[id]/groups
/classroom/[id]/morning
/classroom/[id]/parent-access
/classroom/[id]/pay
/classroom/[id]/plant-matrix
/classroom/[id]/portfolio
/classroom/[id]/reading
/classroom/[id]/roles
/classroom/[id]/shoes
/classroom/[id]/store
/classroom/[id]/students
/classroom/[id]/walking
```


### 보드 (10)

```
/board/[id]
/board/[id]/agent
/board/[id]/archive
/board/[id]/play/[projectId]
/board/[id]/play/kordle
/board/[id]/project/[projectId]
/board/[id]/s/[sectionId]
/board/[id]/s/[sectionId]/share
/board/[id]/student/[studentId]
/board/[id]/vibe-arcade/studio
```


### 학생 (17)

```
/b/[slug]
/b/[slug]/select
/student
/student/aura-pet
/student/aura-pet/classroom
/student/boards
/student/canva-pair
/student/canva-return
/student/feed
/student/hidden-content
/student/live-quiz
/student/login
/student/logout
/student/portfolio
/student/reading
/student/self-directed
/student/walking
```


### 학부모 (12)

```
/parent/(app)/account
/parent/(app)/account/withdraw
/parent/(app)/feed
/parent/(app)/home
/parent/(app)/notifications
/parent/(app)/walking
/parent/join
/parent/onboard/match/code
/parent/onboard/match/select
/parent/onboard/pending
/parent/onboard/rejected
/parent/onboard/signup
```


### 관리자 (10)

```
/admin
/admin/activity
/admin/aura-pet
/admin/creatures
/admin/daily-banners
/admin/errors
/admin/feed
/admin/live-quiz
/admin/shop
/admin/usage
```


### 교사 전역 · 공개 · 설정 (24)

```
/
/billing
/billing/callback
/dashboard
/design
/docs/billing-setup
/docs/canva-setup
/landing
/live-quiz
/login
/my/wallet
/oauth/authorize
/privacy
/qr/invalid
/quiz/[code]
/s/[shortCode]
/share/[shareToken]
/support
/teacher/feed
/teacher/library
/teacher/settings
/teacher/share
/teacher/share/[id]
/terms
```

## Mobile routes — `apps/mobile/app/**` (43 screens + 4 layouts)

```
# 학생 (28)
app/(student)/index.tsx                          홈
app/(student)/boards.tsx
app/(student)/board/[slug].tsx
app/(student)/board/[slug]/compose.tsx
app/(student)/board/[slug]/submit.tsx
app/(student)/feed.tsx
app/(student)/feed/[id]/comments.tsx
app/(student)/feed/compose.tsx
app/(student)/feed/edit.tsx
app/(student)/notifications.tsx
app/(student)/card/[id]/comments.tsx
app/(student)/portfolio.tsx
app/(student)/reading/index.tsx
app/(student)/reading/compose.tsx
app/(student)/walking.tsx
app/(student)/cleaning.tsx
app/(student)/check.tsx
app/(student)/shoes.tsx
app/(student)/slime.tsx
app/(student)/pay.tsx
app/(student)/bank.tsx
app/(student)/wallet.tsx
app/(student)/plant/[id]/compose.tsx
app/(student)/daily-banner/compose.tsx
app/(student)/daily-banner-submit.tsx
app/(student)/canva.tsx
app/(student)/hidden-content.tsx
app/(student)/more.tsx

# 학부모 (9)
app/(parent)/index.tsx
app/(parent)/home.tsx
app/(parent)/account.tsx
app/(parent)/child/[id].tsx
app/(parent)/link-child.tsx
app/(parent)/notifications.tsx
app/(parent)/reading.tsx
app/(parent)/walking.tsx
app/(parent)/dev-preview.tsx

# 진입 · 인증 (6)
app/index.tsx
app/login.tsx
app/welcome.tsx
app/parent/auth/callback.tsx
app/parent/auth/callback/error/[error].tsx
app/parent/auth/callback/token/[token].tsx

# 레이아웃 (4)
app/_layout.tsx
app/(student)/_layout.tsx
app/(student)/reading/_layout.tsx
app/(parent)/_layout.tsx
```

Parity: several flows exist on both surfaces (feed, walking, reading, notifications, board
submission, wallet/pay). When an audit touches one, state explicitly whether the other was
measured — the repository treats web/mobile parity as a product requirement.

## Booting the app for a walk

- Web only: `infisical run --env=dev -- npm run dev`
- Web + Expo: `.codex\scripts\start-dev-servers.ps1`
- Song-guess/live-quiz gameplay additionally needs the Rust play-engine (order and scripts:
  `docs/authoritative-play-platform.md#local-development`); those routes answer 503 without it.
- A plain `npm run dev` is **not** a database-backed app — configuration-related 500s are
  expected and are not UX findings.
- Verification source of truth before and after any change:
  `docs/verification-checklist.md`.

## Candidate flows worth scoring (not yet measured)

Candidates only — no numbers exist for them. Measuring one means walking it and recording
the `klm_score.py` invocation, exactly as `SKILL.md` requires.

- **교사**: 학급 홈 → 개별 관리 화면(청소/걷기/독서/신발 등) 진입 후 기록 저장. 20개가 넘는
  관리 화면이 형제로 나열돼 있어 진입 비용이 반복된다.
- **학생**: `/b/[slug]` 또는 QR → 대상 선택 → 제출. 익명/QR 경로는 세션·식별 단계가
  끼어들 여지가 크다.
- **학부모**: `/parent/onboard/*` 6단계(참여 → 가입 → 코드 → 선택 → 대기 → 반려). 각 단계가
  서버 대기 상태인지 사용자 결정인지 구분이 필요하다.
- **공용**: 결제·지급(`/classroom/[id]/pay`, `/student/pay`, `/my/wallet`, mobile wallet)과
  라이브 퀴즈 참가 — 두 표면을 각각 채점한다.
