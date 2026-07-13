# Aura Companion 연동 — OAuth 2.0 + 외부 데이터 풀 (2026-04-24)

> **Aura** 는 Aura-board 와 별개로 운영되는 **교사용** 컴패니언 웹앱 (https://aura-teacher.com).
> Aura-board 가 보유한 학급 평어·OMR 채점 결과를 Aura 가 풀해 종합/생기부 작성에 활용.

---

## 1. 인증 모델

### 1.1 OAuth 2.0 Authorization Code + PKCE (S256) — 권장

- **Client type**: confidential (CLIENT_SECRET 보유)
- **Subject**: 교사 (`User`) — 토큰이 교사 본인에 묶이며, `User.id` 가 owned `Classroom` 만 응답에 포함
- **CLIENT_ID**: `aura-companion` (고정)
- **CLIENT_SECRET**: 32 byte random (base64url 43자). 평문은 발급 시 1회 표시, DB 는 hash 만 저장
- **Token format**:
  - Access: `auratea_<8-char base62 prefix>_<40-char base64url secret>` — 1h 수명
  - Refresh: `aurater_<...>` — 30d 수명, rotate-on-use (RFC 6749 §10.5)
- **Scopes**: `external:read` (단일, 읽기 전용)
- **PKCE**: required. Aura 는 `code_verifier` 생성 → `code_challenge = base64url(sha256(verifier))` → authorize 호출에 동봉, token 교환에 verifier 동봉

### 1.2 Legacy shared-secret (전환기 fallback)

- **Header**: `Authorization: Bearer <AURA_BRIDGE_TOKEN>` (양 시스템 환경변수에 동일 시크릿)
- **단점**: 학급 코드만 알면 누구든 그 학급의 데이터 풀 가능 (소유권 검증 없음)
- **상태**: deprecated. 사용 시 응답 헤더 `Deprecation: true; Sunset: <date>; Link: </oauth/authorize>; rel="successor-version"`
- **Sunset**: OAuth 양쪽 prod 배포 후 2주 (2026-05-08 경 — Aura 측 마이그레이션 끝나면 양쪽 env 에서 제거)

---

## 2. 엔드포인트

| Method | URL | 용도 |
|---|---|---|
| GET | `https://aura-board.com/oauth/authorize` | 동의 화면. 교사가 Google 로그인 + "허용" 클릭 → auth code 발급 후 redirect_uri 로 302 |
| POST | `https://aura-board.com/api/oauth/token` | code → access/refresh 교환 + refresh rotation |
| POST | `https://aura-board.com/api/oauth/revoke` | access 또는 refresh token 폐기 (RFC 7009) |
| GET | `https://aura-board.com/api/oauth/me` | 디버그/헬스체크. Bearer access token 으로 호출 시 `{teacherId, email, name, scope, clientId}` |
| GET | `https://aura-board.com/api/external/feedbacks` | AI 평어 풀 (OAuth 또는 bridge) |
| GET | `https://aura-board.com/api/external/grades` | OMR 채점 결과 풀 (OAuth 또는 bridge) |

### 2.1 `/oauth/authorize` 호출 파라미터

```
response_type=code
client_id=aura-companion
redirect_uri=https://aura-teacher.com/integrations/aura-board/callback   (또는 localhost:4000)
scope=external:read
state=<랜덤 CSRF>
code_challenge=<base64url(sha256(code_verifier))>
code_challenge_method=S256
```

응답: 교사가 "허용" 시 → 302 to `redirect_uri?code=<...>&state=<...>`. 거절 시 → `redirect_uri?error=access_denied&state=<...>`

### 2.2 `/api/oauth/token` (Content-Type: application/x-www-form-urlencoded)

#### authorization_code grant
```
grant_type=authorization_code
code=<callback 에서 받은 code>
redirect_uri=<원래 보낸 거랑 정확히 일치>
code_verifier=<원본 PKCE verifier>
client_id=aura-companion
client_secret=<CLIENT_SECRET>
```

#### refresh_token grant (rotate-on-use)
```
grant_type=refresh_token
refresh_token=<aurater_...>
client_id=aura-companion
client_secret=<CLIENT_SECRET>
```

### 2.3 토큰 응답

```json
{
  "access_token": "auratea_xxxxxxxx_yyyyy...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "aurater_xxxxxxxx_yyyyy...",
  "scope": "external:read"
}
```

### 2.4 에러 응답 (RFC 6749 표준)

| Code | 의미 |
|---|---|
| `invalid_request` | 필수 파라미터 누락/형식 오류 |
| `invalid_client` | client_id/secret 불일치 (401) |
| `invalid_grant` | code/refresh 만료·소비됨·PKCE 불일치 |
| `unauthorized_client` | 클라이언트가 해당 grant_type 권한 없음 |
| `unsupported_grant_type` | grant_type 값 잘못됨 |
| `invalid_scope` | 요청 scope 가 client 등록 scope 에 없음 |
| `insufficient_scope` | 토큰 scope 가 endpoint 요구 scope 에 못 미침 (403) |

401 응답 시 `WWW-Authenticate: Bearer realm="aura-board", error="invalid_token"` 헤더 동봉.

---

## 3. `/api/external/feedbacks` 응답

### Query params

| 이름 | 필수 | 의미 |
|---|---|---|
| `classroomCode` | OAuth: optional / bridge: required | 학급 6자 코드. OAuth 모드에선 owned 학급 중 추가 필터, 없으면 owned 전체 |

### Response 200

```json
{
  "feedbacks": [
    {
      "id": "ckxxxxxxxxxxxxxxxxxxxxxx",
      "classroomCode": "ABCDEF",
      "studentNumber": 10,
      "studentName": "박유현",
      "subject": "art",
      "unit": "오일파스텔로 풍경화 그리기",
      "criterion": "색채 표현",
      "comment": "푸른 배경 위에 분홍 모티프를 대담한 색 대조로 표현하며 ...",
      "model": "gemini-2.5-flash",
      "sentAt": "2026-04-24T07:23:11.123Z"
    }
  ]
}
```

- `id` = Aura 측 `art_comment_drafts.aura_board_ref_id` UNIQUE 키. UPSERT 멱등성 보장
- 정렬: `updatedAt DESC`
- 페이지네이션 없음 (현재). 1000 row 넘으면 cursor 추가 예정

### Aura 측 UPSERT 패턴

```sql
INSERT INTO art_comment_drafts (
  aura_board_ref_id, classroom_code, student_number, student_name,
  subject, unit, criterion, comment, model, sent_at, synced_at
) VALUES (...)
ON CONFLICT (aura_board_ref_id)
DO UPDATE SET
  comment = EXCLUDED.comment,
  unit = EXCLUDED.unit,
  criterion = EXCLUDED.criterion,
  model = EXCLUDED.model,
  sent_at = EXCLUDED.sent_at,
  synced_at = NOW();
```

---

## 4. `/api/external/grades` 응답

OMR 채점 결과. OAuth 모드는 assessment 마다 `classroomCode` 필드 포함 (여러 학급 mixed 가능). Bridge 모드는 단일 학급 응답이지만 같은 필드.

```json
{
  "assessments": [
    {
      "id": "...",
      "title": "1단원 수행평가",
      "date": "2026-04-23T...",
      "classroomCode": "ABCDEF",
      "students": [
        { "number": 10, "name": "박유현", "score": 8, "totalScore": 10, "wrongQuestions": [3, 7] }
      ]
    }
  ]
}
```

---

## 5. Redirect URI Allowlist

DB `OAuthClient.redirectUris` (JSON 배열) 에 등록된 값과 **정확히 일치** 해야 인증 통과.

```
https://aura-teacher.com/integrations/aura-board/callback
http://localhost:4000/integrations/aura-board/callback
```

Vercel preview URL 은 커밋마다 바뀌므로 allowlist 제외 — 프리뷰에선 OAuth 테스트 안 함.

---

## 6. 운영 — Secret 회전 절차

### 시드/회전

```bash
# prod env 에서 pepper 가져옴 (시드 hash 가 prod 와 일치하도록)
vercel env pull /tmp/.env.prod --environment=production --yes
PROD_PEPPER=$(grep '^AURA_PAT_PEPPER=' /tmp/.env.prod | sed 's/^AURA_PAT_PEPPER="//;s/"$//')

# 시드 (재실행하면 secret 회전)
AURA_PAT_PEPPER="$PROD_PEPPER" node scripts/seed-aura-companion-client.mjs

# 출력에 새 CLIENT_SECRET 1회 표시. 안전 채널로 Aura 팀에 전달.
# Aura: Vercel AURA_BOARD_CLIENT_SECRET env 교체 + 재배포.
rm -f /tmp/.env.prod
```

⚠️ **회귀 방지 가드**: `AURA_PAT_PEPPER` 가 명시 설정 안 되면 시드는 abort. 로컬 dev DB target 일 때만 `ALLOW_DEV_PEPPER=1` 로 우회.

### 검증

```bash
# fake refresh 로 token endpoint 인증 통과 여부 확인
curl -X POST https://aura-board.com/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=refresh_token&refresh_token=fake&client_id=aura-companion&client_secret=<NEW_SECRET>"
# → {"error":"invalid_grant"} = 정상 (client 인증 OK, refresh 만 fake 라 grant 실패)
# → {"error":"invalid_client"} = 비정상 (secret 불일치 — pepper mismatch 의심)
```

### 토큰 폐기 (양방향 동기)

- **Aura → Aura-board**: `POST /api/oauth/revoke` with `token=<auratea_*>` 또는 `token=<aurater_*>`
- **Aura-board → Aura**: 교사가 `/teacher/settings` 의 "🔗 연결된 외부 앱" 섹션에서 "연결 해제" 클릭 → `POST /api/teacher/oauth-clients/aura-companion/disconnect` → 해당 교사·클라이언트 토큰 일괄 revoke

양쪽 어디서 폐기하든 다음 호출 401 → Aura 가 reconnect 유도.

---

## 7. 데이터 모델 (Aura-board 측)

| Table | 역할 |
|---|---|
| `OAuthClient` | client_id, secretHash, redirectUris (JSON), scopes (JSON), pkceRequired |
| `OAuthAuthCode` | 10분 단명 auth code. `studentId` XOR `userId` (CHECK 제약) |
| `OAuthAccessToken` | tokenHash + tokenPrefix(8자 unique). 교사용은 `userId` set, 학생용은 `studentId` set |
| `OAuthRefreshToken` | 동일 패턴. parentTokenHash 로 reuse-after-revoke chain 추적 |

토큰 prefix 로 subject 분간:
- `aurastu_` / `aurastr_` = 학생 (Canva 페어링)
- `auratea_` / `aurater_` = 교사 (Aura 컴패니언)

---

## 8. 보안 노트

- **PKCE + confidential client**: 양쪽으로 잠금. SECRET 유출 만으로는 토큰 발급 불가 (verifier 도 필요)
- **Subject discriminator**: teacher endpoint 에 student token 보내거나 그 반대 시 `wrong_subject` 또는 `invalid_grant`
- **Refresh chain revocation**: 폐기된 refresh 를 재사용하면 같은 (subject, client, scope) 의 모든 access token 까지 cascade revoke (RFC 6749 §10.5)
- **Pepper 분리**: secret 평문 + DB hash 둘 다 유출돼도 prod `AURA_PAT_PEPPER` 모르면 token 위조 불가. 프로덕션 외 환경에서는 dev fallback 만 사용
- **redirect_uri 정확 일치**: 부분 일치 X. 새 도메인 추가 시 시드 스크립트에서 `REDIRECT_URIS` 배열 갱신 + 회전

---

## 9. 알려진 한계 / 후속

- 페이지네이션 미구현 — 1000 row 초과 시 cursor 도입 필요
- Multi-client teacher OAuth 지원 (현재는 `aura-companion` 단일 client). 추가 client 등록 시 `src/lib/oauth-subject.ts` 의 `TEACHER_CLIENT_IDS` allowlist 갱신
- Audit log 미적용 — 토큰 발급/폐기 이력은 `OAuthAccessToken.lastUsedAt` + `revokedAt` 만. 별도 `AuditEvent` 연계 가능
- Bridge token 제거 시점에 `aura-bridge-auth.ts` 의 bridge 분기 코드 + `AURA_BRIDGE_TOKEN` env 양쪽 정리 필요
