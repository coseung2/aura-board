# Aura Board

Aura Board는 교실 활동을 카드 기반 보드로 모으고, 학생·교사·학부모가 각자의 권한으로 결과물을 확인하고 공유할 수 있는 학급 운영 웹앱입니다.

단순한 협업 보드가 아니라 수업 산출물, 포트폴리오, 자랑해요, 과제, 식물 관찰일지, 퀴즈, 학급 경제, 발표/자료 카드까지 한 흐름에서 다루는 교육용 보드 플랫폼을 목표로 합니다.

---

## 주요 기능

- **보드와 카드**
  - 자유 배치, 그리드, 스트림, 칼럼 등 여러 보드 레이아웃
  - 이미지, 링크, YouTube, Canva, 파일, 다중 첨부 카드
  - 카드별 좋아요·댓글·작성자 표시

- **수업 산출물 관리**
  - 학생별 카드 작성과 자기 카드 수정
  - 교사용 학생 drill-down
  - 과제 슬롯과 제출 카드
  - 포트폴리오와 학급 자랑해요 갤러리

- **학급 활동**
  - 식물 관찰일지와 교사용 관찰 매트릭스
  - 퀴즈/평가, DJ 큐, 브레이크아웃 활동
  - 학급 화폐, 역할, 상점, 지갑

- **공유**
  - 보드 공유는 세분화된 보기/댓글/편집 권한 대신 **학생 권한 공유**로 통일
  - 공유 링크 방문자는 학생처럼 카드 추가 가능
  - 공유 링크로 만든 카드는 해당 공유 방문자의 카드처럼 제한적으로 수정/삭제

- **미디어 최적화**
  - 목록과 카드 그리드에서는 원본 대신 `thumbUrl`, `previewUrl`, `thumbnailUrl` 우선 사용
  - Canva, 영상, iframe은 클릭 전 실제 iframe/video를 mount하지 않음
  - Canva 카드는 클릭 전에도 썸네일과 재생 버튼을 표시
  - 업로드/생성 시점에 WebP preview를 만들고, 조회 시 반복 리사이즈나 외부 preview fetch를 피함
  - Supabase Storage 삭제는 즉시 삭제 대신 지연 cleanup queue에서 참조 검사 후 처리

---

## 인증과 권한

Aura Board는 여러 신원을 동시에 고려합니다.

- **교사**: Google OAuth 기반 NextAuth 세션
- **학생**: QR/코드 기반 HMAC 서명 쿠키
- **학부모**: 매직 링크/토큰 기반 접근
- **공유 방문자**: share token 기반 학생 권한

카드 권한은 `src/lib/card-permissions.ts`의 Identity 기반 규칙을 중심으로 처리합니다.

| 동작 | 교사 | 학생 | 학부모 | 공유 방문자 |
|---|---|---|---|---|
| 보드/카드 보기 | 가능 | 같은 학급 가능 | 자녀/허용 범위 | 공유 보드 가능 |
| 카드 생성 | 가능 | 가능 | 불가 | 가능 |
| 카드 수정/삭제 | 가능 | 자기 카드만 | 불가 | 공유로 만든 카드만 |

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 App Router |
| UI | React 19, CSS Modules가 아닌 전역 CSS + 디자인 토큰 |
| 인증 | NextAuth v5, 커스텀 학생/학부모 세션 |
| DB | Prisma 6 + PostgreSQL |
| 파일/미디어 | Supabase Storage, Sharp WebP preview |
| 검증 | Zod, TypeScript |
| 테스트 | Vitest |

---

## 모바일 Android 빌드

Aura Board 모바일 앱은 Expo 소스를 `C:\build-aura-board-android` 같은 전용
ASCII 빌드 디렉터리로 미러링한 뒤 APK/AAB를 만든다. Windows 사용자 경로에
한글이 있어도 `USERPROFILE`, `HOME`, `TEMP`, `TMP`, Gradle/Java 홈을 빌드
디렉터리 내부 ASCII 경로로 고정해 Expo prebuild와 Gradle을 실행한다.

로컬 APK/AAB 표준 절차는 `docs/mobile-android-build.md`를 따른다.

---

## 환경 변수

학생 공유 페이지(`/s/[shortCode]`, `/share/[shareToken]`)는 정적 shell에서
Supabase client로 직접 읽기/쓰기를 수행하므로 브라우저에 노출 가능한 공개
Supabase 설정이 필요합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 또는 legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 서버 측 Storage 업로드/삭제에는 `SUPABASE_SERVICE_ROLE_KEY`와
  `SUPABASE_URL` 또는 `NEXT_PUBLIC_SUPABASE_URL`이 필요합니다.

값 없는 템플릿은 `.env.example`을 참고하세요.

---

## 빠르게 실행하기

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

프로덕션 빌드:

```bash
npm run build
```

타입 체크:

```bash
npm run typecheck
```

테스트:

```bash
npm run test
```

---

## 데이터베이스와 시드

Prisma 명령:

```bash
npm run db:push
npm run db:reset
npm run seed
```

추가 시드:

```bash
npm run seed:plant
npm run seed:breakout
npm run seed:drawing-assets
```

프로덕션 빌드는 `prisma migrate deploy`를 먼저 실행합니다.

---

## 주요 디렉터리

```text
src/app/                  Next.js App Router 페이지와 API routes
src/components/           보드, 카드, 포트폴리오, 식물관찰 등 UI 컴포넌트
src/lib/                  권한, 인증, Storage, preview cache, 데이터 매퍼
src/styles/               전역 CSS와 화면별 스타일
src/types/                공유 DTO 타입
prisma/                   Prisma schema, migrations, seed
docs/                     아키텍처, 현재 기능, 외부 API, 디자인 시스템 문서
```

---

## 관련 문서

- `docs/current-features.md`
- `docs/architecture.md`
- `docs/design-system.md`
- `docs/mobile-android-build.md`
- `docs/external-api.md`
- `CLAUDE.md`
- `AGENTS.md`

---

## 운영 메모

- 목록 화면에서는 원본 업로드 URL보다 preview/thumbnail URL을 우선 사용합니다.
- iframe과 video는 사용자 액션 전까지 mount하지 않는 것을 기본 원칙으로 둡니다.
- Supabase Storage 삭제는 `BlobDeletionQueue`를 통해 지연 처리하며, cleanup 전에 동일 URL 참조 여부를 확인합니다.
- 외부 preview fetch와 Canva thumbnail resolve는 캐시를 우선 사용합니다.
