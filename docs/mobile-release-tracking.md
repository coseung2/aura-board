# 모바일 출시 기록

운영과 테스트는 각각 스토어 API로 확인한다. EAS 빌드 목록만으로 최신 버전을
판단하지 않는다. 로컬 또는 CI에서 만든 빌드가 목록에 없을 수 있다.

## 확인 방법

저장소 루트의 PowerShell 7에서 실행한다. 인증 정보는 Infisical이 자식 프로세스에
주입하며 출력에는 스토어 출시 정보만 포함한다.

```powershell
infisical.exe run --projectId b850cd45-d5d6-4211-b33e-7641f45f3d48 --env prod --path /mobile -- node .github/scripts/inspect-mobile-releases.mjs
```

출시 전후에 Android의 production/alpha/internal 트랙과 iOS의 App Store 버전,
TestFlight 빌드·처리·테스트 상태를 확인하고 아래 기록을 갱신한다.
업로드 완료, Apple 처리 완료, 테스터에게 배포 완료는 구분한다.
Android versionCode는 모든 트랙과 업로드된 바이너리의 최댓값보다 커야 한다.
iOS buildNumber는 기존 업로드와 중복되지 않게 원격 EAS 번호도 함께 확인한다.

## 스토어 확인: 2026-09-11 15:58 KST

| 플랫폼 | 채널 | 버전 | 빌드 | 확인 상태 |
|---|---|---|---|---|
| Android | 운영 production | 1.0.12 | 42 | completed |
| Android | 비공개 테스트 alpha | 1.0.13 | 43 | completed |
| Android | 내부 테스트 internal | 1.0.13 | 43 | completed |
| iOS | App Store 운영 | 1.0.11 | — | READY_FOR_SALE |
| iOS | TestFlight 내부 | 1.0.12 | 53 | VALID / IN_BETA_TESTING |
| iOS | TestFlight 외부 | 1.0.12 | 53 | READY_FOR_BETA_SUBMISSION |

## 테스트 출시 완료: 1.0.14 (2026-09-11 16:25 KST 확인)

- 사용자 지정: 테스트 출시. Android는 기존 alpha 트랙, iOS는 TestFlight.
- 출시 소스: `22bcde6d7a9af590f33ba2a2819e5b33fc5c9e64` (main).
- Android alpha: **1.0.14 / versionCode 44 / completed**.
- iOS TestFlight 내부: **1.0.14 / buildNumber 54 / VALID / IN_BETA_TESTING**.
  외부 테스트는 `READY_FOR_BETA_SUBMISSION`이며 외부 베타 심사는 제출하지 않았다.
- 운영은 Android 1.0.12(42), iOS 1.0.11을 유지한다. Android internal은
  1.0.13(43)을 유지하며 이번 출시는 기존 비공개 테스트 alpha에 반영했다.
- [빌드·제출 실행](https://github.com/coseung2/aura-board/actions/runs/34572672201): 성공.
  Android와 iOS 모두 GitHub 러너의 로컬 EAS 빌드이며 EAS 클라우드 빌드 ID는 없다.
- [Android 제출](https://expo.dev/accounts/coseung2/projects/aura-board-mobile/submissions/be264767-f5fc-4409-9254-5287cb6d9f75),
  [iOS 제출](https://expo.dev/accounts/coseung2/projects/aura-board-mobile/submissions/6e1df121-d56f-4bb9-aa97-53ae02c34a60).
- `.github/workflows/mobile-store-release.yml`의 `android_track`은 테스트용
  `alpha`가 기본값이다. 테스트 출시는 `expected_version=1.0.14`,
  `android_track=alpha`로 실행한다. 운영 제출은 명시적으로 `production`을 고른다.
- 워크플로는 출시 전과 플랫폼별 업로드 후 스토어 상태를 실행 요약에 기록한다.
  Apple 처리 중이면 완료 후 조회 명령을 다시 실행한다.
- Android 제출은 EAS `closed` 프로필을 사용한다. iOS 업로드는 App Store 심사
  제출과 별개이며 `ios-submit` 또는 심사 제출 스크립트를 실행하지 않는다.
- 준비 검증: 모바일 `npm run typecheck`, `npm run release:check`, 스토어 출시
  스크립트 테스트 9개, 워크플로 YAML 파싱과 alpha 기본값, `git diff --check` 통과.
- [Windows Android 검증](https://github.com/coseung2/aura-board/actions/runs/34572787508):
  동일 출시 소스로 성공. Hermes 바이트코드, APK·AAB 네이티브 빌드와 패키지
  검증을 통과했다. 이 실행의 별도 검증용 서명 산출물은 스토어에 제출하지 않았다.

### 배포 산출물 검증

GitHub 실행의 `aura-board-android-1.0.14-44`, `aura-board-ios-1.0.14-54`
산출물을 내려받아 패키지 ID `com.auraboard.app`, 버전 및 빌드 번호를 확인했다.
로컬 보관 위치는 `.codex/artifacts/release-1.0.14/`이며 저장소에 포함하지 않는다.

| 파일 | 크기(bytes) | SHA256 |
|---|---:|---|
| aura-board-1.0.14.aab | 81165129 | `bc661c486db9c42ee866392e5967c400df19e2ba26848e6f09b5cbb1c7ecf86f` |
| aura-board-1.0.14.ipa | 31818833 | `fa510aecff769aa5a64c341d72d5a377ae22668b7c17e801773c0a17b21e793d` |

Android 런처 리소스는 mipmap WebP이며 adaptive XML이 없다.
원본 아이콘 SHA256은
`37639287bf27774d453ea5f598383b233fb4c48a706863ee5d84feeaa9b51c60`으로 유지했다.
실제 기기 설치·키보드·다중 참여 검증은 별도 미실시 항목이다.

### 연동 서버 배포

[Oracle 운영 배포](https://github.com/coseung2/aura-board/actions/runs/34572663053)는
동일 소스 `22bcde6d`로 2026-09-11 16:11 KST 완료됐다. 엔진·Next 앱·nginx
상태 및 실행 릴리스 검사를 통과했다. 외부 `/api/health`는 HTTP 200과
`database=reachable`, 미인증 게임방 API는 HTTP 401을 반환했다.
