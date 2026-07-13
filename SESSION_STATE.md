# Session State — 2026-04-22 (evening, 4-commit pipeline)

> 원격 세션에서 이어갈 때 **가장 먼저** 이 파일을 읽어 현재 상태를 파악한다.

## 현재 HEAD: `96a5d65` — Vercel prod 배포 중 (3/3 commit)

배포 URL: `https://aura-board.com` (리전 icn1)

## 4-커밋 파이프라인 (2026-04-22 저녁)

| # | Hash | Phase | 내용 |
|---|---|---|---|
| 1 | `00c7515` | Phase 0 정리·기반 | LAYOUT_META single source + 4 소비처 import 전환 |
| 2 | `92f53dd` | Phase 1+2 배치 | Board.updatedAt, vibe 모더레이션/설정, billing cron/refund/webhook, Pro async, ClassroomDetail dead code |
| 3 | `96a5d65` | Phase 3 보안 | Upstash rate limit, postMessage origin, Slack 알림, 토큰 회전 admin, audit log, sandbox DNS 지시서 |
| 4 | (다음) | Phase 4 문서 | SESSION_STATE 갱신 (이 파일) |

## 동작하는 것 (배포 완료 시점 기준)

### 🎓 코딩 교실 (Vibe Arcade)
- 교사가 보드 생성 후 "💻 코딩 교실 열기" 버튼으로 즉시 활성화
- 📝 모더레이션 패널: 승인 대기/승인됨/거부됨/신고됨/숨김 탭별 관리 + 탭별 count
- ⚙ 설정 패널: 쿼터·모더레이션 정책·리뷰 표시 옵션 교사가 직접 조정
- 학생 프롬프트: 서버 프록시로 교사 저장 Claude/OpenAI/Gemini/Ollama 키 호출
- 학생당 분당 30회 레이트리밋 (Upstash / in-memory fallback)

### 💳 결제 (Toss Payments 빌링키)
- `/billing` 페이지: 구독 상태 + Pro 월/연 결제 + 취소
- `/billing/callback` → `/api/billing/confirm` → 빌링키 발급 + 첫 결제
- 빌링키 AES-256-GCM 암호화 저장 (LLM_KEY_SECRET 파생)
- **신규**: `/api/cron/billing-renew` (매일 UTC 18:00 자동 갱신)
- **신규**: `/api/billing/refund` (전액/부분 환불 + 전액 시 즉시 free 다운그레이드)
- **강화**: `/api/billing/webhook/toss` HMAC 서명 선택 검증 + timingSafeEqual

### 🏫 교사 UI
- `/teacher/settings` 허브 (🤖 AI / 🎨 Canva / 💳 결제 세 섹션)
- `/classroom/[id]/boards` 독립 페이지 (연결된 보드 그리드 + picker + 🟢 새 활동 뱃지)
- ClassroomNav 5탭 (학생/보드/역할/은행/매점)
- 🟢 새 활동 뱃지가 이제 실제 `Board.updatedAt` 반영

### 🔐 보안 하드닝
- `AuditEvent` 테이블 + `logAudit()` 헬퍼 — billing refund, moderation, admin rotate 자동 기록
- Slack 알림 (`SLACK_WEBHOOK_URL` 설정 시): webhook orphan, billing renew 실패, token rotation
- `/api/admin/rotate-tokens` 4-scope: classroom 학생 세션 / OAuth refresh / Canva Connect
- VibePlayModal postMessage origin 검증 (self + `NEXT_PUBLIC_VIBE_SANDBOX_ORIGIN` 만)
- sandbox DNS 분리 수동 작업 지시서 (`tasks/2026-04-22-sandbox-dns/steps.md`)

## 필요한 Vercel 환경 변수

| 키 | 필요도 | 용도 |
|---|---|---|
| `AUTH_SECRET` | 필수 | NextAuth |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 필수 | Google OAuth |
| `DATABASE_URL` / `DIRECT_URL` | 필수 | Supabase |
| `LLM_KEY_SECRET` | 권장 | LLM Key + 빌링키 암호화 마스터 (32+자 랜덤, 없으면 AUTH_SECRET fallback) |
| `TOSS_CLIENT_KEY` | 결제 활성 | 없으면 `/billing` 버튼 disable |
| `TOSS_SECRET_KEY` | 결제 활성 | 서버 전용 |
| `TOSS_WEBHOOK_SECRET` | 결제 활성 | 웹훅 `?secret=` 쿼리 대조 |
| `TOSS_WEBHOOK_SIGNING_SECRET` | 선택 | HMAC 서명 검증 (Toss 콘솔 설정 시) |
| `CRON_SECRET` | 갱신 cron | Vercel Cron 호출 인증 |
| `ADMIN_API_SECRET` | 토큰 회전 | `/api/admin/rotate-tokens` bearer |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | 레이트리밋 | 없으면 in-memory fallback |
| `RL_FAIL_MODE` | 선택 | `close` = Upstash 장애 시 429 (기본 open) |
| `SLACK_WEBHOOK_URL` | 선택 | 이상징후 알림. 없으면 noop |
| `NEXT_PUBLIC_VIBE_SANDBOX_ORIGIN` | 선택 | sandbox 서브도메인 분리 후 |
| `CLAUDE_MODEL_ID` / `OPENAI_MODEL_ID` / `GEMINI_MODEL_ID` | 선택 | 모델 override |

## 수동 작업 대기

1. ~~원격 브랜치 `feat/vibe-coding-arcade` 삭제~~ → 완료
2. `sandbox.aura-board.app` Vercel 도메인 추가 + DNS CNAME (tasks/2026-04-22-sandbox-dns/steps.md)
3. Canva Connect end-to-end 검증 (본인 Canva 계정으로 /teacher/settings#canva)
4. Toss Payments 프로덕션 키 발급 + Vercel env 추가 + 웹훅 등록 (/docs/billing-setup)

## ⚠️ 중대 기술 부채 (별도 task 착수 필요)

- **역할 모델 완전 제거** — `tasks/2026-04-22-role-model-full-cleanup/README.md`
  · 레거시 `owner/editor/viewer` 가 42개 파일·DB 컬럼에 잔존
  · 새 identity 모델(`teacher/student/parent`)이 `card-permissions.ts`
    + `identity.ts` 로 병존 중
  · 본 세션에서는 학생 뱃지 `· viewer` 숨김(옵션 A)만 임시 적용
  · 전면 제거는 Phase 1-4 단계 구성. 예상 수 시간 ~ 하루

## 다음에 할 수 있는 작업 (우선순위)

### 즉시 가능 (코드 기반 모두 있음, 설정만 필요)
- Toss 테스트 키로 첫 결제 플로우 end-to-end 검증 → 실키 전환
- Upstash Redis 연결 → Vercel env 추가 → 레이트리밋 Redis 모드 전환
- Slack incoming webhook 생성 → `SLACK_WEBHOOK_URL` 추가

### 코드 추가 필요
- iframe src에 `NEXT_PUBLIC_VIBE_SANDBOX_ORIGIN` 적용 (현재 postMessage origin만 준비됨)
- `next.config.ts` 에 sandbox 라우트 `frame-ancestors` CSP 헤더
- 더 많은 AuditEvent 커버리지 (board.delete, role.grant, student.add, classroom.delete 등)
- `/api/admin/audit-events` 조회 엔드포인트 (관리자 UI용)

### 중기
- Vibe Phase 3 세부: 교사 모더레이션 패널에 미리보기 iframe 내장 (현재 새 탭)
- 모더레이션 flagCount 임계 초과 자동 hidden 로직
- 학생 `sessionVersion` 기반 쿠키 무효화 실제 경로 (현재 admin API만 있음)
- Pro 구독 3일 만료 임박 알림 이메일

## 원격 재개 스니펫

```bash
cd ~/padlet
git fetch origin && git pull origin main --ff-only
npx prisma generate
npx prisma migrate deploy   # 20260422_board_updated_at + audit_event 2건
npm run dev
```

상태 확인:
```bash
git log --oneline -5   # 최신이 96a5d65 (또는 본 커밋)
npx tsc --noEmit       # 0 errors
npm run build          # prod build 성공
```

## Next.js 16 App Router 주의사항

- `useSearchParams()` 는 반드시 `<Suspense>` 경계 안. 놓치면 dev는 통과하고 prod build만 실패 (c574404 사례)
- 서버 컴포넌트에서 `await` 필요한 곳은 async 함수로. `isProTierAsync` 같은 variant를 제공
- Prisma generate EPERM on Windows: 실행 중인 dev 서버가 DLL을 잡고 있으면 발생. node 프로세스 kill 후 재시도

## 오늘 세션 통계

- **총 커밋**: 4건 (chore + feat batch + feat security + docs)
- **추가 코드**: ~2,500줄 (신규 lib/components/routes)
- **삭제 코드**: ~680줄 (dead JSX + CSS)
- **새 Prisma 모델**: 1개 (AuditEvent)
- **새 마이그레이션**: 2건 (board_updated_at + audit_event)
- **새 API 라우트**: 4개 (cron/billing-renew, billing/refund, vibe/moderation, admin/rotate-tokens)
- **수정 API 라우트**: 15개 (board touch + rate limit + audit hooks)
- **새 UI 컴포넌트**: 3개 (TeacherModerationPanel, VibeSettingsPanel, ClassroomBoardsTab)
