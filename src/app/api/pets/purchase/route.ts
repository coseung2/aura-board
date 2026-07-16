import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { getPetHome, purchasePetProduct } from "@/lib/pets/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_STATUS: Record<string, number> = {
  invalid_body: 400,
  product_not_found: 404,
  lineage_not_found: 404,
  insufficient_funds: 402,
  already_owned: 409,
  account_not_found: 404,
};

export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof (body as { productKey?: unknown }).productKey !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const productKey = (body as { productKey: string }).productKey.trim();
  if (!productKey) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await purchasePetProduct(student, productKey);
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] ?? 400 });
  }

  return NextResponse.json({
    ok: true,
    purchase: {
      productKey: result.product.key,
      productName: result.product.name,
      petId: result.petId,
      lineageId: result.lineageId,
      itemKey: result.itemKey,
    },
    home: await getPetHome(student),
  });
}
