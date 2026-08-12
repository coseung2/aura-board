# 2026-08-12 — rls-public-tables-outage

| 항목 | 값 |
|---|---|
| severity | high |
| 발생 | 2026-08-12 저녁 (Supabase 조치 후 사용자 보고) |
| 해결 | 2026-08-12 (정책/shim 보완 후 운영 확인) |
| 소요 | 당일 |

## 증상

Supabase RLS 조치 직후 일부 기능이 동작하지 않아 사용자가 장애를 보고했다
("왜 고장나있어?"). 공개 테이블 조회가 거부되는 형태였다.

## 근본 원인

커밋 `e7133f91` `security(db): enable RLS on public tables without policies`
에서 공개 테이블에 **정책 없이** RLS만 활성화해 기존 쿼리 경로(anon/authenticated
SELECT 포함)가 차단됐다. RLS 활성화와 정책/접근 경로 보완이 한 번에 이뤄지지
않아 발생한 전환 회귀.

## 수정

- 기존 Supabase shim/접근 경로를 RLS 정책 기준에 맞게 보완(작업 완료).
- 이후 로그인·OAuth·헬스 체크(`/api/health`, capabilities) 운영 정상 확인.

## 영향

공개 테이블을 읽는 기능 전반(일시). 데이터 손실 없음.

## 재발 방지

- RLS 활성화는 "정책 + 접근 경로 검증"과 같은 배포 단위로 진행한다.
- RLS 마이그레이션 적용 직후 공개 경로(로그아웃 상태)와 인증 경로를 각각
  스모크 테스트한다.
