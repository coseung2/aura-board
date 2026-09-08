# 노래 맞히기 디자인 및 구현 인수인계

업데이트: 2026-09-08 KST. 다음 컴퓨터에서는 이 문서부터 읽는다.

## 확정된 디자인

- 교사 화면: 기존 Aura Board 디자인 시스템을 따른다.
  `src/styles/base.css`가 기준이며 `docs/design-system.md`를 함께 참고한다.
- 학생 화면: B 음악 플레이어 배치 + A 짙은 보라 배경과 4색 답변.
- 자명한 안내 문구와 홍보성 제목을 추가하지 않는다. 기능 라벨과 상태,
  사용자가 복구할 수 있는 오류 메시지만 필요에 맞게 사용한다.
- 가요는 가수·곡명, 클래식은 작곡가·쉬운 한글 곡명.
  초등 대상이므로 악장 등 세부 명칭을 주 제목에 붙이지 않는다.
- 정답 대상(곡명 / 가수 또는 작곡가 / 둘 다)과
  답변 방식(객관식 / 직접 입력)은 독립적이다.
- 객관식은 선택한 곡 수와 무관하게 보기 4개를 자동 구성한다.

[Figma 파일](https://www.figma.com/design/I74zYjs7O4bOtFAwahqfza)
· [교사 출제](https://www.figma.com/design/I74zYjs7O4bOtFAwahqfza?node-id=42-163)
· [승인 학생 화면](https://www.figma.com/design/I74zYjs7O4bOtFAwahqfza?node-id=48-3)

기존 탐색안은 Figma의 `90 · 탐색 시안 보관` 페이지에 남겼다.
새 화면은 `10 · 교사 화면`, `20 · 학생 화면` 페이지를 사용한다.
설정 탐색안 A/B/C와 이전 학생 탐색안은 구현 기준이 아니다.

## 산출물

편집 가능한 Figma 메인 컴포넌트 40개(9종), 색·간격 변수 74개,
글자 스타일 8개. 교사·학생 화면에 컴포넌트 인스턴스 147개를 사용했다.
파일 내 스타일/변수/컴포넌트/화면 ID는 [figma-manifest.json](figma-manifest.json)에 있다.

| 컴포넌트 | 상태 / 속성 |
|---|---|
| Teacher/Button | Primary / Secondary / Selected / Disabled, Label |
| Teacher/Field | Default / Focus / Error, Label / Value |
| Teacher/SongRow | Default / Selected, Title / Artist / Source |
| Student/Header | Round / Time |
| Student/Player | Playing / Submitted / Reveal, Status / Title / Detail |
| Student/Answer | 4색 × Default / Selected / Muted / Correct / Wrong, Label |
| Shared/ScoreRow | Teacher / Student, Rank / Name / Score |
| Student/Button | Primary / Secondary / Disabled, Label |
| Student/TextAnswer | Empty / Filled, Value |

인스턴스를 만들 때 텍스트 속성을 명시적으로 지정한다. Figma variant를
바꾸는 것만으로 문제별 곡명과 상태 텍스트가 바뀐다고 가정하지 않는다.
재생 중에는 Title에 질문을 사용하고 곡명·작곡가는 Reveal에서만 노출한다.
Selected는 제출 표시이며 Correct와 다르다. 정답 공개 전에는 정답을 표시하지 않는다.

### 교사 화면

| 화면 | PNG |
|---|---|
| T01 출제 준비 | [보기](screens/t01.png) |
| T02 링크로 곡 등록 + 준비/완료/실패 상태 | [보기](screens/t02.png) |
| T03 우리 반 곡 관리 | [보기](screens/t03.png) |
| T04 참가 대기 | [보기](screens/t04.png) |
| T05 게임 진행 | [보기](screens/t05.png) |
| T06 라운드 결과 | [보기](screens/t06.png) |
| T07 최종 순위 | [보기](screens/t07.png) |

### 학생 화면

| 화면 | PNG |
|---|---|
| S01 참가 대기 | [보기](screens/s01.png) |
| S02 객관식 답변 | [보기](screens/s02.png) |
| S03 답변 제출 | [보기](screens/s03.png) |
| S04 정답 결과 | [보기](screens/s04.png) |
| S05 최종 순위 | [보기](screens/s05.png) |
| S06 직접 입력 | [보기](screens/s06.png) |
| S07 오답 결과 | [보기](screens/s07.png) |
| S08 시간 종료·미응답 | [보기](screens/s08.png) |
| S09 연결 오류·다시 연결 | [보기](screens/s09.png) |

PNG는 Figma에서 직접 내보낸 정적 화면이다. 예시 이름과 점수는 데모 값이다.
디자인에 등장하는 등록/진행/결과는 실제 DB 작업을 실행한 증거가 아니다.
이번 산출물에는 실행 가능한 클릭 프로토타입이나 앱 디자인 적용이 포함되지 않는다.

## 다음 구현 작업

1. 교사 `src/components/SongGuessBoard.tsx`,
   `SongGuessBoardParts.tsx`, `SongGuessImportPanel.tsx`를 기존 토큰으로 정돈한다.
   저장과 대기실 열기를 현재 서버의 저장/세션 생성 순서에 맞춰 연결한다.
2. 학생 `src/components/SongGuessGame.tsx`, 해당 CSS와
   `apps/mobile/components/song-guess/SongGuessAnswer.tsx`에 승인 디자인을 적용한다.
   대기/현재 라운드/제출/공개/종료/재연결은 현재 authoritative snapshot을 따른다.
3. `SongGuessScoreboard.tsx`의 실제 참가자·점수·대표펫 처리를 유지한다.
   시안의 데모 행으로 실제 점수판 기능을 대체하지 않는다.
4. 링크 등록의 원본 시작 시점은 timestamp URL이 결정한다.
   시안의 구간 필드를 자유 편집 기능으로 구현하려면 현재 import API 계약부터 확인한다.
   새 길이를 허용하지 않는다: 현재 클립은 정확히 15초다.
5. 학생 정답 대상에 따라 질문과 Label을 바꾼다. 가요에는 작곡가를 필수로 요구하지 않는다.
   이미 제출했거나 시간 종료된 답은 잠그고 다음 라운드에서만 초기화한다.
6. 390px 학생 화면과 실제 태블릿/데스크톱 반응형, 긴 곡명·가수-곡명 조합,
   키보드 접근, 오디오 재생, 재접속, 저장/새로고침, 두 학급 권한 격리를 검증한다.

Figma 교사 액센트는 기존 토큰 그대로다. 작은 흰색 버튼 글자와 액센트의
대비는 기존 디자인 시스템 차원에서 검토할 항목이며, 이번에 색을 임의 변경하지 않았다.
학생 미선택 보기의 흐림은 제출/종료 후 비활성 상태에만 사용한다.

## 이번 커밋에 함께 이어지는 음악 기능

새 디자인은 미적용이지만 다음 기능 소스는 이전 작업에서 구현되어 있다.

- 웹·모바일·Rust: 객관식 4지선다, 곡명/아티스트/결합 정답, legacy text 호환.
- 교사 timestamp 링크 등록: 학급별 import queue, lease/CAS, 15초 추출,
  private storage, 상태 조회/수정/삭제/재시도/문제에 추가.
- 차트/플레이리스트 메타데이터 수집과 폴더 수집/정규화/등록 스크립트.
- 출처를 full/highlight/unknown, single/multi-track, 선택/청취 검증 상태로 분리.
- 개발 시작 시 DB 및 로그인 테이블을 검사하는 `dev:check`.

[카탈로그 관리 문서](../../song-guess-catalog.md)와
[검증 체크리스트](../../verification-checklist.md)가 상세 기준이다.

## DB·음원 상태와 남은 운영 작업

- 기존 클래식 20곡은 쉬운 한글 곡명으로 로컬 manifest와 production metadata를 수정하고
  readback했다. 원래 하이라이트 음원이므로 multi-track/highlight/uploader-highlight로 기록했다.
  예전 제목은 alias/originalTitle로 유지한다. 저장된 학급 팩의 복사된 제목은 자동 변경되지 않았다.
- 기존 20곡의 가수/작곡가 문자열은 DB에서 모두 한글로 바꾼 상태가 아니다.
  시안의 한글 작곡가 표시는 구현 시 실제 데이터와 맞춰야 한다.
- 새 클래식 후보 18곡은 `data/song-guess/classical-elementary-candidates.json`.
  timestamp metadata 검토만 완료. 아직 청취 검증·하이라이트 선정·새 음원/DB 등록을 하지 않았다.
- 멜론 주간 playlist metadata 100곡 등록 결과는 이전 세션에서 98신규/2매칭 readback.
  전체 100곡 음원 수집을 완료한 것은 아니다.
- 로컬 catalog의 나머지 576곡은 provenance legacy-unclassified이며 full로 간주하지 않는다.
- 긴 유튜브 모음 영상은 현 추출기의 전체 다운로드/크기 제한에 걸릴 수 있다.
  긴 영상의 구간 다운로드 최적화는 남은 작업이다.
- 새 artist/import migration은 isolated 개발 DB에 적용했으나 production 적용은 남아 있다.
  production 앱 배포·Python 의존성/FFmpeg 설치·recovery cron 활성화·학급 간 실검증은 미완료다.
- 운영 데이터를 추가로 수정하거나 배포하려면 대상과 현재 운영 상태를 먼저 확인한다.

## 다른 컴퓨터에서 실행

`AGENTS.md`와 `docs/verification-checklist.md`를 먼저 읽는다.
비밀 값은 복사하지 말고 Infisical 인증을 사용한다.

```powershell
npm ci
infisical.exe run --env=dev -- npm run dev:check
infisical.exe run --env=dev -- npm run dev -- --port 3000
```

개발 DB가 127.0.0.1:15434라면 dev:check 전에 허가된 OCI tunnel이 필요하다.
이전 컴퓨터의 Bastion 세션/포트/프로세스는 재사용 가능하다고 가정하지 않는다.
IP allowlist 확장은 별도 승인 필요. dev DB 대신 prod DB로 바꾸지 않는다.
현재 개발 카탈로그가 비어 있을 수 있으므로 0곡 화면을 운영 카탈로그 오류로 오해하지 않는다.

## 커밋 전 검증 — 2026-09-08 KST

- Figma: 교사 7 / 학생 9 화면 시각 확인, 영역 넘침 없음, Noto Sans KR 확인.
- Root `npx tsc --noEmit` 및 mobile tsconfig 검사 통과.
- `npm run test -- SongGuess song-guess`: 28 files / 319 tests 통과.
- Rust workspace tests: 68 통과. clippy --workspace --all-targets -D warnings 통과.
- Node 수집/등록/provenance 테스트: 20 통과, FFmpeg integration 1개 기본 환경에서 skip.
  FFmpeg를 PATH에 추가해 해당 integration을 재실행했으나 ffprobe ENOENT로 실패.
  다음 컴퓨터에서 FFmpeg와 FFprobe를 모두 설치한 뒤 재검증한다.
- Python extractor 11, chart 7, playlist 4 테스트 통과.
- `npm run check:lines` 통과.
- `npm run typecheck`의 pretypecheck는 실행 중 Prisma DLL 잠금(EPERM)으로 실패.
  생성된 client를 사용하는 직접 tsc 검사는 통과했다. 새 DB 스키마 생성/production build는
  이번 디자인 턴에서 다시 성공 검증하지 않았다. 이전 검증 기록과 혼동하지 않는다.
- 새 디자인의 실제 브라우저/모바일 적용 및 인증된 다중 사용자 검증은 미완료다.
