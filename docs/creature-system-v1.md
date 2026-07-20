# Aura Creature System v1

Status: v1 gameplay contract with `creature-catalog-v2` egg pricing and draw pools. Aura Board owns students, the shared classroom wallet, purchases, growth, inventory, and stage relationships. Character Asset Studio produces approved behavior sheets only; asset packages never own price, balance, odds, or student state.

## Product principles

1. **One wallet.** Creature eggs use the existing classroom wallet (`StudentAccount.balance`) and existing `Transaction` ledger. There is no creature-only currency.
2. **A reward event is not a spend.** A verified reading, walking, or assignment reward can deposit classroom currency and also append one non-spendable creature-progress event. Applying progress never decrements the wallet and does not make a second deposit.
3. **Server authority and replay safety.** The server verifies the source activity, chooses the amount and progress delta, and makes each source mutation idempotent. Client-provided amounts, stage names, odds, or progress are hints at most and are never trusted.
4. **Forward, legible growth.** The only v1 path is `egg -> hatchling -> juvenile -> evolved`. Thresholds and the rules version are visible in responses and stored with every event.
5. **Assets are references.** Aura Board stores a line key and resolves the current stage to an approved character package. The stage relationship is not hidden in a texture, sprite sheet, or asset bundle.
6. **Growth slot and representative are separate.** A student has one active in-progress row (`isActive`) and at most one displayed representative pet (`isFeatured`). The representative must be the student's own hatched pet and remains selected after reaching `evolved`; switching it never changes which row receives growth.
7. **Eggs are incubation, not collection.** An egg is only the means by which a pet line is obtained. It is shown as “부화 중인 알”, never as an owned codex line or representative pet. A line enters the codex only after one of its rows reaches `hatchling` or later.

## Wallet and progress ledger

`StudentAccount.balance` remains the single spendable balance. A purchase writes the normal positive `Transaction.amount` convention used by the existing avatar/store flows, with `type = "creature_egg_purchase"`, a source key, and `balanceAfter` captured after the guarded decrement. The wallet and teacher-ledger presenters must register this type as an outgoing purchase before the route ships. Reading rewards already use a source-linked deposit; the creature implementation must preserve that convention rather than inventing another account.

The creature ledger is separate:

- `Transaction` records money that can be spent.
- `CreatureProgressEvent` records a verified activity, the wallet amount associated with it, and a non-spendable `progressDelta` applied to one active creature.
- A progress event must not call a purchase path or subtract from `StudentAccount.balance`.
- If the verified event arrives when the student has no active egg/creature, the wallet reward may still be credited, but no later replay should grow a creature retroactively. Record a no-op event if the product needs an audit trail; do not queue hidden progress.

For v1, `progressDelta` is one point for every eligible, successfully verified reward event. The currency amount is still stored on the event so a later rules version can use amount bands without rewriting history. The same transaction should create the source-linked deposit and the progress event whenever possible.

## State machine and active-slot policy

The stage thresholds are cumulative progress points in `creature-rules-v1`:

| Stage | Entry condition | Active? | Notes |
| --- | --- | --- | --- |
| `egg` | successful egg purchase | yes | The one incubating slot. No motion is required for this static stage. |
| `hatchling` | total progress >= 3 | yes | Reward events, food, and egg accelerators can contribute. |
| `juvenile` | total progress >= 8 | yes | Growth continues with the same server-authoritative ledger. |
| `evolved` | total progress >= 15 | no | Final v1 stage; close the active slot and retain the row as collection history. |

Transitions are monotonic and happen in the same transaction as the event that crosses a threshold. A delta of one means one transition at most per v1 event. There is no branching evolution, reroll, downgrade, or client-selected stage.

The application enforces these rules in a transaction and in database indexes where supported:

- at most one `StudentCreature` with `isActive = true` for a student;
- an active row must be `egg`, `hatchling`, or `juvenile`;
- at most one active `egg` (the incubating creature) for a student;
- an `evolved` row is inactive and can never receive another progress event;
- a new purchase is allowed only when no active row exists; the completed collection is not deleted.
- at most one `StudentCreature` with `isFeatured = true` for a student, enforced by a reviewed partial unique index;
- a featured row must belong to the authenticated student and must not have `stage = 'egg'`;
- the first `egg -> hatchling` transition sets that row featured only when no representative already exists;
- closing the active slot at `evolved` never clears `isFeatured`.

If the deployment uses PostgreSQL, add partial unique indexes in the migration (`student_id WHERE is_active`, `student_id WHERE is_active AND stage = 'egg'`, and `student_id WHERE is_featured`). Keep the service-level checks as a portable defense for environments that do not apply partial indexes.

## MVP policy decisions

- The first catalog contains seven original line keys: `terramote`, `ripplekin`, `tidalume`, `cinderhorn`, `cloudwhisp`, `nocturnib`, and `dawnlet`. The all-affinity random egg uses public aggregate weights `24/20/17/13/10/8/8`, prioritizing unowned lines before falling back to the full pool. Every draw uses a CSPRNG and stores its effective odds snapshot.
- An affinity egg never points at one fixed line. It builds a pool from every published line with the requested affinity, then performs a second weighted draw with each line's `affinityEggWeight`. Adding another line to an affinity requires only catalog and asset entries; the purchase service must not gain a new branch.
- Egg prices have three explicit bands: basic affinity eggs (`earth` 100, `river` 110, `sea` 120), the all-affinity random egg (150), and advanced affinity eggs (`volcano` 180, `sky` 260, `darkness` 280, `light` 300). The invariant is `max(basic) < random < min(advanced)`.
- Duplicate request protection is mandatory: the same purchase idempotency key returns the original creature and transaction without another charge. A concurrent request cannot create two active eggs. When multiple approved lines exist, draw from unowned line keys first; after all published lines are owned, repeat outcomes are allowed and the full weighted table is disclosed.
- Affinity and shop tier affect egg price and random-draw weight only. They never change reward amounts, thresholds, classroom access, or combat power. There are no battle stats in v1.
- Eggs and growth are classroom activities, never a real-money purchase. Do not expose a card/checkout path or premium currency.
- Reading, comment, daily walking, weekly walking, and on-time assignment submissions are the bounded reward sources. A source is eligible only after its route-specific checks succeed; no client can post an arbitrary reward event.
- Creature-specific accessories and trading remain later slices. V1 inventory contains food, egg-only hatch accelerators, and one equippable background effect per student.
- There is one rules version (`creature-rules-v1`) and one straight-line stage map. A future rules version must be additive and must not reinterpret existing events.

### Stable source keys

Use the existing `Transaction.sourceType/sourceRef` pair and use the same pair on `CreatureProgressEvent`. The source reference must be an immutable server ID, not a timestamp or display label.

| Activity | `sourceType` | `sourceRef` | Wallet effect | Progress effect |
| --- | --- | --- | --- | --- |
| Reading reward | `reading_reward` | `readingLogId` | Score 5+; 5 per score point; KST day 10/week 20 | `+1` in the same serializable transaction |
| Comment reward | `comment_reward` | `commentId` | 5 for one meaningful normalized student comment; KST day 10/week 30 | `+1` in the same serializable transaction |
| Daily walking unit | `walking_reward` | `studentId:YYYY-MM-DD:unit:N` | 10 per 5,000 steps, at most four units/day and five rewarded days/week | `+1` per paid unit in the same serializable transaction |
| Weekly walking tier 1 | `walking_weekly_reward` | `studentId:weekMonday:weekly-tier:tier1` | +20 when that KST week reaches 25,000 steps | `+1` in the same serializable transaction |
| Weekly walking tier 2 | `walking_weekly_reward` | `studentId:weekMonday:weekly-tier:tier2` | +40 when that KST week reaches 50,000 steps | `+1` in the same serializable transaction |
| Weekly walking tier 3 | `walking_weekly_reward` | `studentId:weekMonday:weekly-tier:tier3` | +100 when that KST week reaches 75,000 steps | `+1` in the same serializable transaction |
| Assignment submission | `assignment_reward` | `studentId:assignmentSlotId:attempt:<attemptKey>` | Deposit 20 for each valid, on-time submission by default | `+1` in the same serializable transaction |
| Egg purchase | `creature_egg_purchase` | caller idempotency key | Guarded withdrawal/purchase transaction | Creates the egg; it is not a growth event |

The existing `Transaction` compound unique index on `(sourceType, sourceRef)` is global. Choose source references that cannot collide across source types and do not reuse a reading-log ID for an assignment event. A progress event also carries `rulesVersion` and a stable `idempotencyKey` such as `studentId:sourceType:sourceRef:rulesVersion`; retries must return the already-applied result.

## Minimal Prisma-shaped models

These are the intended fields, not a migration to apply blindly. Keep existing `Student`, `Classroom`, `StudentAccount`, and `Transaction` relations. `stage` and `sourceType` are strings in the current schema style; service constants should bound their values.

```prisma
model StudentCreature {
  id                 String   @id @default(cuid())
  studentId          String
  classroomId        String
  lineKey            String   // e.g. "aura.sprout.001"
  stage              String   // egg | hatchling | juvenile | evolved
  isActive           Boolean  @default(true)
  isFeatured         Boolean  @default(false)
  progressPoints     Int      @default(0)
  rulesVersion       String   @default("creature-v1")
  originSourceType   String   // "creature_egg_purchase"
  originSourceRef    String   // purchase idempotency key or transaction id
  incubatingStartedAt DateTime?
  completedAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  student            Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  classroom          Classroom @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  progressEvents     CreatureProgressEvent[]

  @@unique([originSourceType, originSourceRef])
  @@index([studentId, isActive])
  @@index([studentId, lineKey])
}

model CreatureProgressEvent {
  id                String   @id @default(cuid())
  studentCreatureId String
  studentId         String
  classroomId       String
  sourceType        String   // reading_reward | comment_reward | walking_reward | walking_weekly_reward | assignment_reward
  sourceRef         String
  idempotencyKey     String   @unique
  rulesVersion       String
  currencyAmount     Int      // snapshot of the verified wallet award; never spent here
  progressDelta      Int      // v1 is 1 for an eligible event
  progressBefore     Int
  progressAfter      Int
  stageBefore        String
  stageAfter         String
  appliedAt          DateTime @default(now())
  reversedAt         DateTime?

  creature           StudentCreature @relation(fields: [studentCreatureId], references: [id], onDelete: Cascade)

  @@unique([studentId, sourceType, sourceRef])
  @@index([studentCreatureId, appliedAt])
  @@index([studentId, sourceType, sourceRef])
}
```

The migration must add the partial unique active-slot and featured-pet indexes described above. If a deployment cannot express partial indexes through the Prisma schema DSL, add them with a reviewed SQL migration. `isActive` remains the readable source of truth for growth and `isFeatured` remains the independent source of truth for the displayed pet. The purchase and featured-selection services must re-check their scoped rows inside transactions; application-level preflight checks alone are not sufficient.

## Atomic egg purchase algorithm

`POST /api/student/creatures/purchase` accepts `{ kind: "egg", productKey, idempotencyKey }`. The server supplies price, odds, line key, and stage. A safe implementation is:

1. Authenticate the student and verify classroom membership. Load a published, non-archived egg catalog and its integer price; reject negative prices and unknown catalog revisions.
2. Validate the idempotency key. Look for `Transaction(sourceType = "creature_egg_purchase", sourceRef = idempotencyKey)` and return its linked creature if it already exists.
3. Draw the line with a cryptographically secure random integer (`crypto.randomInt`/`crypto.randomBytes`), using integer weights from the published odds table. Never use `Math.random`. Persist the selected line key and odds/catalog revision in the transaction/creature record so retries do not reroll.
4. Enter a short serializable Prisma transaction. Re-check that the student has no active creature and no active egg. This check and the partial unique index close the concurrent-purchase race.
5. Atomically decrement the wallet with a conditional update: `updateMany({ where: { id: accountId, balance: { gte: price } }, data: { balance: { decrement: price } } })`. A zero-row result is `insufficient_funds`; never read, compare, and blindly decrement.
6. Read the updated balance, create one `Transaction` (`type = "creature_egg_purchase"`, positive `amount`, `balanceAfter`, `sourceType = "creature_egg_purchase"`, `sourceRef = idempotencyKey`), and create one active `StudentCreature(stage = "egg")` in that same transaction. Link `originSourceRef` to the transaction ID or the idempotency key consistently.
7. Return the creature, transaction ID, new balance, catalog revision, selected line, and public odds snapshot. On a unique-constraint race, resolve the existing source row and return it idempotently; do not charge again. Retry serializable conflicts with the same selected draw and idempotency key.

The balance decrement, transaction row, and creature row must commit or roll back together. A failed asset lookup, database error, or duplicate active-slot race must not leave a charge without an egg.

## Reward and growth application

Reward hooks should call one server helper after source verification:

1. Begin a transaction and resolve the student account and active creature (`isActive = true`, stage not `evolved`).
2. Check the source-specific wallet transaction. If the source deposit already exists, return its amount; do not deposit twice.
3. If an active creature exists, check `CreatureProgressEvent.idempotencyKey`/`(studentId, sourceType, sourceRef)`. If present, return the recorded stage and progress. Otherwise increment `progressPoints` by the server-computed delta, calculate the monotonic stage transition for `rulesVersion`, insert the event with before/after snapshots, and update the creature. On the first `egg -> hatchling` crossing, set `isFeatured = true` only if no representative exists. When the transition reaches `evolved`, set `isActive = false` and `completedAt` while preserving `isFeatured`.
4. Commit the wallet deposit and progress event together when the source record itself is created in this hook. If an upstream record must be created first, use an outbox/retry path rather than silently losing progress.

Reading, comments, daily/weekly walking, and assignment-submission rewards call the shared server-owned growth helper. Each newly created wallet deposit and its creature progress event commit in the same serializable transaction; reading also creates its `ReadingLog` in that transaction. A replay of an already-existing deposit does not retroactively add growth. No endpoint accepts a raw `CreatureProgressEvent` from a client.

Walking defaults to 10 per 5,000-step unit (four units/day), five rewarded days/week, plus independent weekly tier payouts of 20 at 25,000 steps, 40 at 50,000 steps, and 100 at 75,000 steps (160 won when all three thresholds are reached). Each tier has its own source key, so retries and Monday KST week changes are idempotent. Valid, on-time assignment submissions default to 20 each; a zero assignment cap means unlimited submissions while positive classroom overrides remain possible. `AvatarRewardConfig` owns the persisted defaults, while server guardrails enforce the reading/comment frequency caps (10/day and 20/week for reading; 10/day and 30/week for comments) and 20% effect cap. The reward-policy migration changes existing rows only when they still equal the former schema defaults; because the old schema stored no customization marker, an intentionally customized value equal to an old default cannot be distinguished and is migrated too. The former single weekly-goal fields are copied to tier 1 before they are removed; tier 2 and tier 3 use the new reviewed defaults.

### Reversal recommendation

Use append-only, source-specific compensation. A teacher deletion/reversal can create a withdrawal transaction for the exact reward source, guarded by `balance >= amount`, matching `reverseReadingReward`; if the guard fails, return a conflict for manual review rather than making the wallet negative. Never refund by scanning free-form notes or by withdrawing a student's purchases.

Do **not** automatically downgrade a creature or subtract already-applied progress in v1. Mark the original `CreatureProgressEvent.reversedAt` and record the reversal actor/source in an audit trail. Stages are monotonic and a later reward may have crossed a threshold; silent downgrade would make the collection state surprising. A future rules version can define a reviewed correction flow (for example, subtracting only unapplied progress), but it must be explicit and idempotent.

## Catalog, odds, and duplicate protection

Publish the effective line-level odds snapshot with every catalog response and egg purchase result:

| `lineKey` | Affinity | All-affinity weight | Affinity-pool weight | Affinity egg price | Band | Stage packages |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `terramote` | earth | 24 | 1 | 100 | basic | `egg`, `hatchling`, `juvenile`, `evolved` |
| `ripplekin` | river | 20 | 1 | 110 | basic | `egg`, `hatchling`, `juvenile`, `evolved` |
| `tidalume` | sea | 17 | 1 | 120 | basic | `egg`, `hatchling`, `juvenile`, `evolved` |
| `cinderhorn` | volcano | 13 | 1 | 180 | advanced | `egg`, `hatchling`, `juvenile`, `evolved` |
| `cloudwhisp` | sky | 10 | 1 | 260 | advanced | `egg`, `hatchling`, `juvenile`, `evolved` |
| `nocturnib` | darkness | 8 | 1 | 280 | advanced | `egg`, `hatchling`, `juvenile`, `evolved` |
| `dawnlet` | light | 8 | 1 | 300 | advanced | `egg`, `hatchling`, `juvenile`, `evolved` |

The all-affinity random egg costs 150 classroom-currency units: more than every basic affinity egg and less than every advanced affinity egg. Its aggregate affinity weights must remain descending from basic to advanced (`earth > river > sea > volcano > sky > darkness = light`). When an affinity gains more lines, catalog authors split that affinity's aggregate all-affinity weight across its lines instead of multiplying the affinity's total chance. Within a dedicated affinity egg, `affinityEggWeight` controls the relative chance among that affinity's lines.

For a student with completed rows, the all-affinity random egg first draws from published lines they do not already own; if that pool is empty, it draws from the full weighted table and states that repeats are possible. Affinity eggs always draw only from their matching affinity pool. The one-active-slot rule prevents duplicate active creatures, while the idempotency key prevents duplicate charges, rerolls, and rows on retries.

Each line and stage resolves to a 3×3 behavior sheet with semantic rows `normal`, `lazy`, and `signature`, three frames per behavior, and runtime ID `behavior.aura.<line>.<stage>.v1`. Approved files are published under `/creatures/<line>/<stage>/`. The client may animate only these approved frames and must respect reduced-motion preferences.

## API and DTO outline

These route names are an outline for implementation; they do not authorize a new client surface until the service and migration exist.

- `GET /api/student/creatures` -> `{ active, featured, collection, balance, currency, items, equippedBackground, catalogRevision, rulesVersion }`. `active` is the growth target, `featured` is the displayed hatched pet, and `collection` retains raw completed/incubation rows so the UI can render eggs separately without counting them in the codex.
- `GET /api/student/creatures/catalog` -> `{ revision, rulesVersion, lines, products, productsByKind, odds }`.
- `POST /api/student/creatures/purchase` body `{ kind: "egg", productKey, idempotencyKey }` -> `{ creature, transactionId, balance, draw, idempotent }`.
- `POST /api/student/creatures/items/purchase` body `{ productKey, quantity, idempotencyKey }` -> `{ inventory, transactionId, balance, idempotent }`.
- `POST /api/student/creatures/use` body `{ itemKey, idempotencyKey }` uses food or an egg-only hatch accelerator on the server-resolved active creature.
- `POST /api/student/creatures/equip` body `{ itemKey }` equips one owned background effect; `null` removes the equipped background.
- `POST /api/student/creatures/feature` body `{ creatureId }` atomically replaces the representative with one owned non-egg pet. Missing or foreign IDs return `404`; an egg returns `409`.
- Internal reward helper (called by reading/comment/walking/assignment handlers), not a client endpoint: `{ studentId, classroomId, sourceType, sourceRef, currencyAmount, verifiedAt }` -> `{ transactionId, progressEventId: string | null, progressDelta, stageBefore, stageAfter }`.
- Teacher/admin reversal endpoint, protected by existing classroom permissions: `{ sourceType, sourceRef, reason }` -> `{ withdrawalTransactionId, progressReversal: "marked_only" }`.

## Administrator operations

- `/admin/shop` is the read-only operations view for the published creature shop catalog, global random-egg odds, aggregate egg/item sales, and the recent creature-purchase ledger.
- `/admin/aura-pet` is the read-only operations view for the seven-affinity catalog, stage distribution, active/completed creature counts, inventory totals, and recent student creature records.
- Both routes use the existing global administrator gate and the shared `/admin` navigation. They do not accept price, odds, balance, stage, or ownership mutations.
- Catalog prices and odds remain code-reviewed data in `src/lib/creatures/catalog.ts`. A future editable admin form requires a versioned persisted catalog and audit trail; it must not mutate the current readonly constants from a client request.

`CreatureDto` should expose only stable UI data: `id`, `lineKey`, `stage`, `isActive`, `isFeatured`, `progressPoints`, `nextThreshold`, `rulesVersion`, `assetPackageId` (resolved from the stage map), and timestamps. Never expose a CSPRNG seed, account internals, or a client-writable balance.

## Student pet and codex presentation

- The first `/student/aura-pet` tab is “내 펫”. Its stage, behavior controls, roaming sprite, and equipped background always use `featured`, never `active` as a fallback.
- The selector lists only owned rows at `hatchling`, `juvenile`, or `evolved`. An active egg appears only in a separate “부화 중인 알” status region.
- Food and hatch accelerators always target `active`. When `active` and `featured` differ, the fitting room names the actual growth target before the use action.
- The codex has one card per catalog line. It counts a line as owned only when at least one owned row is not an egg, and shows the highest owned non-egg stage for that line.
- An undiscovered line uses a silhouette. The codex never renders an egg sprite or an “알 보유” label.

## Explicit non-goals

- No second currency, premium currency, real-money checkout, loot-box sale, or paid odds boost.
- No combat power, battle stats, PvP/PvE, damage, health, or rarity advantage.
- No branching evolution, breeding, genetics, fusion, trading, gifting, or student-to-student transfer.
- No multiple simultaneous active creatures, background progress queues, offline client claims, or hidden fallback line.
- No creature-specific accessory exchange, trading, or gifting; those remain later cosmetic slices.
- No asset authoring, image generation, mesh editing, or behavior-sheet storage in Aura Board.
- No retroactive growth for a reward earned before an active creature was purchased.

## Implementation order

1. Add the creature, progress, inventory, and item-use models plus reviewed partial indexes; validate and generate Prisma artifacts.
2. Add the seven-line catalog, shop products, public odds snapshot, and transactional CSPRNG purchase helpers with conditional wallet debit and idempotency tests.
3. Add stage-transition and item-use services plus the student read/purchase/use/equip routes. Confirm an evolved row closes the active slot and remains in the collection.
4. Generate and approve all 28 stage behavior sheets in Character Asset Studio, then publish their JSON, sheet PNG, and nine canonical frames under the runtime paths.
5. Build the responsive student hub for exhibition, shop, fitting room, and codex; verify purchases and equipment survive reload.
6. Add a shared reward-application helper and source-specific tests. Make reading reward delivery durable, then add verified walking and assignment-submission reward hooks.

## Verification checklist

Use [`docs/verification-checklist.md`](./verification-checklist.md) as the single source of truth. At minimum for this feature:

- Run `npm run typecheck`, targeted creature/wallet tests, and `npm run test` when shared wallet logic changes.
- For the Prisma migration, run `npx prisma validate` and `npx prisma generate`.
- Exercise two concurrent purchase requests with the same and different idempotency keys: one charge/egg for a replay, never a negative balance, and never two active eggs.
- Exercise reading, comment, daily/weekly walking, and assignment-submission source events twice; assert one deposit and one progress event per source, with stage transitions at 3/8/15 points.
- Exercise a failed/insufficient-balance purchase and a reward reversal; assert no orphan charge, no negative balance, and no automatic stage downgrade.
- Verify the full save/publish round trip and reload for the student creature screen, as required by the checklist's “Save And Publish Flows” section. Confirm teacher reversal permissions and downstream collection state.
- Validate all 28 stage outputs with Character Asset Studio's validators before publication: transparent 1536×1536 sheet, nine 512×512 RGBA frames, and stable normal/lazy/signature row ordering.

## Current implementation gaps and known risks

- The creature migration must be applied to the connected database before persistence-backed routes and the full student flow can run there.
- Walking sync trusts the authenticated client's submitted Health Connect-shaped row after server range/date validation. Device attestation and anti-tamper verification are not implemented, so in-range forged step counts remain a residual risk.
- Reading-log creation, wallet deposit, transaction event, and creature progress now share one serializable transaction; a payout failure rolls the log back too.
- All 28 generation manifests and published stage packages exist; visual review should continue to watch for magenta fringe around a few transparent effect edges.
- Existing avatar purchase code reads the balance before decrementing and has a concurrent-purchase race. The creature helper must use the guarded conditional decrement above, and the shared wallet purchase path should be hardened before code is consolidated.
- Wallet presenters register `creature_egg_purchase` and `creature_item_purchase` as outgoing purchases; keep this mapping covered whenever another creature spend type is introduced.
- Existing source-linked transactions use a global `(sourceType, sourceRef)` uniqueness constraint. Creature source keys must be stable and namespace-safe to avoid collisions with existing rewards.
## 영역별 학생 보상 경제

서버의 단일 정책 소스는 `src/lib/reward-policy.ts`이며 지급 실행은
`src/lib/reward-service.ts`를 통한다. 금액은 정수 원 단위이고, 장착한
슬라임/세트의 같은 영역 효과를 합산한 뒤 영역별 최대 20%(2,000bps)로
제한한다. 최종 지급액은 `floor(기본액 * (10000 + bps) / 10000)`이다.

- 독서(초록): AI 점수 5점 이상, 점수당 5원, KST 일 10회·월요일 시작 주 20회.
- 댓글(빨강): 의미 있는 정규화 댓글 1건당 5원, KST 일 10회·주 30회.
  공백/유니코드를 정규화하고 문자·숫자 4자 미만과 같은 학생의 동일 문구
  재게시는 지급하지 않는다. 삭제된 댓글을 다시 올려도 기존 문구 이력이
  남아 지급 대상이 되지 않으며, 삭제가 일·주 한도를 다시 열지 않는다.
  이미 지급한 금액은 잔액 부족이나 교사 모더레이션 실패를 만들지 않도록
  삭제 시 자동 환수하지 않는다.
- 과제(보라): 기한 내 유효한 제출마다 20원(기본 cap 0, 무제한).
- 걷기(노랑): KST 활동일마다 5,000보 단위 10원, 일 최대 4단위. 한 주에
  최대 5개의 활동일만 일간 보상을 받고, 같은 주 각 tier를 25,000보/20원,
  50,000보/40원, 75,000보/100원으로 각각 지급하며 모두 달성하면 주간
  160원이 된다.
  재동기화는 `학생:활동일:unit:N`, 주간 tier마다
  `학생:주월요일:weekly-tier:tierN` 고유 소스로 중복 지급을 막는다.

걷기 입력의 신뢰 경계는 인증된 학생 세션과 서버가 적용하는 형식/범위 제한이다.
서버는 하루 0~200,000보, 거리 0~300,000m, 요청당 최대 31일 및 허용 날짜
범위를 검증하지만 현재 Health Connect 기기 증명이나 서명된 attestation을
검증하지 않는다. 따라서 변조된 클라이언트가 허용 범위 안의 수치를 제출할
잔여 위험이 있다. 이 구현은 존재하지 않는 attestation을 가정하지 않으며,
운영 단계에서 기기 증명 도입 전까지 이 위험을 신뢰 경계로 명시한다.

`GET /api/student/walking`은 기본적으로 현재 KST 월요일 00:00부터 다음
월요일 00:00 직전까지의 고정 주간을 조회하며, 응답 `range.weekStart`와
`range.weekEnd`는 각각 포함 시작일과 배타적 종료일이다. `week=current`도
같은 고정 범위를 명시하고, 기존 `days=N` 요청은 호환을 위해 rolling 조회로
유지한다.

지급은 Serializable 트랜잭션 안에서 학생 소유 `StudentAccount` 잔액과
`Transaction` 입금을 함께 기록한다. `Transaction(sourceType, sourceRef)`의
고유 키가 재시도·동시성 최종 게이트이며, 이 행 자체가 보상 알림의 원자적
이벤트다. 별도 알림 행은 만들지 않는다. 수동 입출금 등 기존 거래는
source가 nullable이라 그대로 호환된다.
