/**
 * Unequip and refund shop items retired by the vehicle rework.
 *
 * Two catalog changes strand student inventory:
 *   1. `water-puddle-background` is removed outright.
 *   2. the trampoline moves from the floor slot to the new vehicle category, so
 *      its persisted `floor` state no longer resolves.
 *
 * A retired key can no longer be priced from the catalog, so the refund amount
 * comes from the student's own purchase transaction. That also keeps the ledger
 * honest for anyone who bought at a different price. Refunds are idempotent:
 * a purchase that already has a matching refund row is skipped, so re-running
 * this script never pays twice.
 *
 * Usage:
 *   node scripts/migrate-retired-slime-items.mjs --dry-run
 *   node scripts/migrate-retired-slime-items.mjs --apply --confirm-target <database>
 *
 * Both modes print the resolved `DATABASE_URL` host and database first, and
 * `--apply` refuses to run unless `--confirm-target` matches that database.
 */
import { PrismaClient } from "@prisma/client";

const RETIRED_ITEM_KEYS = ["water-puddle-background"];
/** Keys that stay purchasable but must drop their stale equipped floor state. */
const RESLOTTED_ITEM_KEYS = ["slime-blue-trampoline"];

/**
 * Ledger identifiers, mirrored from `src/lib/pets/service-contract.ts`.
 *
 * `sourceType`/`type` use underscores while the human-readable `note` uses
 * hyphens. Mixing them up makes this script silently match nothing, so the two
 * shapes are named apart here.
 */
const PURCHASE_SOURCE_TYPE = "slime_item_purchase";
const REFUND_SOURCE_TYPE = "slime_item_refund";
const purchaseNote = (itemKey) => `slime-item-purchase:${itemKey}`;
const refundNote = (itemKey) => `slime-item-refund:${itemKey}`;

const prisma = new PrismaClient();

function parseMode(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  // Mutually exclusive on purpose: a command carrying both flags is ambiguous,
  // and silently preferring --apply is the wrong way to resolve it for a script
  // that moves money.
  if (apply && dryRun) {
    console.error("Pass either --dry-run or --apply, not both.");
    process.exit(2);
  }
  if (apply) return "apply";
  if (dryRun) return "dry-run";
  console.error(
    "Usage: node scripts/migrate-retired-slime-items.mjs [--dry-run | --apply]",
  );
  process.exit(2);
}

/**
 * Human-readable target, with credentials stripped.
 *
 * A branch name guarantees nothing: the only thing that decides whose wallets
 * this touches is `DATABASE_URL`. Printing host and database makes an accidental
 * production connection visible before any money moves.
 */
function describeTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error(
      "DATABASE_URL is not set. Refusing to run so this cannot silently hit the wrong database.",
    );
    process.exit(2);
  }
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    // Never echo the raw value; it carries the password.
    return "unparseable DATABASE_URL";
  }
}

/**
 * Require the operator to name the database they think they are touching.
 *
 * `--apply` credits real student wallets and is only idempotent per purchase, so
 * a mistyped environment is the expensive failure. `--confirm-target` must match
 * the resolved database name.
 */
function assertConfirmedTarget(argv, target) {
  const index = argv.indexOf("--confirm-target");
  const provided = index >= 0 ? argv[index + 1] : undefined;
  const databaseName = target.slice(target.lastIndexOf("/") + 1);
  if (!provided) {
    console.error(
      `--apply requires --confirm-target <database>. Resolved target: ${target}`,
    );
    process.exit(2);
  }
  if (provided !== databaseName) {
    console.error(
      `--confirm-target "${provided}" does not match the resolved database "${databaseName}". Aborting.`,
    );
    process.exit(2);
  }
}

/**
 * Purchase this refund should reverse.
 *
 * Prefers the transaction the inventory row actually points at, matching what
 * `refundSlimeShopItem` does. Falling back to the newest note match would
 * otherwise reverse a different purchase for students whose history contains a
 * refund-then-rebuy.
 */
async function findRefundablePurchase(tx, studentId, itemKey, purchaseTransactionId) {
  const linked = purchaseTransactionId
    ? await tx.transaction.findUnique({
        where: { id: purchaseTransactionId },
        select: {
          id: true,
          amount: true,
          accountId: true,
          type: true,
          sourceType: true,
          note: true,
          account: { select: { studentId: true } },
        },
      })
    : null;
  /**
   * The FK alone does not prove the linked row belongs to this student and item,
   * and this script moves money. Verify owner and note before trusting it;
   * anything unverified falls through to the note-scoped lookup, which is
   * already constrained to this student and item.
   */
  const linkedIsTrustworthy =
    linked !== null &&
    linked.type === PURCHASE_SOURCE_TYPE &&
    linked.sourceType === PURCHASE_SOURCE_TYPE &&
    linked.note === purchaseNote(itemKey) &&
    linked.account?.studentId === studentId;
  const purchase = linkedIsTrustworthy
    ? linked
    : await tx.transaction.findFirst({
          where: {
            type: PURCHASE_SOURCE_TYPE,
            sourceType: PURCHASE_SOURCE_TYPE,
            note: purchaseNote(itemKey),
            account: { studentId },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, amount: true, accountId: true },
        });
  if (!purchase || purchase.amount <= 0) return null;
  const alreadyRefunded = await tx.transaction.findFirst({
    where: {
      sourceType: REFUND_SOURCE_TYPE,
      sourceRef: purchase.id,
      account: { studentId },
    },
    select: { id: true },
  });
  return alreadyRefunded ? null : purchase;
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const target = describeTarget();
  console.log(`mode: ${mode}`);
  console.log(`target: ${target}`);
  if (mode === "apply") assertConfirmedTarget(argv, target);
  const allKeys = [...RETIRED_ITEM_KEYS, ...RESLOTTED_ITEM_KEYS];

  const inventories = await prisma.studentCreatureItem.findMany({
    where: { itemKey: { in: allKeys }, quantity: { gt: 0 } },
    select: {
      id: true,
      studentId: true,
      itemKey: true,
      quantity: true,
      purchaseTransactionId: true,
    },
  });
  const equipped = await prisma.studentSlime.findMany({
    where: { equippedItemKeys: { hasSome: allKeys } },
    select: { id: true, studentId: true, equippedItemKeys: true },
  });

  const summary = {
    mode,
    inventoriesFound: inventories.length,
    equippedSlimesFound: equipped.length,
    refunded: 0,
    refundedAmount: 0,
    unequipped: 0,
    skippedNoPurchase: 0,
  };

  for (const slime of equipped) {
    if (mode === "dry-run") {
      const stale = slime.equippedItemKeys.some((key) => allKeys.includes(key));
      if (stale) summary.unequipped += 1;
      continue;
    }
    /**
     * Re-read inside the transaction before writing.
     *
     * The scan above is a snapshot: a student who equips something after it and
     * before this write would lose that change if we pushed the stale array
     * back. Filtering the freshly read row keeps live edits intact, so this can
     * run against production traffic.
     */
    const changed = await prisma.$transaction(async (tx) => {
      /**
       * Lock the row before rewriting the whole array.
       *
       * `findUnique` takes no row lock, so a concurrent equip committing between
       * the read and the write would be silently overwritten. `FOR UPDATE` makes
       * that request wait, so the array we filter is the one we replace.
       */
      const locked = await tx.$queryRaw`
        SELECT "equippedItemKeys"
        FROM "StudentSlime"
        WHERE "id" = ${slime.id}
        FOR UPDATE
      `;
      const lockedRow = Array.isArray(locked) ? locked[0] : null;
      const currentKeys = lockedRow?.equippedItemKeys;
      if (!Array.isArray(currentKeys)) {
        // A missing row or an unexpected shape must not silently clear anyone's
        // loadout, so skip rather than guess.
        return false;
      }
      const nextKeys = currentKeys.filter((key) => !allKeys.includes(key));
      if (nextKeys.length === currentKeys.length) return false;
      await tx.studentSlime.update({
        where: { id: slime.id },
        data: { equippedItemKeys: nextKeys },
      });
      return true;
    });
    if (changed) summary.unequipped += 1;
  }

  // Only fully retired keys are refunded. A reslotted item is still owned and
  // usable, so taking the money back would be wrong.
  for (const inventory of inventories) {
    if (!RETIRED_ITEM_KEYS.includes(inventory.itemKey)) continue;
    if (mode === "dry-run") {
      const purchase = await findRefundablePurchase(
        prisma,
        inventory.studentId,
        inventory.itemKey,
        inventory.purchaseTransactionId,
      );
      if (!purchase) {
        summary.skippedNoPurchase += 1;
        continue;
      }
      summary.refunded += 1;
      summary.refundedAmount += purchase.amount;
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await findRefundablePurchase(
        tx,
        inventory.studentId,
        inventory.itemKey,
        inventory.purchaseTransactionId,
      );
      if (!purchase) return null;
      const account = await tx.studentAccount.update({
        where: { id: purchase.accountId },
        data: { balance: { increment: purchase.amount } },
        select: { balance: true },
      });
      await tx.transaction.create({
        data: {
          accountId: purchase.accountId,
          type: "refund",
          amount: purchase.amount,
          balanceAfter: account.balance,
          note: refundNote(inventory.itemKey),
          sourceType: REFUND_SOURCE_TYPE,
          sourceRef: purchase.id,
          performedById: inventory.studentId,
          performedByKind: "owner",
        },
      });
      await tx.studentCreatureItem.update({
        where: { id: inventory.id },
        data: { quantity: 0, isEquipped: false, purchaseTransactionId: purchase.id },
      });
      return purchase.amount;
    });

    if (result === null) {
      summary.skippedNoPurchase += 1;
      continue;
    }
    summary.refunded += 1;
    summary.refundedAmount += result;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
