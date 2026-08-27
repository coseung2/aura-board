"use client";

import { useState } from "react";
import { buildStudentQrLoginUrl, isLoopbackAppOrigin } from "@/lib/student-qr-url";

type Student = {
  id: string;
  number: number | null;
  name: string;
  qrToken: string;
  textCode: string;
};

type Props = {
  students: Student[];
  classroomName: string;
  studentQrOrigin: string;
};

/** Render Korean text to a data URL via canvas (jsPDF can't render Korean natively) */
function textToImage(text: string, fontSize: number, maxWidth: number): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `bold ${fontSize * 3}px "Pretendard", "Noto Sans KR", sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  canvas.width = Math.min(Math.ceil(metrics.width) + 4, maxWidth * 3);
  canvas.height = Math.ceil(fontSize * 3 * 1.4);
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

export function QRPrintSheet({ students, classroomName, studentQrOrigin }: Props) {
  const [generating, setGenerating] = useState(false);

  async function handlePrint() {
    if (students.length === 0) {
      alert("출력할 학생이 없습니다.");
      return;
    }
    if (isLoopbackAppOrigin(studentQrOrigin)) {
      alert(
        "localhost 주소는 학생 기기에서 열 수 없습니다. 공개 주소나 같은 네트워크의 접속 주소로 연 뒤 QR 카드를 출력해 주세요.",
      );
      return;
    }

    setGenerating(true);
    try {
      const [{ default: jsPDF }, QRCode] = await Promise.all([
        import("jspdf"),
        import("qrcode"),
      ]);

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const cols = 5;
      const rows = 6;
      const perPage = cols * rows;

      const cardW = 36;
      const cardH = 42;
      const marginX = (pageWidth - cols * cardW) / 2;
      const marginY = 20;
      const qrSize = 24;

      // Generate all QR data URLs
      const qrDataUrls = await Promise.all(
        students.map((s) => {
          const url = buildStudentQrLoginUrl(studentQrOrigin, s.qrToken);
          return QRCode.toDataURL(url, { width: 200, margin: 1 });
        })
      );

      // Generate name images (Korean text rendered via canvas)
      const nameLabels = students.map((s) => {
        const label = s.number ? `${s.number}번 ${s.name}` : s.name;
        return textToImage(label, 7, cardW);
      });

      const totalPages = Math.ceil(students.length / perPage);

      // Header text as image (Korean)
      const headerImg = textToImage(`${classroomName} - QR 카드`, 12, pageWidth);
      const dateImg = textToImage(
        new Date().toLocaleDateString("ko-KR"),
        8,
        pageWidth
      );

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();

        // Header
        const headerW = 80;
        const headerH = 6;
        doc.addImage(headerImg, "PNG", (pageWidth - headerW) / 2, 6, headerW, headerH);
        doc.addImage(dateImg, "PNG", (pageWidth - 40) / 2, 13, 40, 4);

        const startIdx = page * perPage;
        const endIdx = Math.min(startIdx + perPage, students.length);

        for (let i = startIdx; i < endIdx; i++) {
          const pos = i - startIdx;
          const col = pos % cols;
          const row = Math.floor(pos / cols);

          const x = marginX + col * cardW;
          const y = marginY + row * cardH;

          // Card border
          doc.setDrawColor(200);
          doc.setLineWidth(0.3);
          doc.rect(x + 1, y + 1, cardW - 2, cardH - 2);

          // QR image
          const qrX = x + (cardW - qrSize) / 2;
          doc.addImage(qrDataUrls[i], "PNG", qrX, y + 2, qrSize, qrSize);

          // Student name (rendered as image for Korean support)
          const nameW = cardW - 4;
          const nameH = 4;
          doc.addImage(
            nameLabels[i],
            "PNG",
            x + (cardW - nameW) / 2,
            y + qrSize + 3,
            nameW,
            nameH
          );

          // Text code
          doc.setFontSize(6);
          doc.text(students[i].textCode, x + cardW / 2, y + qrSize + 10, {
            align: "center",
          });
        }
      }

      doc.save(`${classroomName}_QR카드.pdf`);
    } catch (err) {
      console.error("PDF 생성 실패:", err);
      alert("PDF 생성에 실패했습니다.");
    }
    setGenerating(false);
  }

  return (
    <button
      type="button"
      className="classroom-action-btn classroom-action-btn-print"
      onClick={handlePrint}
      disabled={generating || students.length === 0}
    >
      {generating ? "생성 중..." : "QR 카드 출력"}
    </button>
  );
}
