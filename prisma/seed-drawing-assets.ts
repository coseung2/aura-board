/**
 * Seeds a handful of reusable design-asset stickers into `StudentAsset`
 * rows so the shared class gallery has content on a fresh install. All assets
 * are marked `isSharedToClass=true` so the existing
 * GET /api/student-assets?scope=shared endpoint picks them up without schema
 * or endpoint changes.
 *
 * Storage strategy: inline SVG data URIs in fileUrl. Svg is fine because
 *   (1) the existing <img loading="lazy"> gallery renders it,
 *   (2) drawImage accepts an <img> backed by an SVG data URI,
 *   (3) there is no separate thumbnail pipeline to wire up.
 *
 * Owner: the first student in the demo classroom (`c_plant_demo` by
 * convention). If that classroom doesn't exist yet the script exits
 * cleanly — devs who haven't run `npm run seed` first won't see failures.
 *
 * Run: `npm run seed:drawing-assets`. Idempotent — assets are keyed on a
 * deterministic "seed:{slug}" title and skipped on re-run.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Sticker = { slug: string; title: string; svg: string };

const STICKERS: Sticker[] = [
  {
    slug: "star",
    title: "별",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
      <polygon points="60,10 74,48 114,48 82,72 94,110 60,86 26,110 38,72 6,48 46,48"
               fill="#ffd23f" stroke="#b8860b" stroke-width="3" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    slug: "heart",
    title: "하트",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
      <path d="M60 104 L20 66 a22 22 0 1 1 40-26 a22 22 0 1 1 40 26 z"
            fill="#e74c3c" stroke="#922b21" stroke-width="3" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    slug: "check",
    title: "체크",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
      <circle cx="60" cy="60" r="52" fill="#2ecc71" stroke="#1e8449" stroke-width="3"/>
      <path d="M34 62 L54 82 L88 44" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    slug: "speech-bubble",
    title: "말풍선",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="320" height="240">
      <path d="M12 20 h136 a8 8 0 0 1 8 8 v56 a8 8 0 0 1 -8 8 h-60 l-22 18 v-18 h-54 a8 8 0 0 1 -8 -8 v-56 a8 8 0 0 1 8 -8 z"
            fill="#ffffff" stroke="#2c3e50" stroke-width="3" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    slug: "arrow-right",
    title: "오른쪽 화살표",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="320" height="160">
      <polygon points="10,32 110,32 110,10 150,40 110,70 110,48 10,48"
               fill="#3498db" stroke="#1f618d" stroke-width="3" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    slug: "frame",
    title: "액자 프레임",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="320" height="240">
      <rect x="6" y="6" width="148" height="108" rx="6" fill="none" stroke="#8e44ad" stroke-width="10"/>
      <rect x="20" y="20" width="120" height="80" rx="2" fill="none" stroke="#8e44ad" stroke-width="2" stroke-dasharray="4 4"/>
    </svg>`,
  },
];

function svgToDataUri(svg: string): string {
  // `unescape(encodeURIComponent(...))` → UTF-8 → base64. Necessary because
  // btoa only accepts latin1; the Korean characters in `title` trigger an
  // InvalidCharacterError without the encode.
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

async function main() {
  const classroom = await db.classroom.findUnique({
    where: { code: "C_PLANTD" }, // demo classroom code, seeded by seed.ts
  }).catch(() => null);

  // Fallback: pick the first classroom that has a student. Demo
  // deployments with a different seed path still get assets.
  const target =
    classroom ??
    (await db.classroom.findFirst({
      where: { students: { some: {} } },
      orderBy: { createdAt: "asc" },
    }));
  if (!target) {
    console.log("No classroom found — run `npm run seed` first. Skipping.");
    return;
  }

  const student = await db.student.findFirst({
    where: { classroomId: target.id },
    orderBy: [{ number: "asc" }, { createdAt: "asc" }],
  });
  if (!student) {
    console.log(`Classroom ${target.id} has no students — skipping.`);
    return;
  }

  for (const s of STICKERS) {
    const title = `seed:${s.slug}`;
    const existing = await db.studentAsset.findFirst({
      where: { studentId: student.id, title },
    });
    if (existing) {
      console.log(`  ↷ ${title} — already seeded`);
      continue;
    }
    const fileUrl = svgToDataUri(s.svg);
    await db.studentAsset.create({
      data: {
        studentId: student.id,
        classroomId: target.id,
        title,
        fileUrl,
        thumbnailUrl: fileUrl,
        format: "image/svg+xml",
        sizeBytes: fileUrl.length,
        isSharedToClass: true,
        source: "upload",
      },
    });
    console.log(`  ✓ ${title} — ${s.title}`);
  }
  console.log(`Seed completed for classroom ${target.name} (${target.id}).`);
}

main()
  .catch((e) => {
    console.error("seed failed", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
