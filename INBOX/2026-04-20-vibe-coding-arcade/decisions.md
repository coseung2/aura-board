# Phase 3 — Decisions: 학급 Steam (vibe-coding-arcade)

> task_id: `2026-04-20-vibe-coding-arcade`
> 작성일: 2026-04-20
> 에이전트: interview-facilitator
> 입력: `phase0/request.json` · `phase1/exploration.md` · `phase2/sketch.md`
> 방침: 자율 진행 / 품질 우선 / 갤럭시 탭 S6 Lite / 초중등 안전 / padlet 읽기 전용
> MCP 상태: **Ouroboros interview MCP 미가용** — 폴백 모드(`session_id.txt` 참조)

---

## 0. 인터뷰 운영 요약

Ouroboros interview MCP가 현 worktree에서 로드 불가로 확인되어 phase3 계약서 에스컬레이션 규칙("MCP 복구 불가 — 재시도 2회 실패")을 발동. 폴백으로 **phase2 sketch의 기본값을 후보 A로 고정**하고, 각 미결 항목에 대해 다음 3단 평가를 수행:

1. **라우팅 판정** — 에이전트 자율 답변 가능인지, 사용자 확정 필요인지
2. **증거 체인** — phase0 동기 / phase1 탐색 / phase2 전제(D-1~D-8) / 기존 Seed(2·5·11·12) / tablet-performance-roadmap §2·§2a
3. **ambiguity 기여도** — 해당 결정이 미해소 시 phase4 seed ambiguity에 미치는 영향

결과: **11건 결정** (7건 자율 · 4건 "사용자 확정 대기 — 기본값 적용"). 방침 "자율 진행"에 따라 4건도 phase4 seed 생성을 막지 않고 sketch 기본값을 일단 고정. 실제 런칭 전(phase5 integrate 또는 padlet 구현 직전) 사용자 확정 필요 체크리스트로 이관.

---

## 1. 결정 목록

### D-PHASE3-01. 모더레이션 정책 기본값 (sketch Q1)

- **라우팅**: 사용자 확정 필요 (UX 규범 · 초중등 안전 · 교사 운영 부담 트레이드오프)
- **기본값 적용 (사용자 확정 대기)**: `teacher_approval_required` (phase2 D-기본값)
- **근거**:
  - phase0 `known_constraints[4]`: "프롬프트·결과물 모더레이션 필요 — 초중등 대상 AI 생성물 노출 위험(욕설·폭력·개인정보) 대비 필수"
  - phase2 R-2 (극심 리스크): "Sonnet이 부적절·폭력적·성인 콘텐츠 생성 — 초중등 대상 사고 발생 시 서비스 종료"의 최종 방어선이 교사 승인 게이트
  - 방침 메모리: **품질 우선** · 초중등 안전 중시
  - 교사 부담 30명×주3작품=90건/주는 R-7 완화책(자동 1차 필터 + 키보드 단축키 A/R)으로 분산
- **대체안 기각**: (B) `auto_publish` — R-2 극심 리스크 무방비 노출. (C) 하이브리드 "첫 5개 승인 후 자동" — 신뢰 등급 설계 복잡 · v1 스코프 과다
- **ambiguity 기여**: 0.03 (사용자 최종 확인 전까지 미확정 항목)

### D-PHASE3-02. VibeSession.messages 대화 로그 보존 기간 (sketch Q2)

- **라우팅**: 에이전트 자율 (기존 Seed 12 감사 로그 관례 승계 — 일관 정책 적용)
- **결정**: **Free=1학기(4개월) · Pro=학년(12개월) · 그 후 studentId → null 익명화 유지**
- **근거**:
  - Seed 12 assessment-autograde 감사 로그 관례: "Free=1학기 Pro=학년" (phase2 R-9 완화안 인용)
  - R-9 완화: 7일 미활성 자동 익명화는 phase2 sketch 제안 그대로 채택
  - 영구 보관(옵션 D)은 초중등 개인정보법 리스크 · 휘발(A)은 감사 불가
  - 한국 교육청 개인정보 운영 지침: 교육 목적 보관 기간 "학년 1년" 관례
- **구현 힌트**:
  - cron: daily 00:10 KST — `endedAt < now-7d AND studentId IS NOT NULL` → studentId=null, classroomId 유지
  - cron: weekly — Free tier `createdAt < now-120d` 하드 삭제 / Pro tier `createdAt < now-365d` 하드 삭제
- **ambiguity 기여**: 0.01

### D-PHASE3-03. 리뷰 작성자 표시 방식 (sketch Q3)

- **라우팅**: 사용자 확정 필요 (학급 문화·집단 괴롭힘 정책 — UX 규범)
- **기본값 적용 (사용자 확정 대기)**: `named` (실명·번호 노출 / 교사는 항상 원ID)
- **근거**:
  - phase2 sketch VibeArcadeConfig 기본값 = `"named"`
  - R-10 리뷰 악성 사용 완화책: 실명 책임으로 1점 폭탄·집단 비하 억제
  - Scratch Teacher Account 관례와 정합 (학급 스튜디오 댓글 실명)
  - 신고 3건 자동 hidden + 욕설 regex 차단 + 교사 대시보드 리뷰 탭이 보조 안전장치
- **대체안 기각 조건부**:
  - (B) 전면 익명 — 악성 리뷰 유인 · 책임 소재 불명
  - (C) `hidden_to_peer` (동료에겐 익명, 작성자·교사는 이름) — 설계 복잡 · v1.5 파킹
- **ambiguity 기여**: 0.04 (사용자 확정 대기)

### D-PHASE3-04. 리뷰 평가 시스템 (sketch Q4)

- **라우팅**: 사용자 확정 필요 (UX 규범 — 초등 저학년 이해도 vs 정보량)
- **기본값 적용 (사용자 확정 대기)**: `stars_1_5` (1-5 별점)
- **근거**:
  - phase2 sketch 기본값 · phase1 §3 UX 레퍼런스 (itch.io·Steam·Scratch 관습)
  - 대상 학년 = 초등 고학년~중등(phase0 `target_user[0]`) — 5점 별점 이해 가능
  - 카탈로그 정렬 "별점 평균" 기준으로 itch.io "Top Rated" UX 복제 용이
  - 이진(👍/👎)은 초등 저학년 확장 시 v1.5 옵션으로 파킹 (config 값 `thumbs`)
- **대체안 기각 조건부**:
  - (B) 👍/👎 이진 — 정보량 축소 · 카탈로그 정렬 모호
  - (C) 이모지 5종 😡😕😐🙂🤩 — 감정 과잉 표출 · 저학년 "재미" 편향 가능 · v2 A/B 테스트 파킹
- **ambiguity 기여**: 0.02 (사용자 확정 대기이나 선택지 간 스키마 영향 미미)

### D-PHASE3-05. Remix 기능 v1 포함 여부 (sketch Q5)

- **라우팅**: 에이전트 자율 (스코프 축소 결정 · 저작권·원작자 모욕 리스크 · 기존 설계와 충돌 없음)
- **결정**: **v1 제외 · v2 파킹** (`VibeArcadeConfig.allowRemix` 기본 `false`, `VibeProject.remixedFromId` FK v1에 추가하지 않음)
- **근거**:
  - phase2 R-4 저작권 완화 전략이 "v1은 교육 가이드만 · 기술적 감지 v1.5+"로 점진 도입 방침
  - Remix 시 원작자 표시 의무·Fork 트리 UI·리뷰 집계 분리 등 설계 복잡 증가 (Seed 11·12 스코프 대비 과다)
  - phase1 §2-F Glitch UX 교훈은 "v1.5 메뉴로 차용 파킹" 명시
  - v1 범위 제한 = 스코프 방어 (신규 엔티티 6종 내 유지)
- **구현 힌트**: v2 설계 시 `VibeProject.remixedFromId String?` 추가 · `VibeProject.remixChain` 역관계 · 원작자 표시는 카드 상단 "🔀 {원작자}의 작품을 리믹스" 배지
- **ambiguity 기여**: 0.00 (자율 결정 · 영향 국지)

### D-PHASE3-06. 결과물 실행 형식 제한 (sketch Q6)

- **라우팅**: 에이전트 자율 (기술 스택 · 태블릿 성능 예산 · 보안 분석 — phase1 선결 제약 승계)
- **결정**: **v1 = 단일 HTML + inline JS/CSS + 외부 CDN 화이트리스트 (jsdelivr·cdnjs·unpkg)**
- **근거**:
  - phase1 D-2·D-3 전제 고정 ("Claude Artifacts 패턴 — 단일 HTML")
  - tablet-performance-roadmap §2: 번들 <500KB gzip · TTI <3s. Pyodide ~10MB 로드는 §2 예산 파괴 (R-6)
  - WASM 업로드는 보안 분석 불가 · 서버 파서 스캔 우회 가능 (R-11 확장 리스크)
  - phase1 §4 보안 스택 CSP `frame-src 'none'` · 외부 iframe 블랙리스트 태그 스캔 전제
- **CDN 화이트리스트 v1 확정**:
  ```
  https://cdn.jsdelivr.net
  https://cdnjs.cloudflare.com
  https://unpkg.com
  ```
  (게임 라이브러리 Phaser·p5.js·Three.js 등 주요 CDN 커버. HTTP-only, subresource integrity 필수.)
- **v2 파킹**: Pyodide는 Python 교과 연계 피드백 누적 시 별도 보드 레이아웃 `vibe-arcade-python`으로 분리(성능 예산 분리 관리)
- **ambiguity 기여**: 0.00

### D-PHASE3-07. 학급 간 공유 범위 (sketch Q7)

- **라우팅**: 사용자 확정 필요 (큰 방향 · Seed 2 학교 플랜 v2 분기 예고)
- **기본값 적용 (사용자 확정 대기)**: `crossClassroomVisible = false` (반 내부만 v1)
- **근거**:
  - phase2 D-5 전제: "Classroom 스코프 격리" (신규 유저/조직 엔티티 0)
  - 운영 단위 = 학급 (phase0 `known_constraints[3]`: "전교·전사 확장은 v2+")
  - Pro tier 5반 혜택은 Seed 2 설계 범위라 동일 교사 다반 공유는 v1.5 파킹 (config만 토글 가능하게 필드 유지)
  - 학교 단위 공유(C)는 학교 플랜 신설 필요 → v2+
  - 사용자 확정 대기 이유: Pro tier 교사 중 "5개 반 모두 같은 아케이드 풀 쓰고 싶다"는 피드백 강도에 따라 v1.5 우선순위 상승 가능
- **ambiguity 기여**: 0.03

### D-PHASE3-08. 학생 일일 토큰 한도 (sketch 인수인계에서 "에이전트 즉결"로 제거됐으나 재확인)

- **라우팅**: 에이전트 자율 (성능·비용 예산 — phase1 §6 계산 기반)
- **결정**: **`perStudentDailyTokenCap = 45000` · `classroomDailyTokenPool = 1500000`**
- **근거**:
  - phase1 §6 원단가: IN 3K + OUT 12K ≈ 15K / 세션 × 3세션 = 45K / 학생 / 일
  - 학급 30명 × 3세션 × 15K ≈ 135만. 여유 10% 포함 150만 / 학급 / 일
  - 방침 "**잉여 쿼터 소진**" 원단가: 교사 계정 월 할당의 잉여분 → 학급 한도로 재분배
  - 자정 리셋 KST (한국 학교 기준) — phase2 §4-2 명시
  - 교사 대시보드 슬라이더로 교사 조정 허용 (phase2 §2-3 탭2)
- **ambiguity 기여**: 0.00

### D-PHASE3-09. 쿼터 소진 대응 정책

- **라우팅**: 에이전트 자율 (정책 일관성 — 전제 위반 금지)
- **결정**: **학생 일일 한도 소진 → "오늘치 소진, 내일 다시 시도" 모달 + 학급 풀 소진 → 관리자 알림 + 신규 세션 차단 (기존 세션 종료까지만 허용)**
- **근거**:
  - phase0 `known_constraints[1]` 제약: "Claude Sonnet 전용 — Haiku·Opus 교체 불가" (동기 파괴 방지)
  - phase1 §9 "Haiku 다운그레이드는 전제 위반이므로 금지" 명시
  - phase2 §2-1 [2] 플로우 "다운그레이드 없음" 명시
- **ambiguity 기여**: 0.00

### D-PHASE3-10. VIBE_ARCADE 구조 (sketch 인수인계에서 D-4로 이미 결정됐으나 인터뷰 단계에서 확인)

- **라우팅**: 에이전트 자율 (phase2 D-4 전제 고정 — 재논의 금지)
- **결정**: **`Board.layout="vibe-arcade"` enum 확장 + `VibeArcadeConfig` 1:1 분리** (phase2 D-4·1-2 확정)
- **근거**: phase2 D-4 고정 전제. Seed 3·6·11·12 관례 승계. 신규 BoardType 금지.
- **ambiguity 기여**: 0.00

### D-PHASE3-11. 태그 시스템 (sketch §1-3 VibeProject.tags 주석에서 "에이전트 즉결"로 명시된 건 확인)

- **라우팅**: 에이전트 자율 (UX 단순화 · v1 스코프 방어)
- **결정**: **v1 = 고정 태그 5종** — `"게임" | "퀴즈" | "시뮬" | "아트" | "기타"` (학생이 하나 선택 · 복수선택 v2)
- **근거**:
  - phase2 §1-3 주석에서 기본 태그 5종 제안됨
  - 자유 태그 허용 시 모더레이션 부담 추가 (욕설·개인정보 태그 리스크)
  - 복수 태그·태그 필터 UX는 v1.5 파킹
- **ambiguity 기여**: 0.00

---

## 2. 새로 드러난 분기 (현재 세션 편입 금지 — v2+ 파킹)

phase3 검토 중 새로 인식된 설계 분기. 본 시드 스코프에 **편입하지 않고** v2 이후로 파킹.

### F-1. 학생 신뢰 등급 시스템 (선형 승인 자동화)

Q1의 하이브리드 옵션(C) "첫 5개 승인 후 자동"은 선형 신뢰 등급이 필요 — `Student.vibeTrustTier ∈ {new, trusted, flagged}` · 교사 수동 지정 또는 자동(승인 10회 + 신고 0회). R-7 교사 부담 완화 후속 수단. v1.5 또는 v2.

### F-2. "좋아요 화폐" 인센티브 (StudentAccount 연동)

phase2 §4-4에서 언급된 아이디어. 리뷰 별점 5점 주면 작성 학생에게 학급 화폐 N원 자동 지급. StudentAccount(학급화폐) Seed와의 통합 — 신규 스코프이므로 별도 시드 또는 Seed 11 assessment-autograde 후속 시드로 분리.

### F-3. 학부모 자녀 작품 열람 (Seed 7 parent-viewer v2 매트릭스 행 추가)

phase2 §4-4에서 "parent-viewer-roadmap §5에 행 추가 (phase5 integrate)"로 예고됨. 본 시드 phase5에서 `parent-viewer-roadmap.md` 또는 `seeds-index.md` Seed 7 섹션에 `vibe-arcade-child-view` 행 추가 — integrator 에이전트가 처리.

### F-4. Remix 기능 v2 설계

D-PHASE3-05로 v1 제외 확정이지만 향후 설계 힌트: `VibeProject.remixedFromId String?` · 원작자 표시 배지 · 리뷰 집계 분리 정책(원작자 vs 리믹서).

### F-5. "학급 Best Of" 주간 자동 선정 + 학기말 포트폴리오 PDF

phase2 §4-4 canva-assignment-pdf-merge 스킬 재활용 아이디어. 주간 상위 3작품 자동 선정 + 학기말 학생별 "내 바이브 코딩 포트폴리오" Canva 템플릿 Autofill → PDF. v2 파킹.

### F-6. Python(Pyodide) 보드 분리

D-PHASE3-06 v2 파킹 — 별도 layout `vibe-arcade-python`으로 성능 예산 분리. Python 교과 연계 피드백 누적 시 활성화.

### F-7. 스쿨마스터 2026 연동 가능성

메모리 참조: 사용자 로컬 앱에 "스쿨마스터 2026" 설치 확인. 향후 교사 대시보드에서 학생 명단·출석 연동 가능성 있음 — 본 시드 스코프 밖이나 관찰 가치.

---

## 3. 사용자 확정 대기 체크리스트 (phase5/6 또는 런칭 전)

MCP 미가용으로 AskUserQuestion 루프를 돌 수 없어 sketch 기본값으로 고정했으나, **실제 런칭 전** 사용자 확정 권장 항목:

| # | 항목 | 기본값 | 확정 필요 시점 | 영향 필드 |
|---|---|---|---|---|
| U-1 | 모더레이션 정책 초기값 | `teacher_approval_required` | padlet phase0 request.json 작성 전 | `VibeArcadeConfig.moderationPolicy` |
| U-2 | 리뷰 작성자 표시 | `named` | UX 와이어프레임 최종화 전 | `VibeArcadeConfig.reviewAuthorDisplay` |
| U-3 | 리뷰 평가 시스템 | `stars_1_5` | UX 와이어프레임 최종화 전 | `VibeArcadeConfig.reviewRatingSystem` |
| U-4 | 학급 간 공유 범위 | `false` (반 내부만) | Seed 2 학교 플랜 v2 설계 전 | `VibeArcadeConfig.crossClassroomVisible` |

4건 모두 **설정 필드로 이미 구조화돼 있어** 기본값 변경이 스키마 변경이 아님 — 런칭 후에도 교사 대시보드에서 개별 학급 단위 조정 가능. 따라서 phase4 seed 생성 차단 사유 아님.

---

## 4. Ambiguity 자체 평가

**Ambiguity 점수 집계**: 0.03 + 0.01 + 0.04 + 0.02 + 0.00 + 0.00 + 0.03 + 0.00 + 0.00 + 0.00 + 0.00 = **0.13**

**기준**: ≤ 0.2 (phase4 seed 게이트)
**판정**: **통과**

**근거**:
- 11건 중 7건 에이전트 자율 결정 (증거 체인 명확 · ambiguity 기여 0)
- 4건 사용자 확정 대기이나 sketch 기본값이 phase0 동기 · phase1 탐색 · 초중등 안전 원칙에 정합
- 4건 모두 Config 필드 단일 변경으로 전환 가능 — 스키마 변경 없이 운영 단계에서 조정 가능
- 새로 드러난 분기 7건은 **현재 세션 편입 금지** 원칙 준수 (v1.5 · v2 · 별도 시드로 분리)

**Ready for Seed generation**: YES

---

## 5. phase4 seed 입력 요약

Ouroboros `generate_seed` 호출 시 필수 맥락:

1. **8 고정 전제** (phase2 D-1~D-8) — 재논의 금지
2. **11 신규 결정** (본 파일 §1) — 7 자율 + 4 사용자 확정 대기(기본값 적용)
3. **신규 엔티티 6종** + `Board.layout` enum 확장 1 (phase2 §1)
4. **리스크 11건** (phase2 §5) — R-1·R-2·R-3·R-5·R-6·R-8·R-11 완화 설계 완료, R-4·R-7·R-9·R-10 정책 결정 본 파일 연결
5. **성능 예산** tablet-performance §2·§2a·§2b (phase2 §3)
6. **파킹 분기 7건** (본 파일 §2) — seed 본문에 parking 섹션으로 기록
7. **사용자 확정 대기 4건** (본 파일 §3) — seed의 "Future decisions needed" 섹션

---

## 6. 자가 검증 (시드 게이트 사전 점검)

- [x] ambiguity ≤ 0.2 (0.13 달성)
- [x] 각 결정에 근거 기록 (phase0/phase1/phase2/Seed 인용)
- [x] 새로 드러난 분기는 별도 섹션 분리 (현재 세션 편입 없음)
- [x] 사용자 확정 필요 항목은 별도 체크리스트 분리
- [x] phase2 D-1~D-8 전제 재검토 없음 (고정 유지)
- [x] 에스컬레이션 조건 해당 — MCP 복구 불가 폴백 문서화 (session_id.txt)
- [x] 신규 엔티티 ≤ 10 (6종 유지)
- [x] "Ready for Seed generation": YES
