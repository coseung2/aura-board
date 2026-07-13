# Canva Connect 공개 심사 체크리스트

최종 검토일: 2026-07-13

## 운영 정보

- 서비스 URL: `https://aura-board.com`
- OAuth redirect URL: `https://aura-board.com/api/auth/canva/callback`
- 이용약관: `https://aura-board.com/terms`
- 개인정보처리방침: `https://aura-board.com/privacy`
- 사용자 및 보안 문의: `https://aura-board.com/support`

## 필수 환경 변수

- `CANVA_CLIENT_ID`
- `CANVA_CLIENT_SECRET`
- `CANVA_REDIRECT_URI=https://aura-board.com/api/auth/canva/callback`
- `CANVA_TOKEN_ENCRYPTION_KEY` (운영 전용 랜덤 값)
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_BASE_URL=https://aura-board.com`
- `CANVA_REVIEWER_EMAIL=integrations-support@canva.com`
- `CANVA_REVIEWER_NAME=Canva Integration Reviewer`
- `CANVA_REVIEWER_PASSWORD_HASH` (`npm run canva:reviewer:generate`로 생성)

운영 환경 변수의 실제 값은 이 문서나 저장소에 기록하지 않는다.

전용 암호화 키를 운영 환경에 설정한 뒤, 공개 배포 전에 기존 평문
OAuth 데이터 전환을 한 번 실행한다.

```powershell
npm run canva:encrypt-secrets
```

출력의 `teacherUpdates`만 운영 기록에 남기고 토큰 값은 기록하지 않는다.

## 기능 검증

1. 심사용 교사 계정으로 로그인하고 `/teacher/settings#canva`에서 Canva를 연결한다.
2. Canva 디자인을 보드 카드로 가져와 제목과 썸네일을 확인한다.
3. 하나 이상의 디자인을 선택해 각 항목이 별도 PDF로 다운로드되고 Canva 원본
   PDF가 병합·재배치되지 않는지 확인한다.
4. 보드 섹션 이름으로 Canva 폴더를 만들고 디자인을 이동한다.
5. 교사 계정에서 연결 해제를 실행한다.
6. 새로고침 후 연결 해제 상태가 유지되고, 다음 Canva 작업에서 재인증을 요구하는지 확인한다.

Save/publish 흐름은 UI 표시만 보지 말고 API 성공, 서버 상태, 새로고침 후 상태까지 확인한다.

## OAuth 및 데이터 검증

- OAuth Authorization Code + PKCE(S256)를 사용한다.
- OAuth state는 HMAC 서명, 10분 만료, 현재 로그인 사용자와의 일치를 검증한다.
- access token, refresh token, PKCE verifier는 서버에서 AES-256-GCM으로 암호화해 저장한다.
- `/users/me` 응답의 Canva 사용자·팀 식별자를 연결 행에 저장해 토큰 소유 맥락을 직접 연결한다.
- 기존 평문 access/refresh token은 정상 사용 시 암호문으로 점진 전환한다.
- 연결 해제는 Canva의 `/rest/v1/oauth/revoke`를 서버에서 호출한 후 로컬 연결 행을 삭제한다.
- revoke가 일시적으로 실패하면 로컬 토큰을 남겨 재시도할 수 있게 하고 성공으로 표시하지 않는다.
- API 응답과 토큰 관련 응답은 `private, no-store`로 취급한다.
- Canva API 오류는 HTTP 상태와 안전한 오류 코드만 기록하고 응답 원문·토큰은 기록하지 않는다.
- 디자인/폴더 조회, 폴더 변경, PDF 내보내기에 사용자별 요청 제한을 적용한다.
- PDF API는 요청당 한 항목만 허용하고, 화면은 최대 10개를 순차 요청한다.
- Canva PDF는 원본 바이트 그대로 반환하며 일반 이미지나 다른 Canva 디자인과
  합치지 않는다.

## 요청 scope

교사 기능:

- `design:meta:read`
- `design:content:read`
- `folder:read`
- `folder:write`

사용하지 않는 design write, asset, comment, permission, brand template scope는 요청하지 않는다.

## OWASP Top 10 검토

이 검토는 코드 기반 보안 검토이며 외부 침투 테스트를 의미하지 않는다.

- A01 접근 통제: 연결 상태와 해제 API는 현재 로그인한 교사의 연결 행만 다룬다.
- A02 암호화 실패: OAuth 비밀값은 AES-256-GCM으로 암호화하고 전송은 HTTPS를 사용한다.
- A03 인젝션: Prisma 매개변수 API와 고정 Canva API endpoint를 사용한다.
- A04 안전하지 않은 설계: 최소 scope, PKCE, 만료 state, 명시적 연결 해제 흐름을 사용한다.
- A05 보안 구성 오류: client secret과 암호화 키는 서버 전용 환경 변수이며 브라우저에 노출하지 않는다.
- A06 취약 구성요소: 제출 직전 `npm audit` 및 잠금 파일 기준 의존성 검토를 실행한다.
- A07 인증 실패: OAuth state의 서명·만료·로그인 사용자 일치를 확인한다.
- A08 무결성 실패: state HMAC과 GCM 인증 태그로 위·변조를 거부한다.
- A09 로깅 실패: 토큰과 client secret을 로그에 기록하지 않고 외부 오류 세부정보를 사용자에게 노출하지 않는다.
- A10 SSRF: Canva short link 및 thumbnail upstream은 허용된 Canva 호스트로 제한한다.

## 제출 직전 운영 확인

- [완료] Canva Developer Portal의 production redirect URL을 `aura-board.com`으로 설정하고 `localhost`, `127.0.0.1` 항목을 제거했다.
- 심사용 `integrations-support@canva.com` 계정과 데모 학급/보드를 준비한다.
- `npm run canva:reviewer:provision`으로 운영 DB 심사 계정을 준비하고
  `https://aura-board.com/login?review=canva`에서 직접 로그인을 확인한다.
- `/terms`, `/privacy`, `/support`가 로그아웃 상태에서 200으로 열리는지 확인한다.
- 운영 환경에 전용 `CANVA_TOKEN_ENCRYPTION_KEY`가 설정되어 있는지 확인한다.
- 마지막 침투 테스트가 없다면 Canva 설문의 pen test 날짜는 비워 둔다.
- 실제 평균/peak API 트래픽은 Vercel 로그 또는 관측 지표로 확인한 값을 기입한다.

## 제출 전 결정이 필요한 약관 항목

- Canva Developer Terms의 미디어 처리 조항에 맞춰 Canva 원본은 요청당 하나만
  처리하고, 여러 Canva 디자인 또는 이미지로 합성 PDF를 만들지 않는다.
- Canva Connect 기능은 인증된 교사에게만 노출되고 학생은 Canva 계정을 연결하거나
  Connect API에 직접 접근할 수 없음을 UI, API 권한, 이용약관에서 함께 확인한다.
- 문구만으로 완료 처리하지 말고 개별 다운로드와 교사 전용 접근을 운영에서 직접
  검증한다.
