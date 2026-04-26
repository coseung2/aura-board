# Doc Updates — parent-redesign (phase11)

## 업데이트 대상

| 문서 | 변경 |
|---|---|
| docs/architecture.md | "Parent Redesign (OAuth + Dashboard)" 섹션 신설 |
| docs/current-features.md | "학부모 OAuth + 통합 대시보드" 섹션 신설 |
| docs/design-system.md | --color-oauth-google / --color-oauth-kakao 토큰 추가 (옵션) |

## 회고 (3줄)

### 잘된 점
- 사용자 의도를 phase0~9 에서 한 번도 drift 없이 유지 — OAuth/대시보드/자랑해요/추가자녀/5탭 통합 모두 사용자 발화 1:1 매핑
- pure HMAC 모듈(parent-oauth-state.ts) 분리로 server-only 의존 없이 8 unit tests — student-portfolio 의 portfolio-acl-pure 패턴 재사용 (다음 task 도 적용)
- 5탭 페이지 삭제 X redirect 유지 — backwards safety, 외부 deep-link 잔존 대비

### 아쉬운 점
- 라이브 OAuth 검증 불가 — 사용자가 콘솔 등록 + env 4개 추가해야 가능. 자동화 어려움
- placeholder email 처리 — Kakao email 거부 케이스 별도 task 필요 (이메일 발송 시 도메인 skip)
- 학부모 OAuth 플로우의 ParentSession 멀티 디바이스 처리 — 현재는 새 세션 매번 발급, 기존 살아있어도 keep. 명확히 해야 (별도 task)

### 다음 task 적용
- pure / server-only 분리 패턴 — 모든 인증/권한 헬퍼는 pure 함수 분리해 단위 테스트
- redirect 유지 (페이지 삭제 X) — backwards safety 가 user trust 에 핵심
- magic-link / OAuth 같은 fallback 병행 출시 — 안정화 안전망
