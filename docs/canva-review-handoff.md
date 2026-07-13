# Canva Connect 심사 핸드오프

최종 점검일: 2026-07-13

대상 저장소: `coseung2/aura-board`

브랜치: `main`

Canva Integration ID: `OC-AZ134Kp64WVh`

이 문서는 Canva Connect 공개 심사를 집이나 다른 환경에서 이어가기 위한
작업 인계서다. 비밀번호, OAuth 토큰, client secret, 암호화 키는 기록하지
않는다.

## 현재 결론

아직 Canva 심사 양식에서 **Submit을 누르면 안 된다**. 양식은 Save 상태로
유지하고 아래 제출 차단 항목을 먼저 해결한다.

현재 Connect 통합은 교사용 기능만 포함한다.

- 교사 OAuth 2.0 Authorization Code + PKCE 연결
- Canva 디자인 메타데이터와 썸네일 표시
- Canva 디자인 PDF 내보내기
- Canva 폴더 탐색, 생성 및 디자인 이동
- 교사 설정에서 Canva 연결 해제

학생 Aura 카드 디자인 생성, QR asset 업로드 및 학생 Canva Connect OAuth는
제거됐다. 별도의 학생 Canva Content Publisher 페어링 기능은 이 Connect API
심사 설명과 스코프에 포함하지 않는다.

## 운영에서 확인된 상태

- `https://aura-board.com/login?review=canva`: 200, reviewer 이메일/비밀번호 폼 노출
- `https://aura-board.com/terms`: 200
- `https://aura-board.com/privacy`: 200
- `https://aura-board.com/support`: 200
- reviewer 계정: `integrations-support@canva.com`
- reviewer 이름: `Canva Integration Reviewer`
- reviewer 소유 보드: `test for review`
- 직접 보드 URL: `https://aura-board.com/board/board-mrirxqwp`
- 보드 내 테스트 섹션 이름: `test`
- 운영 Vercel에 Canva client secret, token encryption key, `AUTH_SECRET`, reviewer
  password hash가 설정돼 있다.
- Canva OAuth 토큰과 PKCE verifier는 AES-256-GCM으로 암호화된다.
- 교사 Canva 테이블에는 `canvaUserId`, `canvaTeamId`가 있고 학생 Connect
  테이블은 제거됐다.
- 관련 Prisma 마이그레이션 두 건은 운영 DB에서 applied 처리됐다.
- `Powered by Canva`가 연결 진입점, 폴더 모달, PDF 모달 및 embed UI에 표시된다.
- production redirect URI는
  `https://aura-board.com/api/auth/canva/callback`이며 localhost/127.0.0.1은 제거됐다.

운영 로그 24시간 기준 Canva 관련 트래픽은 평균 0.1 RPS 미만이며, 관측 peak는
약 2 RPS다. 심사 양식에는 expected peak를 5 RPS 미만으로 기입할 수 있다.

## 제출 차단 항목

### 1. Developer Portal 스코프 정리

현재 Portal 제출 티켓에는 불필요한 folder permission scope가 남아 있다.

삭제:

- `folder:permission:read`
- `folder:permission:write`

최종 유지:

- `design:meta:read`
- `design:content:read`
- `folder:read`
- `folder:write`

`design:content:write`, asset, permission, comment, brand template scope는 모두
`n/a`로 제출한다.

### 2. Portal 설명에서 학생 Aura 카드 기능 제거

현재 심사 양식의 다음 설명은 실제 구현과 다르므로 삭제한다.

- personalized Aura card design 생성
- QR-code asset 업로드
- 학생 Canva 계정 연결
- `design:content:write`
- `asset:read`, `asset:write`

교사용 디자인 메타데이터, PDF, 폴더 탐색/생성/이동과 연결 해제만 설명한다.
복사용 최신 초안은 `docs/canva-submission-response.md`를 기준으로 한다.

### 3. 계정 삭제 시 Canva revoke 누락

교사가 설정에서 Canva 연결을 해제하면 refresh-token lineage를 revoke한 뒤
로컬 연결 행을 삭제한다. 하지만 Aura Board 계정 탈퇴 경로는
`DELETE /api/teacher/me`만 호출하고 Canva revoke 없이 사용자 행을 cascade
삭제한다.

수정 방향:

1. 교사 계정 삭제 전에 `disconnectTeacherCanva(user.id)`를 호출한다.
2. Canva revoke 실패 시 계정 삭제를 성공으로 표시하지 않거나, 명시적인 재시도
   정책을 구현한다.
3. 성공 후 사용자/연결 행 삭제와 로그아웃까지 검증한다.
4. 연결 해제와 계정 삭제 모두 새로고침 후 재인증을 요구하는지 확인한다.

이 수정 전에는 설문의 “30일 내 토큰 폐기·개인정보 삭제” 답을 **No**로 둔다.
수정 및 운영 검증 후 **Yes**로 변경한다.

### 4. 여러 Canva 디자인 PDF 병합과 Developer Terms

현재 `/api/export/canva-pdf`는 `pdf-lib`로 여러 Canva export 결과를 하나의
PDF로 합친다. `A4 자동 배치`는 여러 원본을 같은 PDF 페이지에 배치한다.
Canva Developer Terms의 media 처리 조항은 한 번에 원본 하나만 처리하고 여러
원본으로 파생물을 만들지 않도록 요구한다.

다음 중 하나를 결정한다.

1. Canva에 현재 병합 방식의 허용 여부를 서면으로 확인한다.
2. 심사 버전에서는 Canva 디자인 한 개만 선택하고 Canva export PDF를 병합 없이
   반환하도록 제한한다.
3. 별도 법률 검토를 거친다.

확정 전에는 “Canva API 및 Developer Terms 준수”를 **Yes**로 제출하지 않는다.

### 5. 만 13세 미만 이용자 조항

Aura Board 이용약관은 초·중등 학생을 대상으로 하지만, 만 13세 미만 또는 해당
국가의 동의 가능 최소 연령 미만 이용자에 대한 법정대리인 동의/적법한 교육기관
권한 조건을 명확히 쓰지 않았다.

`/terms`에 아래 취지의 조항을 추가하고 실제 운영 방식과 일치하는지 검토한다.

> 동의 가능 최소 연령 미만 학생은 법정대리인의 확인 가능한 동의 또는 학교와
> 교사의 적법한 교육 목적 권한 아래에서만 서비스를 이용할 수 있으며, 필요한
> 권한이나 동의를 확보할 수 없는 경우 서비스를 이용할 수 없습니다.

법률 문구이므로 최종 문장은 운영자 또는 법률 검토 후 확정한다.

### 6. reviewer 원문 비밀번호

운영에는 password hash만 있으므로 원문 비밀번호를 복구할 수 없다. 심사 양식의
`[TEST PASSWORD]` 자리에 실제로 알고 있는 reviewer 비밀번호를 입력한다.

비밀번호를 모르면 다음 순서로 재발급한다.

1. `npm run canva:reviewer:generate`로 새 비밀번호와 hash를 생성한다.
2. 새 hash를 production `CANVA_REVIEWER_PASSWORD_HASH`에 반영한다.
3. production 재배포 후 reviewer 로그인을 직접 확인한다.
4. 원문 비밀번호는 Canva 티켓의 테스트 계정 항목에만 입력하고 저장소에는 남기지
   않는다.

### 7. Integration 이름

현재 Integration 이름이 `캔바`로 표시된다. Canva 공식 서비스로 오해될 수 있으므로
Developer Portal에서 `Aura Board` 또는 `Aura Board for Canva`로 변경하는 것을
권장한다.

## 심사 테스트 순서

1. `https://aura-board.com/login?review=canva`에서 reviewer 계정으로 로그인한다.
2. `https://aura-board.com/board/board-mrirxqwp`를 연다.
3. 상단 설정에서 Canva 계정을 연결한다.
4. 보드의 `test` 섹션 메뉴에서 `Canva에서 가져오기`를 실행하고 폴더와 디자인을
   선택한다.
5. 가져온 카드의 제목, 썸네일, 미리보기를 확인한다.
6. 약관 대응 방식 확정 후 허용된 방식으로 PDF를 내보낸다.
7. `Canva 폴더로 정리`를 실행하고 Canva 폴더 이름이 섹션명 `test`로 생성되는지
   확인한다.
8. 설정에서 Canva 연결을 해제하고 새로고침 후 연결 해제 상태를 확인한다.
9. 계정 삭제 revoke 수정 후 별도 테스트 계정으로 계정 탈퇴도 검증한다.

## 양식 Yes/No 상태

| 질문 | 현재 답 | 제출 전 목표 |
| --- | --- | --- |
| Canva API/Developer Terms 준수 | 보류/No | PDF·아동 조항 확정 후 Yes |
| OWASP Top 10 검토 | Yes | Yes (내부 코드 검토, pen test 아님) |
| 30일 내 token revoke 및 개인정보 삭제 | No | 계정 삭제 revoke 수정 후 Yes |
| client secret 암호화 저장 | Yes | Yes |
| SSO | No | No |
| SAML | No | No |
| 전담 보안팀 | No | No |
| vulnerability disclosure/bug bounty | No | No |
| 제3자 연결 필요 | Yes | Yes |
| redirect/webhook 도메인 소유 | Yes | Yes |
| webhook 서명 검증 | No/N/A | No - Canva webhook 미사용 |

Pen test 날짜는 실제 외부 침투 테스트가 없으므로 비워 둔다.

## 양식에 사용할 운영 정보

- Company/developer name: `Aura`
- Technical contact: `Sim Boseung (심보승), mallagaenge@gmail.com`
- User support: `Aura Support, https://aura-board.com/support, mallagaenge@gmail.com`
- Terms: `https://aura-board.com/terms`
- Privacy: `https://aura-board.com/privacy`
- Security contact: `mallagaenge@gmail.com`, `https://aura-board.com/support`
- Normal traffic: `Average below 0.1 RPS; observed peak about 2 RPS; expected peak below 5 RPS`
- Hosting: Vercel web/backend (`icn1`), Supabase PostgreSQL/Storage
- Authentication: Auth.js/NextAuth + Prisma

## 관련 파일

- `docs/canva-submission-response.md`: questionnaire 복사용 영문 초안
- `docs/canva-review-checklist.md`: 내부 기능·보안 검증 체크리스트
- `src/lib/canva.ts`: OAuth, token refresh/revoke, design/folder API
- `src/lib/canva-token-crypto.ts`: OAuth 비밀값 암호화
- `src/app/api/export/canva-pdf/route.ts`: PDF 처리 방식
- `src/app/api/teacher/me/route.ts`: 계정 삭제 revoke 보완 대상
- `src/app/terms/page.tsx`: 아동 이용 조건 보완 대상
- `src/app/privacy/page.tsx`: Canva 데이터 수집·삭제·보관 고지

## 집에서 이어갈 권장 순서

1. 원격 `main`을 최신 상태로 가져온다.
2. 이 문서의 제출 차단 항목 3~5를 구현하거나 정책을 확정한다.
3. `docs/verification-checklist.md` 기준으로 연결, PDF, 폴더, 해제, 계정 삭제를
   운영에서 다시 확인한다.
4. reviewer 원문 비밀번호와 Canva OAuth 승인 계정을 준비한다.
5. Developer Portal에서 Integration 이름과 scope를 정리하고 Save한다.
6. `docs/canva-submission-response.md`의 영문 문구를 최종 양식에 붙여 넣는다.
7. 모든 Yes/No 항목이 실제 구현과 일치하는지 마지막으로 대조한 뒤 Submit한다.

## 공식 참고

- Canva submission checklist: `https://www.canva.dev/docs/connect/submission-checklist/`
- Canva scopes: `https://www.canva.dev/docs/connect/appendix/scopes/`
- Canva authentication: `https://www.canva.dev/docs/connect/authentication/`
- Canva security recommendations: `https://www.canva.dev/docs/connect/guidelines/security/`
- Canva brand guidelines: `https://www.canva.dev/docs/connect/guidelines/brand/`
- Canva Developer Terms: `https://www.canva.com/policies/canva-developer-terms/`
