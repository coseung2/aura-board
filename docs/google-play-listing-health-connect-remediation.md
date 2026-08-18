# Aura Board Google Play 설명·스크린샷 준비안

작성일: 2026-08-11

이 문서는 2026-08-10에 받은 Google Play 이의제기 회신을 기준으로 한
스토어 설명과 스크린샷 제작 초안이다. 아직 Play Console에 제출하거나 앱
코드·권한·트랙을 변경하지 않는다.

## 1. Google 회신에서 확인된 요구사항

- 대상 앱: Aura Board (com.auraboard.app)
- 검토 버전: App Bundle Version 25 Production, 23 Closed Testing
- 상태: 앱을 Google Play에서 사용할 수 없음
- 문제: Health Connect 권한이 허용되는/유효한 사용 사례가 아니라고 판단됨
- Google이 요구한 조치:
  1. Health Connect 데이터 사용이 승인된 사용 사례와 일치해야 함
  2. Play Console 스토어 설명이 실제 건강 관련 기능과 사용 목적을 정확히 설명해야 함
  3. 요청하는 각 권한이 앱 기능에 핵심임을 앱 안에서 명확히 보여줘야 함
  4. 필요한 Health Connect 권한만 최소 범위로 요청해야 함
  5. Production과 Testing을 포함해 불필요한 권한이 들어간 모든 버전을 제거해야 함
  6. 수정 후 앱과 Health Connect 선언을 함께 다시 제출해야 함

현재 코드에서 Android Health Connect에 요청하는 데이터 형식은 steps 하나이며,
앱은 일별 걸음 수 합계와 걷기 진행·보상 화면에 이를 사용한다. 기존 Android
안내 화면에도 “걸음 수만 읽습니다”, “날짜별 걸음 수 합계만 저장합니다”,
“GPS 위치와 이동 경로는 읽거나 저장하지 않습니다”가 표시된다.

## 2. Play Console 스토어 문구 초안

### 앱 이름

Aura Board

### 짧은 설명

걸음 수와 독서 미션으로 학급 활동을 기록하고 보상을 확인해요

### 전체 설명

~~~text
Aura Board는 학생·교사·학부모가 함께 학급 활동을 기록하고 확인하는 학급 앱입니다.
걷기와 독서 같은 일상 활동을 미션으로 연결해 꾸준한 참여를 돕고, 활동 결과에 따른 학급 보상을 확인할 수 있습니다.

[걷기 활동과 보상]
• 걷기 화면에서 날짜별·주간 걸음 수와 목표 진행 상황을 확인할 수 있어요.
• 사용자가 걷기 기록을 선택하고 권한을 허용한 경우에만 Android Health Connect에서 걸음 수를 읽어요.
• Health Connect에서는 걸음 수만 읽으며, 걷기 미션 진행과 활동 보상 계산에 필요한 정보로 사용해요.
• 앱은 GPS 위치나 이동 경로를 읽거나 저장하지 않아요.
• Health Connect 연결 없이도 다른 학급 기능을 사용할 수 있고, 걷기 기록 권한은 설정에서 언제든 관리할 수 있어요.

[독서 활동과 보상]
• 읽은 책의 제목·지은이·독서 감상을 기록할 수 있어요.
• 독서 미션 진행 상황과 독서 칭호를 확인할 수 있어요.
• 독서 활동을 쌓으며 학급 활동 보상을 확인할 수 있어요.

[학급 활동]
• 선생님이 안내한 학급 활동과 미션을 한곳에서 확인해요.
• 학생은 자신의 걷기·독서 진행 상황과 보상을 확인하고, 교사와 학부모는 학급 활동 결과를 함께 살펴볼 수 있어요.

[건강 데이터 사용 안내]
Aura Board는 걷기 기능을 제공하기 위해 사용자의 명시적인 선택과 권한 허용 후 걸음 수 데이터에 접근합니다.
걸음 수 데이터는 앱의 걷기 기록, 목표 진행, 걷기 활동 보상 기능에 필요한 범위에서만 사용합니다.
의료 진단이나 치료를 위한 앱이 아니며, Health Connect의 다른 건강 데이터 유형을 요청하지 않습니다.
Health Connect 권한은 Android 설정에서 언제든 변경할 수 있습니다.
자세한 내용은 Aura Board 개인정보처리방침에서 확인할 수 있어요.
~~~

### Health Connect 선언 사유 초안

Play Console의 선언 입력란에는 아래 내용을 실제 동작·개인정보처리방침과 대조한
뒤 사용한다.

~~~text
Aura Board has a user-facing walking feature that helps users monitor their physical activity and progress toward walking goals as part of classroom wellness activities.

On Android, when the user chooses to connect walking records, Aura Board requests only the Health Connect read permission for Steps (READ_STEPS). The data is used to display daily and weekly step totals, calculate progress toward walking missions, and provide the related activity rewards in the app. This permission is essential to automatically verify walking progress from the user's existing step data.

Aura Board does not request or use other Health Connect data types, and it does not read or store GPS location or routes through Health Connect. The permission is optional for the rest of the classroom app and can be changed by the user in Android Health Connect settings.
~~~

제출 전에 반드시 확인할 것:

- 실제 개인정보처리방침에 위 데이터의 수집·저장·삭제·공유 방식이 동일하게 적혀 있는가
- 학급 걷기 순위나 학생별 걸음 수가 다른 사용자에게 보이는 경우, 그 공유 범위와 동의 방식이 설명되어 있는가
- 앱의 대상 사용자 설정이 “어린이만을 대상으로 하는 앱”으로 판단될 가능성이 있는가
- ACTIVITY_RECOGNITION 런타임 권한이 사용되는 경우, Play Console의 건강 데이터 관련 고지와 앱 내 안내에도 반영했는가
- Version 25 Production과 Version 23 Closed Testing 외 모든 트랙에 불필요한 Health Connect 권한이 남아 있지 않은가

특히 Google의 현재 Health Connect 정책에는 Health Connect를 “어린이만을
대상으로 하는 앱”에 연결하지 말라는 제한이 있다. Aura Board가 학급 앱이라는
이유만으로 문구를 바꾸면 해결된다고 단정할 수 없으며, 대상 사용자·학급 공유
기능·걷기 기능의 실제 사용자 혜택을 함께 검토해야 한다.

## 3. 스크린샷 구성안

사용자가 제공한 다음 파일은 최종 업로드본이 아니라 색상·세로 카드 구성 참고용으로 사용한다.

- C:\Users\coseung2\Downloads\230x499bb.webp
- C:\Users\coseung2\Downloads\230x499bb (1).webp
- C:\Users\coseung2\Downloads\230x499bb (2).webp

Google Play 최종본 권장 규격:

- 세로 1080x1920 (9:16) PNG 또는 JPEG
- 실제 앱 화면을 캡처하고, 표지 문구는 필요한 경우에만 짧게 추가
- 첫 3장을 핵심 UI 중심으로 구성
- 최대 8장까지 준비 가능하므로 5~6장으로 시작
- 원본 예시 230x499는 최소 변이 320px 미만이고 9:16도 아니므로 그대로 제출하지 않음
- 상태 표시줄에 개인 알림·통신사 정보가 보이지 않게 정리
- 손가락, 가짜 버튼, Play 배지, 순위·가격·성과를 과장하는 문구를 넣지 않음

### 권장 6장

| 순서 | 표지 문구 초안 | 실제로 보여줄 화면 | 접근성용 대체 텍스트 |
|---|---|---|---|
| 1 | 우리 반 걷기 목표를 기록해요 | 학생 걷기 화면의 날짜별·주간 걸음 수와 진행 상태 | 걷기 화면에서 오늘과 이번 주 걸음 수 및 목표 진행 상황을 보여주는 화면 |
| 2 | 걸음 수만 선택적으로 연결해요 | Aura Board 걷기 데이터 이용 안내 화면. 선택 사항, 걸음 수만 읽음, 날짜별 합계, GPS 미사용, 설정에서 관리 문구가 모두 보이게 함 | Health Connect 연결 전에 걸음 수 데이터 사용 목적과 읽지 않는 정보를 설명하는 안내 화면 |
| 3 | 걷기 미션을 달성하고 보상을 확인해요 | 걷기 일간·주간 미션과 보상 진행 카드. 실제 테스트 계정의 정상 상태 사용 | 걷기 걸음 수 진행도와 활동 보상 미션을 보여주는 화면 |
| 4 | 읽은 책을 기록해요 | 학생 독서 화면의 책 제목·지은이·독서 감상 기록 흐름 | 책 제목과 독서 감상을 기록하는 독서 화면 |
| 5 | 독서 미션과 칭호를 모아요 | 독서 미션, 독서 칭호, 보상 진행 화면 | 독서 미션 진행도와 획득 가능한 칭호를 보여주는 화면 |
| 6 | 학급 활동을 한곳에서 확인해요 | 학생 홈 또는 학급 보드에서 걷기·독서 탭으로 이동하는 실제 화면 | 걷기와 독서 활동을 포함한 학급 앱의 학생 홈 화면 |

표지 문구는 한 화면에 한 메시지만 두고, 다음 표현은 사용하지 않는다.

- 최고의 학급 앱, 1위, 100% 보장 같은 순위·성과 주장
- 현금 지급, 수익, 무료 한정처럼 가격·프로모션으로 오해될 수 있는 표현
- 실제 화면에 없는 건강 관리, 질병 예방, 의료 효과 표현
- Health Connect가 모든 건강 정보를 읽는 것처럼 보이는 표현

## 4. 제작·검수 도구

### 캡처

1. 실제 Android 기기 또는 기존 에뮬레이터에 앱을 실행한다.
2. Health Connect 연결 상태, 걷기 데이터, 독서 샘플 데이터가 있는 테스트 계정으로 화면을 만든다.
3. 'adb exec-out screencap -p > raw-01.png' 방식으로 원본을 캡처한다.
4. 현재 저장소의 모바일 검수 절차에 맞춰 같은 화면을 다시 열고, 스크롤·탭·뒤로가기·권한 안내가 정상인지 확인한다.

### 합성·출력

- Canva 또는 Figma: 연한 파란색 배경, 실제 앱 캡처, 상단 1~2줄 표지 문구를 조합
- FFmpeg: 크기·포맷·색상 모드 최종 변환 및 일괄 검수
- adb: 최종 앱 화면과 권한 안내의 실제 캡처
- Play Console: 업로드 전 미리보기와 기기별 잘림 여부 확인

현재 확인 결과 adb, ffmpeg, Node/npm은 설치되어 있고 연결된 Android
기기는 없다. ImageMagick의 magick 명령은 설치되어 있지 않으므로 별도
설치하지 않고 FFmpeg를 기본 변환 도구로 사용한다.

### 작업 순서

1. 실제 기기·에뮬레이터 연결
2. 걷기·Health Connect 안내·걷기 보상·독서 기록·독서 보상 화면 캡처
3. 개인정보·학생 이름·토큰·알림을 가린 테스트 데이터로 재캡처
4. 1080x1920 PNG/JPEG로 합성
5. 모든 이미지의 실제 화면과 표지 문구가 일치하는지 확인
6. Play Console의 Health Connect 선언·스토어 설명·스크린샷을 같은 커밋의 앱 동작과 대조
7. Production과 Closed Testing의 문제 버전을 포함한 모든 트랙을 확인한 뒤 재제출

## 5. 제출 전 차단 조건

- 걷기 화면에서 권한의 필요성이 보이지 않음
- 설명에는 걸음 수를 쓴다고 적었지만 실제 앱 화면에서는 걷기 기능이 핵심으로 보이지 않음
- 앱이 학생의 걸음 수를 학급에 공유하면서도 공유·동의 고지가 없음
- 개인정보처리방침과 Play Console 선언의 데이터 흐름이 다름
- Production 또는 Testing 트랙에 불필요한 Health Connect 권한 버전이 남아 있음
- 실제 앱 화면이 아닌 목업만으로 스크린샷을 구성함
- Google 정책상 어린이만을 대상으로 하는 앱 제한을 해소하지 못함

## 참고 링크

- [Android Health Permissions: Guidance and FAQs](https://support.google.com/googleplay/android-developer/answer/12991134?hl=en)
- [Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en)
- [Add preview assets to showcase your app](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Best practices for your store listing](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)

