import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  slimeFind: vi.fn(),
  slimeUpdate: vi.fn(),
  inventoryFind: vi.fn(),
  inventoryUpdateMany: vi.fn(),
  inventoryFindById: vi.fn(),
  useFind: vi.fn(),
  useCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    studentSlime: { findUnique: mocks.slimeFind, update: mocks.slimeUpdate },
    studentCreatureItem: {
      findUnique: mocks.inventoryFind,
      updateMany: mocks.inventoryUpdateMany,
    },
    creatureItemUse: { findFirst: mocks.useFind, create: mocks.useCreate },
  },
}));

import {
  consumeSlimeCookie,
  SlimeServiceError,
} from "./service";
import {
  SLIME_COOKIE_GROWTH_SECONDS,
  SLIME_GROWTH_SECONDS_PER_DAY,
} from "./growth";

const student = { id: "student-1", classroomId: "classroom-1" };

describe("slime cookie consumption", () => {
  let slime: {
    id: string;
    color: string;
    isEquipped: boolean;
    growthStage: number;
    growthSeconds: number;
    growthRemainderBps: number;
    growthLastSettledAt: Date;
    growthAppliedSpeedBps: number;
  };
  let inventory: { id: string; itemKind: string; quantity: number };
  const uses = new Map<string, { itemKey: string; effectSnapshot: unknown }>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    vi.clearAllMocks();
    slime = {
      id: "slime-1",
      color: "blue",
      isEquipped: true,
      growthStage: 1,
      growthSeconds: 0,
      growthRemainderBps: 0,
      growthLastSettledAt: new Date(0),
      growthAppliedSpeedBps: 0,
    };
    inventory = { id: "cookie-inventory", itemKind: "slime-food", quantity: 2 };
    uses.clear();

    mocks.useFind.mockImplementation(async ({ where }: { where: { sourceRef: string } }) =>
      uses.get(where.sourceRef) ?? null,
    );
    mocks.useCreate.mockImplementation(async ({ data }: { data: { idempotencyKey: string; itemKey: string; effectSnapshot: unknown } }) => {
      const row = { itemKey: data.itemKey, effectSnapshot: data.effectSnapshot };
      uses.set(data.idempotencyKey, row);
      return row;
    });
    mocks.slimeFind.mockImplementation(async () => ({ ...slime }));
    mocks.slimeUpdate.mockImplementation(async ({ data }: { data: Partial<typeof slime> }) => {
      Object.assign(slime, data);
      return { ...slime };
    });
    mocks.inventoryFind.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id ? { quantity: inventory.quantity } : { ...inventory },
    );
    mocks.inventoryUpdateMany.mockImplementation(async () => {
      if (inventory.quantity < 1) return { count: 0 };
      inventory.quantity -= 1;
      return { count: 1 };
    });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        studentSlime: { findUnique: mocks.slimeFind, update: mocks.slimeUpdate },
        studentCreatureItem: {
          findUnique: mocks.inventoryFind,
          updateMany: mocks.inventoryUpdateMany,
        },
        creatureItemUse: { findFirst: mocks.useFind, create: mocks.useCreate },
      }),
    );
  });

  afterEach(() => vi.useRealTimers());

  it("settles, grants an absolute stage-1 bonus, decrements once, and replays safely", async () => {
    const first = await consumeSlimeCookie(student, "slime-cookie", "blue", "cookie-1");
    expect(first.itemKey).toBe("slime-cookie");
    expect(first.remainingQuantity).toBe(1);
    expect(first.growth.growthSeconds).toBe(SLIME_COOKIE_GROWTH_SECONDS);
    expect(slime.growthSeconds).toBe(SLIME_COOKIE_GROWTH_SECONDS);

    const replay = await consumeSlimeCookie(student, "slime-cookie", "blue", "cookie-1");
    expect(replay).toEqual(first);
    expect(inventory.quantity).toBe(1);
    expect(mocks.slimeUpdate).toHaveBeenCalledTimes(1);

    const second = await consumeSlimeCookie(student, "slime-cookie", "blue", "cookie-2");
    expect(second.remainingQuantity).toBe(0);
    expect(second.growth.growthSeconds).toBe(SLIME_COOKIE_GROWTH_SECONDS * 2);
    expect(inventory.quantity).toBe(0);
  });

  it("uses the same absolute seconds at stage 2, where the displayed stage span is larger", async () => {
    slime.growthStage = 2;
    slime.growthSeconds = 10 * SLIME_GROWTH_SECONDS_PER_DAY;
    const result = await consumeSlimeCookie(student, "slime-cookie", "blue", "cookie-stage-2");
    expect(result.growth.stage).toBe(2);
    expect(result.growth.growthSeconds).toBe(
      10 * SLIME_GROWTH_SECONDS_PER_DAY + SLIME_COOKIE_GROWTH_SECONDS,
    );
    expect(result.growth.remainingSeconds).toBe(
      15 * SLIME_GROWTH_SECONDS_PER_DAY - SLIME_COOKIE_GROWTH_SECONDS,
    );
  });

  it("requires a matching owned slime and cookie inventory", async () => {
    mocks.slimeFind.mockResolvedValue(null);
    await expect(
      consumeSlimeCookie(student, "slime-cookie", "blue", "missing-slime"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "not_owned", status: 403 });
  });
});
