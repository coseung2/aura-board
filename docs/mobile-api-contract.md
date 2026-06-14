# Mobile API Contract — Aura-board

Expo React Native 모바일 앱(student + parent)용 API 계약서.
교사/관리자는 기존 Next.js 웹 앱에 그대로 잔류.

> **Source of truth**: 이 문서는 2026-06-14 기준 코드 리뷰 결과.
> 코드 변경 시 본 문서를 동기화할 것.

---

## 1. MVP Scope Split

### 1.1 Student (MVP — Phase 1)

| Capability | Status | Notes |
|---|---|---|
| Code login (6-char) | ✅ live | `POST /api/student/auth` |
| Dashboard (my boards) | ✅ live | `GET /api/student/me` |
| Board detail (all layouts) | ✅ live | `GET /api/student/board/[slug]` |
| Card create | ✅ live | `POST /api/cards` (student identity) |
| Card edit/delete | ✅ live | `PATCH/DELETE /api/cards/[id]` (own cards) |
| File/image upload | ✅ live | `POST /api/upload` (Bearer token) |
| Like toggle | ✅ live | `POST /api/cards/[id]/like` |
| Comment CRUD | ✅ live | `GET/POST /api/cards/[id]/comments` |
| Engagement summary | ✅ live | `GET /api/cards/[id]/engagement` |
| Board snapshot | ✅ live | `GET /api/boards/[id]/snapshot` |
| Board SSE stream | ✅ live | `GET /api/boards/[id]/stream` |
| Logout | ✅ live | `POST /api/student/logout` |
| Portfolio (own cards) | ✅ live | `GET /api/student-portfolio/[studentId]` |

### 1.2 Parent (MVP — Phase 2)

| Capability | Status | Notes |
|---|---|---|
| OAuth login (Google/Kakao) | ⚠️ web-only | Cookie-based; needs Bearer token path for mobile |
| Email magic-link signup | ✅ mobile-ready | `POST /api/parent/signup` with `client: "mobile"`; callback handoff via `auraboard://` deep link (token in fragment). |
| Session status | ✅ mobile-ready | Bearer accepted by `getCurrentParent` since Phase 1. |
| Link child (code → select → request) | ⚠️ web-only | 3-step flow; needs mobile auth adapter |
| Children list | ✅ mobile-ready | `GET /api/parent/children` (Bearer accepted; active links only) |
| Child portfolio | ✅ live | `GET /api/parent/portfolio?childId=` |
| Child assignments | ✅ live | `GET /api/parent/children/[id]/assignments` |
| Child events | ✅ live | `GET /api/parent/children/[id]/events` |
| Child plant journal | ✅ live | `GET /api/parent/children/[id]/plant` |
| Child drawing library | ✅ live | `GET /api/parent/children/[id]/drawing` |
| Child breakout | ✅ live | `GET /api/parent/children/[id]/breakout` |
| Account withdraw | ⚠️ web-only | Cookie-based |
| Logout | ⚠️ web-only | Cookie-based |

---

## 2. Endpoint Inventory

### 2.1 Student Endpoints

#### POST /api/student/auth

- **Purpose**: 6자리 코드 로그인
- **Auth**: none (public)
- **Body**: `{ "token": "ABC123" }`
- **Response 200**:
  ```json
  {
    "success": true,
    "sessionToken": "<base64url.payload>.<base64url.hmac>",
    "redirect": "/student",
    "student": { "id": "cuid", "name": "홍길동", "classroomId": "cuid" }
  }
  ```
- **Errors**: 404 `invalid_token`, 429 rate-limited
- **Mobile note**: `sessionToken`을 `expo-secure-store`에 저장. 이후 모든 요청에 `Authorization: Bearer <sessionToken>` 첨부.

#### GET /api/student/me

- **Purpose**: 학생 프로필 + 학급 보드 목록
- **Auth**: `Authorization: Bearer <student-session-token>`
- **Response 200**:
  ```json
  {
    "student": {
      "id": "cuid",
      "name": "홍길동",
      "classroom": { "id": "cuid", "name": "3학년 2반" }
    },
    "boards": [
      {
        "id": "cuid",
        "slug": "abc123",
        "title": "자유 게시판",
        "layout": "freeform",
        "_count": { "cards": 42 },
        "quizzes": [{ "roomCode": "ABCDEF", "status": "active" }]
      }
    ]
  }
  ```
- **Errors**: 401 unauthorized

#### GET /api/student/board/[slug]

- **Purpose**: 보드 1개 상세 (layout-specific data 포함)
- **Auth**: `Authorization: Bearer <student-session-token>`
- **Params**: `slug` — board slug or board id
- **Response 200**:
  ```json
  {
    "board": { "id", "slug", "title", "layout", "description", "classroomId" },
    "cards": [ { /* BoardCard — see apps/mobile/lib/types.ts */ } ],
    "sections": [ { "id", "title", "order", "color" } ],
    "currentStudent": { "id", "name", "classroomId" },
    "layoutData": {
      "quiz?": { "room": { "id", "roomCode", "status", "title" } },
      "assignment?": { "slots": [ /* AssignmentSlot */ ] },
      "vibeArcade?": { "config", "projects" },
      "plantRoadmap?": { "plants" }
    }
  }
  ```
- **Errors**: 401, 404 not_found

#### POST /api/cards

- **Purpose**: 카드 생성
- **Auth**: teacher (NextAuth cookie) OR student (Bearer) OR share visitor (`x-share-token` header)
- **Body** (Zod):
  ```json
  {
    "boardId": "cuid",          // required
    "title": "최대 200자",
    "content": "최대 5000자",
    "color": "#fff",
    "imageUrl": "https://...",
    "linkUrl": "https://...",
    "videoUrl": "https://...",
    "fileUrl": "https://...",
    "fileName": "report.pdf",
    "fileSize": 12345,
    "fileMimeType": "application/pdf",
    "attachments": [
      { "kind": "image|video|file|link", "url": "https://...", "previewUrl": "...", "fileName": "...", "fileSize": 0, "mimeType": "..." }
    ],
    "x": 0, "y": 0, "width": 240, "height": 160,
    "order": 0,
    "sectionId": "cuid|null",
    "authors": [{ "studentId": "cuid|null", "displayName": "이름" }]
  }
  ```
- **Response 200**: `{ "card": { ...cardWithAttachmentsAndAuthors } }`
- **Errors**: 400, 401, 403
- **Mobile note**: 학생이 카드를 만들면 `studentAuthorId`가 자동 설정됨. `authors` 배열도 자동으로 1명 채움.

#### PATCH /api/cards/[id]

- **Purpose**: 카드 수정
- **Auth**: teacher OR card owner student OR share visitor
- **Body**: POST와 동일 스키마 (all fields optional)
- **Response 200**: `{ "card": { ...updatedCard } }`
- **Errors**: 400, 401, 403, 404

#### DELETE /api/cards/[id]

- **Purpose**: 카드 삭제
- **Auth**: teacher OR card owner student OR share visitor
- **Response 200**: `{ "ok": true }`
- **Errors**: 401, 403, 404

#### GET /api/cards/[id]/engagement

- **Purpose**: 카드별 통합 engagement 상태
- **Auth**: teacher OR student OR share visitor
- **Response 200**:
  ```json
  {
    "likeCount": 5,
    "commentCount": 3,
    "isLiked": true,
    "canInteract": true,
    "anonymousAuthor": false
  }
  ```
- **Note**: `canInteract`는 parent일 때 `false`. 학생/교사만 좋아요/댓글 가능.

#### POST /api/cards/[id]/like

- **Purpose**: 좋아요 토글
- **Auth**: teacher OR student (parent → 403)
- **Response 200**: `{ "liked": true|false, "count": 5 }`

#### GET /api/cards/[id]/comments

- **Purpose**: 댓글 목록 (최신순)
- **Auth**: teacher OR student OR share visitor
- **Response 200**:
  ```json
  {
    "items": [{
      "id": "cuid",
      "content": "댓글 내용",
      "createdAt": "ISO8601",
      "authorKind": "teacher|student|external",
      "authorLabel": "표시 이름",
      "canDelete": true
    }]
  }
  ```

#### POST /api/cards/[id]/comments

- **Purpose**: 댓글 작성
- **Auth**: teacher OR student OR share visitor
- **Body**: `{ "content": "1~1000자" }`
- **Response 200**: `{ "item": { ...comment } }`

#### GET /api/boards/[id]/snapshot

- **Purpose**: 보드 전체 스냅샷 (ETag 캐시)
- **Auth**: teacher OR student OR share visitor (`x-share-token` header)
- **Response 200**:
  ```json
  {
    "cards": [ /* CardWire[] */ ],
    "sections": [ /* SectionWire[] */ ],
    "question": { "prompt", "vizMode", "responses" } | null,
    "hash": "sha1hex"
  }
  ```
- **304**: `If-None-Match` 헤더가 `hash`와 일치 시

#### GET /api/boards/[id]/stream

- **Purpose**: SSE 실시간 업데이트 (10초 폴링, 55초 TTL)
- **Auth**: teacher OR student (share visitor는 인증 불가)
- **Response**: `text/event-stream`
- **Events**: `snapshot`, `question_snapshot`, `forbidden`, `end`, `error`
- **Mobile note**: `apps/mobile/lib/api.ts`의 `streamSse()` 사용. RN에서 `ReadableStream` 미지원 시 text fallback.

#### POST /api/upload

- **Purpose**: 파일/이미지/비디오 업로드
- **Auth**: teacher OR student (Bearer token)
- **Body**: `multipart/form-data` with `file` field
- **Constraints**: ≤50MB, image/video/document MIME whitelist
- **Response 200**:
  ```json
  {
    "url": "https://supabase.../uploads/...",
    "previewUrl": "https://.../previews/...webp" | null,
    "type": "image|video|file",
    "name": "original-filename.ext",
    "size": 12345,
    "mimeType": "normalized/mime"
  }
  ```
- **Mobile note**: React Native `FormData` 사용. `{ uri, name, type } as unknown as Blob` 패턴.

#### POST /api/student/logout

- **Purpose**: 세션 쿠키 삭제 (웹용)
- **Auth**: student session
- **Response 200**: `{ "success": true }`
- **Mobile note**: 모바일에서는 `SecureStore.deleteItemAsync`로 토큰 삭제로 충분. 이 호출은 선택사항.

#### GET /api/student-portfolio/[studentId]

- **Purpose**: 학생 포트폴리오 (본인 카드 전체)
- **Auth**: teacher OR student (본인) OR parent (자녀만)
- **Response 200**:
  ```json
  {
    "student": { "id", "name", "number" },
    "cards": [{ /* PortfolioCardDTO */ }]
  }
  ```

---

### 2.2 Parent Endpoints

#### POST /api/parent/signup

- **Purpose**: 이메일 기반 학부모 회원가입 (매직링크 발송)
- **Auth**: none
- **Body**:
  ```json
  { "email": "parent@example.com", "client": "web" | "mobile" }
  ```
  - `client`는 선택사항. 기본값 `"web"`. 모바일 클라이언트는 반드시
    `"mobile"`을 전송하여 콜백이 `auraboard://` deep link로 핸드오프되도록
    해야 함.
- **Response 200**: `{ "ok": true, "message": "매직링크를 발송했습니다", "devMagicLinkUrl": "..." }`
- **Errors**: 400, 429 rate_limited (IP 기반 5/15분)
- **Mobile flow**:
  1. 모바일 앱이 `POST /api/parent/signup` (body: `{ email, client: "mobile" })` 호출.
  2. 서버는 매직링크 URL을
     `<origin>/parent/auth/callback?token=<HMAC>&client=mobile` 로 생성하고
     이메일로 발송 (또는 dev 모드에서 `devMagicLinkUrl`로 반환).
  3. 사용자가 디바이스의 메일 앱에서 링크를 탭하면
     `auraboard://parent/auth/callback#token=<session>&expiresAt=<ISO>`로
     핸드오프됨 (아래 `GET /parent/auth/callback` 모바일 분기 참조).
  4. 모바일 앱은 fragment에서 `token`을 추출해
     `expo-secure-store`에 저장하고, 이후 모든 parent API 호출에
     `Authorization: Bearer <token>` 첨부.
- **Web note**: `client` 생략 또는 `"web"`이면 매직링크는 일반
  `/parent/auth/callback`으로 발송되며, 기존과 동일하게 HttpOnly 쿠키
  기반 세션을 설정하고 `/parent/home` (또는 온보딩 분기)로 리다이렉트.

#### GET /parent/auth/callback?token=<HMAC>[&client=mobile]

- **Purpose**: 매직링크 HMAC 토큰 검증 → `ParentSession` 생성 →
  redirect. 웹은 HttpOnly 쿠키 + `/parent/home` (또는 온보딩 분기)로
  리다이렉트. 모바일은 `auraboard://parent/auth/callback` deep link로
  핸드오프.
- **Auth**: none (HMAC 토큰 자체가 인증)
- **Query**:
  - `token` (required) — `/api/parent/signup`이 발급한 HMAC 매직링크.
  - `client` (optional) — `"mobile"`이면 deep link 핸드오프 분기
    활성화. 그 외 값 또는 생략 시 기존 웹 동작.

##### Web response (`client` 미지정 또는 `web`)

- 성공: 302 → `/parent/home` (active/pending link 보유) 또는
  `/parent/onboard/match/code` / `/parent/onboard/rejected` (분기 로직은
  기존과 동일).
- 실패: 302 → `/parent/join?error=invalid_link` (또는 `internal`).
  응답 본문 없음, 정보 누설 없음.

##### Mobile response (`client=mobile`)

- 성공: 302 →
  `auraboard://parent/auth/callback#token=<parent-session>&expiresAt=<ISO8601>`
  - fragment(`#...`)는 클라이언트 측에서만 처리되며, 네트워크 로그/서버
    액세스 로그에 노출되지 않음.
  - `token`은 `expo-secure-store`에 저장. 이후 모든 parent API 호출에
    `Authorization: Bearer <token>` 첨부.
  - `expiresAt`은 `Date.parse` 호환 ISO 8601.
- 실패: 302 →
  `auraboard://parent/auth/callback#error=<code>`
  - `<code>` 값: `invalid_link` (토큰 누락/만료/위조/parent 미존재/
    soft-deleted) 또는 `internal` (세션 생성 DB 오류).
  - 모바일 앱은 fragment의 `error` 키를 확인해 로그인 화면에 적절한
    안내를 표시.
- **Security**:
  - `client` 값은 enum (`"web" | "mobile"`)으로 강제 검증. 그 외 값은
    기본값(웹)으로 처리되어 deep link로 steering되지 않음.
  - 리다이렉트 대상 URL은 서버 상수의 하드코딩 값
    `auraboard://parent/auth/callback`만 사용. 요청 본문/쿼리에서
    임의의 URL을 받아 redirect하지 않음 (open redirect 방지).
  - HttpOnly 쿠키(`parent_session`)는 모바일에서 무의미하나 부작용
    없음 — RN은 쿠키를 사용하지 않고 fragment의 Bearer 토큰을 사용.
  - HMAC 검증/만료 체크는 변경 없음. `verifyMagicLink` 호출 + `exp`
    만료 검증 그대로.
  - 토큰은 콘솔/로그에 출력하지 않음.

#### GET /api/parent/auth/[provider]

- **Purpose**: OAuth 시작 (Google/Kakao) → provider authorization URL로 302
- **Auth**: none
- **Mobile note**: 모바일에서는 `expo-auth-session` 또는 `WebBrowser.openAuthSessionAsync`로 처리. 콜백은 `/api/parent/auth/callback/[provider]`가 처리 후 302.

#### GET /api/parent/auth/callback/[provider]

- **Purpose**: OAuth 콜백 → ParentSession 생성 → 쿠키 설정 → 302 redirect
- **Auth**: none (OAuth code exchange)
- **Mobile note**: **현재 쿠키 기반이라 모바일에서 직접 사용 불가.** Bearer 토큰 반환 경로 추가 필요 (§5 Blockers 참조).

#### GET /api/parent/session/status

- **Purpose**: 학부모 온보딩 상태 확인
- **Auth**: parent session (cookie) or `Authorization: Bearer <parent-session-token>`
- **Response 200**:
  ```json
  {
    "state": "anonymous|authed_prematch|pending|active|rejected|revoked",
    "activeLinks": 1,
    "pendingLinks": 0,
    "rejectedReason": null
  }
  ```

#### GET /api/parent/children

- **Purpose**: 로그인한 학부모의 active 자녀 목록
- **Auth**: parent session (cookie) or `Authorization: Bearer <parent-session-token>`
- **Response 200**:
  ```json
  {
    "parent": { "id": "cuid" },
    "children": [
      {
        "id": "ParentChildLink.id",
        "studentId": "Student.id",
        "number": 7,
        "name": "홍길동",
        "classroom": { "id": "cuid", "name": "3학년 2반" },
        "linkedAt": "ISO8601"
      }
    ]
  }
  ```
- **Notes**:
  - `status='active'` + `deletedAt IS NULL` link만 반환.
  - parent email/name/tier 등 불필요한 PII는 응답하지 않음.
  - 학생 row가 삭제된 link는 제외.

#### POST /api/parent/match/code

- **Purpose**: 초대코드 검증 → match ticket 발급
- **Auth**: parent session (cookie)
- **Body**: `{ "code": "ABC123" }`
- **Response 200**: `{ "ticket": "short-lived-jwt", "classroomName": "3학년 2반" }`
- **Errors**: 400, 401, 404 code_not_found, 410 code_expired, 429 rate_limited

#### GET /api/parent/match/students?ticket=

- **Purpose**: 학급 학생 목록 (자녀 선택용)
- **Auth**: parent session (cookie)
- **Response 200**:
  ```json
  {
    "classroomName": "3학년 2반",
    "students": [{ "id": "cuid", "classNo": 0, "studentNo": 1, "name": "홍길동" }]
  }
  ```

#### POST /api/parent/match/request

- **Purpose**: 자녀 연결 요청 (ParentChildLink 생성)
- **Auth**: parent session (cookie)
- **Body**: `{ "ticket": "from-match-code", "studentId": "cuid" }`
- **Response 200**: `{ "linkId": "cuid", "status": "pending" }`
- **Errors**: 400, 401, 404, 429 too_many_pending (max 3)

#### POST /api/parent/match/retry

- **Purpose**: 거절 쿨다운 확인
- **Auth**: parent session (cookie)
- **Response 200**: `{ "ok": true, "cooldownSeconds": null }`

#### DELETE /api/parent/my-links/[id]

- **Purpose**: 자녀 연결 해제 (parent self-leave)
- **Auth**: parent session (cookie)
- **Response 200**: `{ "ok": true, "status": "rejected|revoked" }`

#### GET /api/parent/portfolio?childId=

- **Purpose**: 자녀 포트폴리오 (본인 카드 + 학급 자랑해요)
- **Auth**: parent session + childId ∈ active ParentChildLink
- **Response 200**:
  ```json
  {
    "child": { "id", "name", "number", "classroomId" },
    "ownCards": [ /* PortfolioCardDTO[] */ ],
    "classroomShowcase": [ /* ShowcaseEntryDTO[] */ ]
  }
  ```
- **Errors**: 401, 403 parent_only, 403 forbidden, 400 childId_required

#### GET /api/parent/children/[id]/assignments

- **Purpose**: 자녀 과제 현황 (AssignmentSlot + legacy Submission)
- **Auth**: parent session + studentId ∈ parent.children
- **Response 200**: `{ "submissions": [...] }`

#### GET /api/parent/children/[id]/events

- **Purpose**: 자녀 이벤트 신청 현황
- **Auth**: parent session + studentId ∈ parent.children
- **Response 200**: `{ "events": [{ "board": {...}, "mySubmissions": [...] }] }`

#### GET /api/parent/children/[id]/plant

- **Purpose**: 자녀 식물 관찰일지
- **Auth**: parent session + studentId ∈ parent.children
- **Response 200**: `{ "plants": [...] }`

#### GET /api/parent/children/[id]/drawing

- **Purpose**: 자녀 그림 라이브러리
- **Auth**: parent session + studentId ∈ parent.children
- **Response 200**: `{ "assets": [...] }`

#### GET /api/parent/children/[id]/breakout

- **Purpose**: 자녀 모둠 학습 현황
- **Auth**: parent session + studentId ∈ parent.children
- **Response 200**: `{ "memberships": [...] }`

#### POST /api/parent/logout

- **Purpose**: 세션 쿠키 삭제 + DB 세션 revoke
- **Auth**: parent session
- **Response 200**: `{ "ok": true }`

#### POST /api/parent/account/withdraw

- **Purpose**: 회원 탈퇴 (soft delete)
- **Auth**: parent session (withParentScope)
- **Response 200**: `{ "ok": true, "withdrawedAt": "ISO8601" }`

---

## 3. Next API vs Supabase Direct / Realtime

### 3.1 반드시 Next API를 거쳐야 하는 호출

| Reason | Endpoints |
|---|---|
| **HMAC 토큰 발급/검증** | `/api/student/auth`, `/api/student/me` |
| **OAuth 콜백 + 세션 생성** | `/api/parent/auth/*` |
| **Prisma 트랜잭션 + 서버 비즈니스 로직** | `/api/cards` POST/PATCH/DELETE, `/api/upload` |
| **부모 scope 검증 (parent-child link)** | `/api/parent/portfolio`, `/api/parent/children/*` |
| **RBAC + permission check** | `/api/boards/[id]/snapshot`, `/api/boards/[id]/stream` |
| **Rate limiting** | `/api/student/auth`, `/api/parent/match/*`, `/api/parent/signup` |

### 3.2 Supabase 직접 접근 가능한 호출 (현재 웹 share shell에서 사용)

| Pattern | How | Mobile Applicability |
|---|---|---|
| Share board read | `createPublicSupabaseClient` + `x-share-token` header → Supabase PostgREST | ⚠️ 가능하지만 RLS policy에 의존. 모바일에서는 Next API snapshot이 더 안전. |
| Share card CRUD | Supabase client → `Card` table direct insert/update/delete | ⚠️ share visitor 전용. 학생 인증 카드는 Next API 필수. |
| Realtime subscription | Supabase Realtime channel `board:{boardId}` | ✅ 보드 변경 시 instant push. 현재 웹 share shell에서 사용 중. 모바일에서도 `@supabase/realtime-js` 연결 가능. |

### 3.3 모바일 권장 패턴

```
학생 인증 필요 호출  →  Next API (Bearer token)
부모 인증 필요 호출  →  Next API (Bearer token or cookie)
보드 실시간 업데이트  →  Next API snapshot (poll) 또는 Supabase Realtime (push)
파일 업로드          →  Next API /api/upload (multipart)
```

**Realtime 전략 (모바일)**:
- 현재 `/api/boards/[id]/stream`는 SSE 폴링 (10초 간격, 55초 TTL).
- 모바일에서 더 나은 UX가 필요하면 Supabase Realtime 직접 구독 가능:
  - `supabase.channel('board:{boardId}').on('postgres_changes', { event: '*', schema: 'public', table: 'Card', filter: 'boardId=eq.{id}' }, callback)`
  - 단, 이 경로는 RLS policy에 의존하므로 share token 또는 anon key 기반 접근 필요.
  - **MVP에서는 Next API snapshot 폴링으로 충분.** Realtime은 Phase 3 최적화.

---

## 4. Security Constraints

### 4.1 Student Mobile Token

| Property | Value |
|---|---|
| Format | `base64url(JSON).base64url(HMAC-SHA256)` |
| Payload | `{ studentId, classroomId, sessionVersion, exp }` |
| TTL | 30 days |
| Storage | `expo-secure-store` (Android: AndroidKeystore AES, iOS: Keychain) |
| Transport | `Authorization: Bearer <token>` header |
| Revocation | `Student.sessionVersion` 변경 시 기존 토큰 무효화 |
| Rotation | 교사가 학생 QR 재발급 시 `sessionVersion++` → 모든 기존 세션 무효화 |

**주의사항**:
- `AUTH_SECRET` env var이 HMAC 키. 유출 시 모든 학생 토큰 위조 가능.
- 토큰에 `exp`가 포함되어 있으나 서버에서 매번 `sessionVersion` 대조 필요.
- 웹 쿠키(`student_session`)와 동일한 토큰. 모바일과 웹이 동시 로그인 가능.

### 4.2 Parent Session

| Property | Web | Mobile |
|---|---|---|
| Storage | HttpOnly cookie `parent_session` | `expo-secure-store` |
| Token format | `base64url(32 random bytes)` | 동일 |
| DB lookup | `sha256(token)` → `ParentSession.tokenHash` | 동일 |
| TTL | 7 days | 7 days |
| Revocation | `sessionRevokedAt` set | 동일 |
| SameSite | `Lax` (web) | N/A (Bearer) |

`getCurrentParent()`는 `Authorization: Bearer <token>`을 먼저 확인하고,
없을 때 `parent_session` 쿠키로 fallback한다. 이메일 매직링크 모바일
콜백은 같은 `ParentSession` 토큰을 deep link fragment로 앱에 전달한다.

### 4.3 Parent PII 보호 규칙

| Constraint | Enforcement |
|---|---|
| 부모 이메일은 교사에게만 노출 | `/api/parent/approvals` → `parentEmail` 필드 (teacher auth required) |
| 부모의 자녀 목록은 본인만 조회 | `withParentScope` → `childIds` set (parent session required) |
| 자녀 외 학생 카드 0건 누출 | `/api/parent/portfolio` → `childId ∈ viewer.childIds` 체크 (AC-8) |
| cross-parent link enumeration 차단 | `requireParentChildLinkOwned` → linkId 소유주 아니면 404 (AC-6) |
| cross-student probing 차단 | `withParentScopeForStudent` → studentId 미매핑 시 403 (AC-5) |
| 부모 이름/프로필 이미지 | `ParentOAuthAccount`에 저장되지만 API 응답에 포함하지 않음 (현재) |
| 탈퇴 시 90일 익명화 | Cron: `parentDeletedAt` 이후 `email`, `name`을 SHA-256 해시로 대체 |

### 4.4 Share Token 보안

- Share token은 보드 1개에 바인딩. 다른 보드 접근 시 403.
- Share visitor는 `x-share-token` + `x-share-guest-id` 헤더로 Supabase 직접 접근 가능.
- 모바일에서 share token 사용 시: 학생 인증이 있으면 share token 불필요. 학생 인증이 없는 외부 방문자만 share token 사용.

---

## 5. Gaps / Blockers

### P0 — Blockers (MVP 전 필수)

현재 백엔드 P0였던 B-1/B-2/B-3은 Phase 1~3에서 해결됨:
`getCurrentParent()` Bearer 지원, `GET /api/parent/children`, 이메일
매직링크 모바일 토큰 핸드오프가 구현되어 있다.

### P1 — Important (MVP 직후)

| # | Gap | Impact | Fix |
|---|---|---|---|
| B-4 | **Parent match flow (code→students→request)가 쿠키 전용** | 모바일에서 자녀 연결 불가 | B-1 해결 시 자동 해결. 3-step flow를 모바일에서 그대로 재사용 가능. |
| B-5 | **Parent account/withdraw가 쿠키 전용** | 모바일에서 탈퇴 불가 | B-1 해결 시 자동 해결. |
| B-6 | **Board SSE stream이 teacher/student만 인증** | Share visitor는 SSE 불가 | 현재 share shell은 Supabase Realtime 사용. 모바일 학생은 Bearer 토큰으로 SSE 접근 가능하므로 영향 없음. |
| B-7 | **`/api/parent/test/children` → 프로덕션 엔드포인트 미전환** | 테스트 코드에 parentId/email/tier 노출 | 프로덕션용 엔드포인트로 교체. PII 필드 제한. |

### P2 — Nice to have

| # | Gap | Impact | Fix |
|---|---|---|---|
| B-8 | **Student board detail에 engagement 데이터 미포함** | 좋아요/댓글 수를 별도 fetch 필요 | snapshot API 이미 포함하므로 병합 가능. 또는 모바일에서 snapshot 사용. |
| B-9 | **Parent notification (승인/거절)** | 부모가 승인 결과를 모바일에서 확인 불가 | Push notification (expo-notifications) + polling. |
| B-10 | **Deep link 미구현** | 매직링크 → 앱 직접 열기 불가 | `expo-linking` + `auraboard://` scheme 등록. ✅ Parent email magic-link 핸드오프는 §Appendix D Phase 3로 해소. 보드 deep link는 후속. |

---

## 6. Implementation Order (Next Backend Round)

```
Phase 1 — Parent Bearer Token (B-1, B-3)
  1. src/lib/parent-session.ts:
     - createParentSession()이 token 문자열을 반환하도록 수정 (이미 반환 중)
     - getCurrentParent()이 Authorization: Bearer 헤더도 확인하도록 확장
       (student-auth.ts의 getCurrentStudentRaw() 패턴 참고)
  2. src/lib/parent-auth-only.ts: 변경 없음 (getCurrentParent에 의존)
  3. src/lib/parent-scope.ts: 변경 없음 (getCurrentParent에 의존)
  4. 테스트: curl로 Bearer 토큰 + /api/parent/session/status 확인

Phase 2 — Production Children Endpoint (B-2, B-7) ✅ shipped
  5. GET /api/parent/children (신규):
     - withParentScope 사용
     - Student { id, name, number, classroom { id, name } } join
     - active link만 반환
  6. /api/parent/test/children deprecated 표시

Phase 3 — Parent Magic-Link Mobile Handoff ✅ shipped
  7. POST /api/parent/signup: body에 client 필드 추가, zod enum 검증
  8. GET /parent/auth/callback: client=mobile 분기에서
     auraboard://parent/auth/callback#token=...&expiresAt=... 으로 핸드오프
  9. 모바일 fragment에서 토큰 추출 → expo-secure-store 저장 → Bearer 사용

Phase 4 — Mobile OAuth Handoff (deferred)
  10. expo-auth-session으로 Google/Kakao OAuth 콜백 처리
  11. OAuth 콜백에서도 Bearer 토큰 핸드오프 분기 추가 (현재 쿠키 전용)

Phase 5 — Enhancement
  12. Supabase Realtime 구독 (보드 변경 push)
  13. Push notification (expo-notifications)
  14. Deep link (auraboard://board/{slug})
```

---

## Appendix A: Auth Flow Diagrams

### Student Login Flow (Mobile)

```
┌─────────────┐    POST /api/student/auth     ┌──────────────┐
│  Mobile App  │ ──────────────────────────────→│  Next Server  │
│              │  { token: "ABC123" }           │               │
│              │ ←──────────────────────────────│               │
│              │  { sessionToken, student }     │               │
│              │                                │               │
│  SecureStore │  saveSessionToken(token)       │               │
│              │                                │               │
│              │  GET /api/student/me           │               │
│              │  Authorization: Bearer <token>  │               │
│              │ ──────────────────────────────→│               │
│              │ ←──────────────────────────────│               │
│              │  { student, boards }           │               │
└─────────────┘                                 └──────────────┘
```

### Parent Login Flow (Mobile — Target)

```
┌─────────────┐    expo-auth-session            ┌──────────────┐
│  Mobile App  │ ──────────────────────────────→│  Google/Kakao │
│              │  OAuth authorize                │               │
│              │ ←──────────────────────────────│  auth code    │
│              │                                 │               │
│              │    GET /api/parent/auth/callback/google         │
│              │  ?code=...&state=...            │               │
│              │ ──────────────────────────────→│  Next Server  │
│              │ ←──────────────────────────────│  302 redirect │
│              │  (cookie set OR token returned) │               │
│              │                                 │               │
│  SecureStore │  saveParentSessionToken(token)  │               │
└─────────────┘                                 └──────────────┘
```

### Parent Email Magic-Link Flow (Mobile — ✅ live)

```
┌─────────────┐  POST /api/parent/signup       ┌──────────────┐
│  Mobile App  │  { email, client: "mobile" }  │  Next Server  │
│              │ ──────────────────────────────→│               │
│              │ ←──────────────────────────────│               │
│              │  { ok: true, devMagicLinkUrl? }│               │
│              │                                │               │
│              │   (사용자가 메일 앱에서 링크 탭)              │
│              │                                │               │
│  OS deep     │   auraboard://parent/auth/callback?token=<HMAC>│
│  link        │   &client=mobile               │               │
│  handler     │ ──────────────────────────────→│  Next Server  │
│              │                                │               │
│              │  verify HMAC + create session  │               │
│              │ ←──────────────────────────────│               │
│              │  302 auraboard://parent/auth/   │               │
│              │  callback#token=<session>&     │               │
│              │  expiresAt=<ISO>               │               │
│  RN app      │  fragment에서 token 추출        │               │
│  SecureStore │  saveSessionToken(token)        │               │
│              │                                │               │
│              │  GET /api/parent/session/status│               │
│              │  Authorization: Bearer <token>  │               │
│              │ ──────────────────────────────→│               │
│              │ ←──────────────────────────────│               │
│              │  { state, activeLinks, ... }   │               │
└─────────────┘                                 └──────────────┘
```

## Appendix B: Token Format Reference

### Student Session Token

```
<base64url-header>.<base64url-hmac>

Header (base64url of JSON):
{
  "studentId": "clxyz...",
  "classroomId": "clabc...",
  "sessionVersion": 1,
  "exp": 1720000000000
}

HMAC: HMAC-SHA256(header, AUTH_SECRET)
```

### Parent Session Token (Current)

```
<base64url(32-random-bytes)>

DB: ParentSession.tokenHash = SHA-256(token)
Cookie: parent_session = token (HttpOnly, 7d)
```

## Appendix C: Mobile App Existing Code Reference

| File | Purpose |
|---|---|
| `apps/mobile/lib/api.ts` | `apiFetch()` — Bearer 자동 첨부, `streamSse()` — SSE 파서 |
| `apps/mobile/lib/session.ts` | `saveSessionToken()`, `loadSessionToken()`, `clearSessionToken()` |
| `apps/mobile/lib/types.ts` | 서버 DTO 타입 사본 (BoardMeta, MeResponse, BoardCard, etc.) |
| `apps/mobile/app/(student)/login.tsx` | 6자리 코드 로그인 UI |
| `apps/mobile/app/(student)/index.tsx` | 학생 대시보드 |
| `apps/mobile/app/(student)/board/[slug].tsx` | 보드 layout dispatcher |
| `apps/mobile/components/layouts/*.tsx` | 14개 레이아웃 네이티브 구현 |

## Appendix D: Implementation Status (2026-06-14)

이 섹션은 본 계약서가 코드와 동기화를 유지하도록 변경 이력을 추적한다.
본문은 source of truth — 본문과 충돌 시 본문을 우선.

### Phase 1 — Parent Bearer Token (B-1, B-3) ✅ shipped

- `src/lib/parent-session.ts`의 `getCurrentParent()`가
  `Authorization: Bearer <token>` 헤더를 1순위로 확인하고, 없을 때
  `parent_session` 쿠키로 fallback 하도록 확장됨.
- 토큰 형식은 기존과 동일 (`base64url(32 random bytes)`); DB 조회도
  동일한 `ParentSession.tokenHash` 키 사용. 세션 발급/회수는 변경 없음.
- 영향: §1.2 Parent 표의 "⚠️ web-only" 표시 중 session status (B-3)는
  Bearer 호환. 이메일 매직링크 모바일 분기는 Phase 3에서 토큰을 딥링크로
  전달한다. OAuth login 자체는 여전히 provider redirect + 쿠키 기반이라
  모바일 Bearer 핸드오프는 후속 작업이다.

### Phase 2 — Production Children Endpoint (B-2, B-7) ✅ shipped

- `GET /api/parent/children` (신규) 추가. 응답:
  ```json
  {
    "parent": { "id": "cuid" },
    "children": [
      {
        "id": "ParentChildLink.id",
        "studentId": "Student.id",
        "number": 7,
        "name": "홍길동",
        "classroom": { "id": "cuid", "name": "3학년 2반" },
        "linkedAt": "ISO8601"
      }
    ]
  }
  ```
  - `withParentScope` 사용 → `status='active' + deletedAt IS NULL`만 반환.
  - PII 최소화: `email`, `tier`, parent `name` 노출 없음. `parentId`는 응답
    매칭용으로만 echo.
  - 학생이 삭제된 link row는 결과에서 제외.
- `/api/parent/test/children`은 PV-9+ QA 용도로 유지하되 본 계약서에서는
  더 이상 문서화하지 않음 (B-7 해결).
- 영향: §1.2 Parent 표의 "Children list" ⚠️ → ✅ Bearer 호환.

### Phase 4 — Remaining (deferred)

- B-4 (match 3-step flow), B-5 (withdraw), B-6 (share SSE)는 `getCurrentParent`
  Bearer 지원을 그대로 활용 가능. 별도 백엔드 변경 없이 모바일 어댑터 추가만
  필요.
- B-8 (board detail engagement), B-9 (push notification), B-10 (deep link)는
  모바일 UX 최적화 항목 — 본 단계 범위 밖.

### Phase 3 — Parent Email Magic-Link Mobile Handoff ✅ shipped

- `POST /api/parent/signup` body에 선택적 `client: "web" | "mobile"` 필드
  추가. zod enum 검증, 기본값 `"web"`. 모바일 클라이언트가
  `"mobile"`을 보내면 매직링크 URL이
  `<origin>/parent/auth/callback?token=<HMAC>&client=mobile`로 생성됨.
- `GET /parent/auth/callback`이 `client=mobile` 쿼리 파라미터를 인식:
  - 매직링크 HMAC 검증 + `ParentSession` 생성은 그대로.
  - 성공 시 302 →
    `auraboard://parent/auth/callback#token=<parent-session>&expiresAt=<ISO>`
    (URL fragment에만 토큰 — query string으로 노출되지 않음).
  - 실패 (`invalid_link`, `internal`) 시 302 →
    `auraboard://parent/auth/callback#error=<code>`.
- 리다이렉트 대상 URL은 서버 상수의 하드코딩 값만 사용. 요청 본문/쿼리에서
  임의의 redirect URL을 받지 않음. `client` 파라미터는 `"mobile"`일 때만
  deep link로 분기하고 그 외 값은 웹 동작으로 fallback한다.
- 응답 본문 shape는 변경 없음 (웹 호환성 유지).
- 영향: §1.2 Parent 표의 "Email magic-link signup" ⚠️ → ✅ mobile-ready.
  §2.2 `POST /api/parent/signup` / `GET /parent/auth/callback` 섹션이 모바일
  분기 명세 포함. §5 B-10 deep link 항목의 parent 매직링크 핸드오프 부분
  해소.
