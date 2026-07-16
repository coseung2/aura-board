# 원소 펫 시스템

학생이 학급 화폐로 알과 성장 아이템을 사고, 부화·먹이·3단 진화를 거쳐 7개 원소 도감을 완성하는 기능이다. 학생 화면은 `/student/pets` 한 곳에서 프론트, 수집함, 상점, 피팅룸, 도감을 탭으로 제공한다.

## 포함 범위

- 원소 계보 7종: 땅, 강, 바다, 화산, 하늘, 어둠, 빛
- 계보별 알 1종과 캐릭터 진화 3단계
- 캐릭터별 `평소`, `게으름`, 고유 행동 3종
- 각 행동 3프레임 SVG 아틀라스를 공통 생성기로 구성해 재생
- 대표 펫이 공간 안을 주기적으로 이동하는 프론트
- 랜덤 알, 지정 원소 알, 먹이, 부화 가속, 배경 효과 상점
- 부화 진행도, 경험치, 진화, 대표 펫, 별명, 배경 효과
- 계보별 알 보유 여부와 발견한 21개 진화 단계 도감

## 가격 정책

가격은 `src/lib/pets/catalog.ts`의 제품 카탈로그가 소유한다.

- 랜덤 알 `운명의 알`: 90 — 결과가 무작위인 대신 가장 저렴하다.
- 땅·강·바다 지정 알: 150
- 화산 지정 알: 190
- 하늘·어둠·빛 지정 알: 280
- 햇살열매: 30 — 알에는 부화 12, 부화한 펫에는 경험치 30
- 부화 모래시계: 75 — 부화 55
- 배경 효과: 100~220, 한 번 사면 계속 사용

모든 결제는 기존 `StudentAccount.balance`와 `Transaction` 원장을 사용한다. 지갑 행을 잠근 뒤 조건부 원자 차감을 수행해 동시 구매가 잔액을 음수로 만들거나 일회성 배경을 중복 결제하지 못하게 한다.

## 데이터 모델

Prisma 6의 다중 파일 스키마를 사용한다.

```text
prisma/
├── schema.prisma          # 기존 전체 모델, generator, datasource
├── pets.prisma            # StudentPet, StudentPetItem, PetPurchase
└── migrations/
    └── 20260716173000_add_elemental_pet_system/
        └── migration.sql
```

프로젝트의 Prisma 스크립트는 `--schema prisma`로 폴더 전체를 읽는다. SQL 마이그레이션에는 다음 DB 제약이 추가된다.

- 단계 0~3, 진행도·경험치 음수 금지
- 학생·아이템 조합 유일성
- 학생당 대표 펫 한 마리만 허용하는 부분 유일 인덱스
- 구매와 기존 거래 원장 연결
- 학생 삭제 시 펫과 아이템 연쇄 삭제

펫 쓰기는 `src/lib/pets/server.ts`의 파라미터화 SQL 트랜잭션 경계에 모여 있다. 먹이·가속·진화는 대상 펫 행을 `FOR UPDATE`로 잠가 동시에 들어온 요청이 진행도를 덮어쓰지 않게 한다.

## API

### `GET /api/pets`

학생의 잔액, 통화 단위, 펫, 아이템 수량, 도감 상태를 반환한다.

### `POST /api/pets/purchase`

```json
{ "productKey": "egg-random" }
```

알 구매 시 `StudentPet`, 아이템 구매 시 `StudentPetItem`, 모든 구매에 `Transaction`과 `PetPurchase`를 같은 트랜잭션에서 만든다.

### `POST /api/pets/action`

지원 행동:

- `{ "action": "feed", "petId": "...", "itemKey": "food-sunberry" }`
- `{ "action": "accelerate", "petId": "...", "itemKey": "hatch-hourglass" }`
- `{ "action": "evolve", "petId": "..." }`
- `{ "action": "equip", "petId": "..." }`
- `{ "action": "set-background", "petId": "...", "itemKey": "background-aurora" }`
- `{ "action": "rename", "petId": "...", "nickname": "루미" }`

## Character Asset Studio 동기화

양쪽 저장소가 같은 authoring 계약 `aura-pet-ecosystem-authoring`을 사용한다. Studio의 `examples/aura-elemental-pets.json`을 Aura Board의 `src/data/pet-ecosystem.json`에 동기화하면 다음이 런타임에서 파생된다.

- `src/lib/pets/catalog.ts`: 소비 계약 `aura.pet-catalog.v1`, 3개 기본 행동 행, 가격 상품
- `src/lib/pets/atlas.ts`: Studio와 동일한 3열 × 10행 SVG 아틀라스 데이터 URL

따라서 미리보기용 SVG를 두 저장소에 중복 커밋하지 않는다. Studio CLI는 배포·검수·AI 행동 시트 생성에 필요한 `catalog.json`, `atlases/*.svg`, `generation/*.behavior.json`을 계속 출력한다. 이후 제작된 PNG 시트로 교체하더라도 계보 ID, 단계 ID, 행동 ID는 학생 소유 데이터의 안정 키이므로 출시 후 변경하지 않는다.

## 검증

```bash
npm run typecheck
npm test -- src/lib/pets/catalog.vitest.ts src/lib/pets/progression.vitest.ts
npx prisma validate --schema prisma
```

배포 전 `npm run db:migrate`로 펫 테이블 마이그레이션을 적용한다.
