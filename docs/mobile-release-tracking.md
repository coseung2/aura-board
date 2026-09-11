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

## 다음 출시: 1.0.14

- 사용자 지정: 테스트 출시. Android는 기존 alpha 트랙, iOS는 TestFlight.
- 앱 설정 버전: 1.0.14. 원격 EAS 번호도 Android 43 / iOS 53으로 확인했다.
  현재 예상 다음 번호는 Android 44 / iOS 54이며 빌드 직전에 재확인한다.
- 현재 상태: 준비 중. 1.0.14 빌드·업로드·테스트 배포 완료는 아직 확인되지 않았다.
- `.github/workflows/mobile-store-release.yml`의 `android_track`은 테스트용
  `alpha`가 기본값이다. 테스트 출시는 `expected_version=1.0.14`,
  `android_track=alpha`로 실행한다. 운영 제출은 명시적으로 `production`을 고른다.
- 워크플로는 출시 전과 플랫폼별 업로드 후 스토어 상태를 실행 요약에 기록한다.
  Apple 처리 중이면 완료 후 조회 명령을 다시 실행한다.
- Android 제출은 EAS `closed` 프로필을 사용한다. iOS 업로드는 App Store 심사
  제출과 별개이며 `ios-submit` 또는 심사 제출 스크립트를 실행하지 않는다.
- 준비 검증: 모바일 `npm run typecheck`, `npm run release:check`, 스토어 출시
  스크립트 테스트 9개, 워크플로 YAML 파싱과 alpha 기본값, `git diff --check` 통과.
