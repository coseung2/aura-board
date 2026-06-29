import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureAccountFor } from "@/lib/bank";
import { issueCardToken } from "@/lib/qr-token";
import {
  canvaCreateCardDesign,
  canvaUploadImageAsset,
  getStudentCanvaAccessToken,
} from "@/lib/canva";

export const runtime = "nodejs";
export const maxDuration = 30;

const CARD_WIDTH = 1050;
const CARD_HEIGHT = 600;

export async function POST() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const canvaToken = await getStudentCanvaAccessToken(student.id);
  if (!canvaToken) {
    return NextResponse.json(
      {
        error: "canva_not_connected",
        connectUrl: "/api/auth/canva/student?returnTo=/my/wallet",
      },
      { status: 401 }
    );
  }

  const { cardId } = await ensureAccountFor({
    id: student.id,
    classroomId: student.classroomId,
  });
  const card = await db.studentCard.findUnique({
    where: { id: cardId },
    select: { id: true, cardNumber: true, qrSecret: true, status: true },
  });
  if (!card || card.status !== "active") {
    return NextResponse.json({ error: "card_inactive" }, { status: 400 });
  }

  const { token: cardToken } = issueCardToken(card.id, card.qrSecret);
  const qrPng = await QRCode.toBuffer(cardToken, {
    type: "png",
    width: 600,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const safeCardNumber = card.cardNumber.replace(/[^0-9A-Za-z_-]+/g, "-");
  const assetId = await canvaUploadImageAsset(
    canvaToken,
    `aura-card-qr-${safeCardNumber}.png`,
    qrPng
  );

  const design = await canvaCreateCardDesign(canvaToken, {
    title: `${student.name} Aura card`,
    assetId,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });

  if (!design.editUrl) {
    return NextResponse.json({ error: "canva_edit_url_missing" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    designId: design.id,
    editUrl: design.editUrl,
    viewUrl: design.viewUrl,
    size: { width: CARD_WIDTH, height: CARD_HEIGHT },
  });
}
