# 모바일 테넌시 1,000명 부하 시험

시험일: 2026-08-09 KST  
대상: `https://aura-board.com` 공개 모바일 API  
기준 환경: Oracle A1 단일 인스턴스(2 OCPU, 12 GB), Next.js, Rust play engine, Supabase PostgreSQL

## 결론

배포 중인 기준선은 **1,000명 혼합 동시 접속 기준을 통과하지 못했다**. 게시물·댓글·좋아요와 테넌트 격리는 정상적으로 동작했지만, 펫 홈, 그림자연합 명령, 오목 매칭이 포화되면서 게임 재시도가 전체 서버 부하를 증폭했다.

이 변경 세트는 관측된 병목을 리팩터링했고 웹·모바일 타입 검사, 320개 Vitest 파일(1,697개 테스트), Rust 워크스페이스 53개 테스트, Next.js 프로덕션 빌드, nginx 문법 검사를 통과했다. 다만 변경 코드는 아직 운영에 배포하지 않았으므로 **운영 1,000명 재시험 결과는 배포 후 별도로 확정해야 한다**.

## 시험 모델

- 50개 격리 학급, 학급당 학생 20명, 총 학생 세션 1,000개
- 20초 램프업
- 각 학생이 실제 Bearer 세션으로 공개 API 호출
- 게시판 열기, 스냅샷 읽기, 게시물 작성, 댓글 작성, 좋아요
- 펫 홈과 학급 펫 화면 열기
- 그림자연합 합류, 준비, 시작, 숫자 제출
- 오목 사람 매칭, 대국 보드 열기, 세션 읽기, 양측 착수
- 다른 학급의 일반 보드·그림자연합·오목 로비 접근 차단 확인
- 마지막에 1,000개 세션이 읽기·쓰기를 섞어 보내는 혼합 구간

합격 기준은 전체 오류율 1% 이하, 테넌트 누출 0건, 핵심 기능별 99% 이상 성공, 성공한 읽기 p95 1.5초 이하, 쓰기 p95 2.5초 이하로 잡았다.

## 운영 기준선 결과

실행 시각: 2026-08-09 05:17–05:29 KST

| 항목 | 결과 |
| --- | ---: |
| 전체 요청 | 56,178 |
| 전체 오류 | 41,480 (73.84%) |
| 성공한 읽기 p95 | 22.78초 |
| 성공한 쓰기 p95 | 26.51초 |
| 학생 로그인 | 1,000 / 1,000 |
| 게시물 작성 | 1,000 / 1,000 |
| 댓글 작성 | 1,000 / 1,000 |
| 좋아요 | 1,000 / 1,000 |
| 펫 홈 | 210 / 1,000 |
| 학급 펫 화면 | 853 / 1,000 |
| 그림자연합 합류(복구 후) | 7 / 1,000 |
| 그림자연합 준비 | 4 / 1,000 |
| 그림자연합 시작 | 0 / 50 학급 |
| 오목 매칭 완료 | 2 / 1,000 |
| 테넌트 누출 | 0건 |

주요 오류는 Cloudflare 525 33,459건, 클라이언트 시간초과 4,260건, play engine unavailable 2,010건이었다. 부하가 끝난 뒤 `/api/health`는 다시 200을 반환했으므로 영구 장애가 아니라 포화에 의한 가용성 저하였다.

## 관측된 병목과 변경

### 펫

- 펫 홈이 같은 학생의 `StudentSlime`을 두 번 조회하던 경로를 한 번으로 합쳤다.
- 보행 칭호 집계가 같은 일별 통계를 세 번 읽던 부분을 materialized CTE 한 번으로 바꿨다.
- 칭호 조회를 나머지 홈 조회와 병렬 실행한다.
- 같은 학급 20명이 동일한 통화 라벨을 반복 조회하지 않도록 15초 단일비행 캐시를 추가했다.
- 학급 펫 화면은 같은 학급의 동시 요청을 2초 단일비행 캐시로 합친다. 1,000명 시험 모델에서는 최대 1,000개의 동일 계열 쿼리를 약 50개의 고유 학급 조회로 줄일 수 있다.

### 댓글

댓글 보상에 지갑 계정만 있으면 충분한데 카드 계정까지 강제로 준비하던 경로를 제거했다. 이미 학생 계정이 있으면 댓글 쓰기 핫패스에서 은행 카드 프로비저닝을 수행하지 않는다.

### 그림자연합

- 보드 조회 직후 명령을 보낼 때 세션→보드 검증 스냅샷을 다시 읽던 중복 upstream 호출을 짧고 제한된 캐시로 제거했다. 캐시 누락·만료·불일치 시에는 기존 권한 검증으로 되돌아간다.
- 다른 학생의 합류·준비로 세션 버전이 바뀌었더라도, 로비에서 자기 상태가 아직 미적용인 `join`/`ready`만 안전하게 오래된 버전을 허용한다. 호스트 명령과 이미 적용된 자기 명령은 계속 버전 충돌로 거부한다.
- 모바일의 겹치는 새로고침을 하나의 요청으로 합치고, 버전 충돌 스냅샷을 실제 성공으로 오인하지 않도록 수정했다.

### 오목

- 매칭 한 건을 만들 때 엔진에 `create + ready + ready + start` 네 번 호출하던 흐름을 `autoStart` 세션 생성 한 번으로 줄였다.
- 학급별 advisory lock 안에서 하던 학급 소유자 및 학생 표시 이름 조회를 잠금 밖으로 이동했다.
- 대기 상태 폴링은 매번 DB heartbeat를 쓰지 않고, 마지막 요청이 10초 이상 오래된 경우에만 갱신한다.
- 모바일에서 실시간 이벤트·heartbeat·fallback이 겹쳐도 매칭 조회는 하나만 진행한다.
- 부하 러너의 오목 폴링은 제한 없는 재시도 대신 최대 횟수와 지수 백오프를 사용한다. 기준선에서 발생한 33,885건의 실패 폴링 재시도 폭풍을 재현하지 않도록 했다.

### 런타임과 프록시

- Rust play engine DB 풀을 환경변수로 조정 가능하게 하고 운영 unit 기본값을 16으로 설정했다.
- play engine CPUQuota를 100%에서 150%로 조정했다.
- nginx가 일반 API 요청에도 `Connection: upgrade`를 강제하던 설정을 제거했다.
- nginx→Next.js upstream에 keep-alive 64를 설정했다.

## 검증 결과

- 핵심 변경 경로 Vitest: 38 / 38 통과
- 전체 Vitest 샤드 실행: 320개 파일, 1,697개 테스트 통과
- 웹 TypeScript: 통과
- 모바일 TypeScript: 통과
- Rust 1.95 워크스페이스: 53개 테스트 통과
- `cargo fmt --check`: 통과
- Next.js 16.2.7 프로덕션 빌드: 통과
- nginx 임시 고포트 구성 `nginx -t`: 통과
- 테스트 종료 후 운영 `/api/health`: 200, database reachable
- 합성 학급·학생·보드·게임 세션·계정·펫·멱등성 영수증: 삭제 및 0건 확인

## 배포 후 재시험

표준 Oracle 배포로 Next.js와 Rust artifact를 먼저 반영한다. 현재 정규 artifact 배포는 systemd unit과 nginx 사이트 설정을 덮어쓰지 않으므로 이번 설정 변경은 운영자 권한으로 한 번 적용해야 한다.

```bash
sudo install -o root -g root -m 0644 \
  infra/oracle/aura-play-engine.service \
  /etc/systemd/system/aura-play-engine.service

sudo install -o root -g root -m 0644 \
  infra/oracle/nginx-aura-board.conf \
  /etc/nginx/sites-available/aura-board

sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart aura-play-engine.service aura-board-app.service
sudo systemctl reload nginx
```

일회성 합성 학급과 학생을 준비한 뒤 다음 명령으로 같은 시나리오를 실행한다. 자격 증명은 명령행 기록에 남기지 말고 환경 파일이나 보호된 CI secret으로 주입한다.

```bash
LOADTEST_RUN_ID='<synthetic-run-id>' \
LOADTEST_TEACHER_USERNAME='<synthetic-teacher>' \
LOADTEST_TEACHER_PASSWORD='<secret>' \
LOADTEST_PROFILE=full \
LOADTEST_CLASSROOMS=50 \
LOADTEST_STUDENTS_PER_CLASS=20 \
LOADTEST_ARRIVAL_MS=20000 \
LOADTEST_MIXED_ACTIONS=4 \
npm run loadtest:mobile-tenancy
```

결과 JSON은 기본적으로 `tmp/loadtests/`에 저장된다. 운영 재시험에서는 전체 오류율, 기능별 성공률, p95, 525/503/timeout 수, PostgreSQL 연결·잠금 대기, Oracle CPU·메모리를 기준선과 함께 비교한다.
