# 노래 맞히기 게임 서버의 이전 DB 설정

- 일시: 2026-09-08 KST
- 증상: `/board/game-hub-song-guess-f1fa55762e0277e8?view=student` 입장 시 게임 서버 연결 오류. 게임 준비 여부 조회 실패.
- 영향: 노래 맞히기 입장·진행 상태 조회 불가. 같은 게임 서버의 다른 보드에 대한 영향 범위는 미확인.
- 원인: `aura-play-engine.service.d/database.conf`가 공통 운영 환경 뒤에 이전 `play-engine.env`의 `DATABASE_URL`을 적용했다. 웹은 loopback 15434의 운영 DB, 게임 서버는 loopback 6544의 다른 DB를 사용했다.
- 근거: 웹과 게임 서버가 모두 active이고 게임 서버 `/health`는 성공했으나, 서명한 현재 노래 맞히기 세션 조회는 약 2.6초 후 `500 storage_error`였다. 인증 서명 키는 일치했다. 배포 SHA는 둘 다 `a8ca4b3f077894ba93436ecddf748006b174defd`였다.
- 대응: DB URL만 덮어쓰던 `database.conf`를 같은 디렉터리의 `database.conf.disabled-song-guess-20260908`로 보존하고 비활성화했다. daemon-reload 후 게임 서버를 재시작했다. 기존 비밀 환경 파일은 변경하지 않았다.
- 복구 확인: 재시작 후 active, `/health` 정상. 실행 중 웹·게임 서버의 DB 대상이 일치. 같은 서명 요청이 41ms에 `404 not_found`를 반환하여 현재 세션이 없음을 정상 처리했다. 실제 보드를 다시 열었을 때 게임 서버 오류 문구가 사라졌다. 음원이 없는 상태여서 실게임 채점·저장은 이 복구 검증에 포함하지 않았다.
- 접근 정리: 승인된 임시 Bastion `/32` 제거 후 기존 허용 목록 보존을 확인했다. 진단 세션의 최종 상태 `DELETED`를 확인했다.
- 후속: 배포 점검에 웹/게임 서버 DB 대상 일치와 실제 저장소 조회를 추가한다. 프로세스 생존만 확인하는 `/health`로 DB 정상 여부를 판정하지 않는다.
