# Aura-board External API (Seed 8)

External integrations (Canva Content Publisher, custom scripts, etc.) can
create cards on a teacher's board via a Personal Access Token (PAT).

> **Pro tier only** — the `cards:write` scope is restricted to Pro accounts.
> Free accounts calling `/api/external/cards` receive `402 tier_required`.

> **Companion app integration (read path)** — Aura 컴패니언(교사용 별도 웹앱)이
> AI 평어·OMR 채점 결과를 풀하는 OAuth 2.0 통합은 별도 문서 참조:
> [`docs/integrations/aura-companion.md`](./integrations/aura-companion.md).
> 본 문서의 PAT (`aurapat_*`) 는 cards:write (쓰기) 용, OAuth (`auratea_*`)
> 는 external:read (읽기) 용으로 역할이 분리돼 있다.

---

## 1. Get a token

1. Sign in as the owner/editor of the target boards.
2. Navigate to **`/settings/external-tokens`** (teacher UI).
3. Click **새 토큰 발급**, enter a label, pick an expiry (default 90 days).
4. **Copy the full token shown in the modal — it is displayed only once.**
5. Store it securely (Canva app env var, password manager, etc.).

**Format**: `aurapat_{8-char base62 prefix}_{40-char base64url secret}`

Regex (secret-scanner compatible):
`^aurapat_[0-9A-Za-z]{8}_[0-9A-Za-z_-]{40}$`

Up to **10 active tokens** per account. Revoke from the same page.

---

## 2. `POST /api/external/cards`

### Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer aurapat_…` (required) |
| `Content-Type` | `application/json` |
| `Content-Length` | must be ≤ 4.0 MB |

### Request body (Zod strict — unknown fields rejected with 422)

```json
{
  "boardId": "ckxyz…",                              // required
  "title": "오늘 배운 내용",                          // required, 1–200 chars
  "imageDataUrl": "data:image/png;base64,iVBOR…",   // required, PNG only
  "sectionId": "ckabc…"                              // optional, null allowed
}
```

* `sectionId`, if provided, must belong to `boardId` (else 422).
* `imageDataUrl` must start with `data:image/png;base64,`.
* Bodies > 4 MB are rejected at `413` **before** any parsing.

### Success (200)

```json
{
  "id": "<Card.cuid>",
  "url": "https://aura-board.com/board/<slug>#c/<cardId>"
}
```

The response is intentionally minimal — no `imageUrl`, no internal fields.

### Error envelope

All errors use the unified shape:

```json
{ "error": { "code": "<code>", "message": "<human readable>" } }
```

Error catalog:

| HTTP | code | Meaning |
|---|---|---|
| 401 | `unauthorized` | Missing `Authorization` header |
| 401 | `invalid_token_format` | Header did not match `aurapat_{8}_{40}` regex |
| 401 | `invalid_token` | Prefix missing in DB or hash mismatch (timing-safe) |
| 410 | `token_revoked` | `revokedAt` or `expiresAt` reached |
| 402 | `tier_required` | Caller is on Free tier — response header `X-Upgrade-Url` points to pricing |
| 403 | `forbidden` | Token owner is not owner/editor on the target board |
| 403 | `forbidden_board` | `boardId` is outside `scopeBoardIds` allowlist |
| 403 | `forbidden_scope` | Token does not include `cards:write` |
| 404 | `not_found` | Board does not exist |
| 413 | `payload_too_large` | Content-Length > 4 MB |
| 422 | `invalid_data_url` | Zod strict failure — includes unknown keys, missing fields, malformed data URL |
| 429 | `rate_limited` | 3-axis rate limit breach — `Retry-After` + `X-Rate-Limit-Axis` headers |
| 500 | `blob_upload_failed` | Vercel Blob streaming upload error |
| 500 | `internal` | Unhandled server error |

### Rate limits (3-axis OR)

| Axis | Budget |
|---|---|
| per-token | 60 req / 1 min |
| per-teacher | 300 req / 1 hour |
| per-IP | 300 req / 1 min |

Breach of any axis → 429 with `Retry-After: <seconds>` and `X-Rate-Limit-Axis`
header (`token` / `teacher` / `ip`).

Backend: Upstash Redis sliding window (`@upstash/ratelimit`). Fall-back to
in-process sliding window for local dev (warning logged).

### Card defaults

Created cards use: `width=240`, `height=160`, `content=""`, `authorId` = token
owner, `sectionId` = body value or null, `imageUrl` = Vercel Blob URL (not
returned in response), `kind` implied via presence of `imageUrl`.

---

## 3. Examples

```bash
# 1. Minimum valid request (PNG data URL required)
curl -sS https://aura-board.com/api/external/cards \
  -H "Authorization: Bearer aurapat_ABCD1234_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "boardId": "ckxyz…",
    "title": "수업 카드",
    "imageDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…"
  }'
```

## 4. Security

* **Never commit tokens** to source control. Store in Canva app env var or a
  secret manager.
* The plaintext secret is displayed **once** at issuance. Lost = reissue.
* Hash = `SHA-256(secret ‖ AURA_PAT_PEPPER)` — rotating the pepper invalidates
  all active tokens simultaneously.
* TLS-only; Vercel enforces HTTPS.
* Use one token per integration so one leak can be scoped-revoked.
* Constant-time comparison is used during verification. Prefix-miss paths
  burn a dummy SHA-256 to prevent timing side-channels.

## 5. Legacy migration

Tokens issued under the v1 (`aura_pat_…`) format are dropped in the 3-stage
migration. See `docs/MIGRATION_PLAN.md`. A Resend email notifies affected
teachers to reissue from the teacher UI.
