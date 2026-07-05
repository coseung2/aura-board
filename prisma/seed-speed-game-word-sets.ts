/**
 * Seed script — 스피드게임 (Speed Game, 2026-07-06) 시스템 단어 세트.
 *
 * Idempotent:
 *   - (userId=NULL, key) upsert. 시스템 세트는 userId 가 NULL 이라서
 *     같은 key 로 사용자 세트와 공존 가능.
 *   - 키워드는 trim/dedupe 후 콤마 join 으로 저장.
 *   - 기존 시스템 세트 이름/키워드/locale 이 바뀌었으면 update.
 *
 * Run: `npm run seed:speed-game` (see package.json addition).
 */

import { PrismaClient } from "@prisma/client";
import {
  parseKeywords,
  serializeKeywords,
} from "../src/lib/speed-game/score";

const prisma = new PrismaClient();

type SystemWordSet = {
  key: string;
  name: string;
  locale: "ko" | "en";
  keywords: string[];
};

const SYSTEM_WORD_SETS: SystemWordSet[] = [
  {
    key: "system-ko-fruits",
    name: "과일 (한국어)",
    locale: "ko",
    keywords: [
      "사과",
      "바나나",
      "포도",
      "딸기",
      "수박",
      "참외",
      "복숭아",
      "자두",
      "오렌지",
      "레몬",
      "키위",
      "망고",
      "파인애플",
      "체리",
      "자몽",
      "배",
      "감",
      "귤",
      "석류",
      "무화과",
    ],
  },
  {
    key: "system-ko-animals",
    name: "동물 (한국어)",
    locale: "ko",
    keywords: [
      "강아지",
      "고양이",
      "토끼",
      "호랑이",
      "사자",
      "코끼리",
      "기린",
      "원숭이",
      "판다",
      "코알라",
      "캥거루",
      "여우",
      "늑대",
      "곰",
      "사슴",
      "두더지",
      "다람쥐",
      "햄스터",
      "거북이",
      "물고기",
    ],
  },
  {
    key: "system-ko-school",
    name: "학교생활 (한국어)",
    locale: "ko",
    keywords: [
      "교실",
      "도서관",
      "운동장",
      "급식",
      "방과후",
      "수업",
      "시험",
      "숙제",
      "줄서기",
      "쉬는시간",
      "등교",
      "하교",
      "현장학습",
      "소풍",
      "졸업식",
      "입학식",
      "방학",
      "개학",
      "교장선생님",
      "담임선생님",
    ],
  },
  {
    key: "system-ko-sports",
    name: "운동 (한국어)",
    locale: "ko",
    keywords: [
      "축구",
      "농구",
      "배구",
      "야구",
      "테니스",
      "탁구",
      "배드민턴",
      "수영",
      "달리기",
      "줄다리기",
      "피구",
      "족구",
      "발야구",
      "스케이트",
      "하키",
      "골프",
      "검도",
      "태권도",
      "유도",
      "공수도",
    ],
  },
  {
    key: "system-en-animals",
    name: "Animals (English)",
    locale: "en",
    keywords: [
      "dog",
      "cat",
      "rabbit",
      "tiger",
      "lion",
      "elephant",
      "giraffe",
      "monkey",
      "panda",
      "koala",
      "kangaroo",
      "fox",
      "wolf",
      "bear",
      "deer",
      "squirrel",
      "hamster",
      "turtle",
      "fish",
      "bird",
    ],
  },
  {
    key: "system-en-fruits",
    name: "Fruits (English)",
    locale: "en",
    keywords: [
      "apple",
      "banana",
      "grape",
      "strawberry",
      "watermelon",
      "peach",
      "orange",
      "lemon",
      "kiwi",
      "mango",
      "pineapple",
      "cherry",
      "grapefruit",
      "pear",
      "persimmon",
      "tangerine",
      "pomegranate",
      "fig",
      "plum",
      "blueberry",
    ],
  },
];

async function main() {
  console.log("🏁 Speed Game word-set seed start");

  let created = 0;
  let updated = 0;

  for (const set of SYSTEM_WORD_SETS) {
    const keywords = parseKeywords(set.keywords);
    if (keywords.length === 0) {
      console.warn(`  ⚠ ${set.key}: empty after parse, skip`);
      continue;
    }
    if (keywords.length > 100) {
      console.warn(`  ⚠ ${set.key}: >100 keywords (${keywords.length}), truncating`);
    }
    const serialized = serializeKeywords(keywords.slice(0, 100));

    // @@unique([userId, key]) in schema. userId=NULL rows are distinct
    // per row, so use findFirst instead of findUnique.
    const found = await prisma.speedGameWordSet.findFirst({
      where: { userId: null, key: set.key },
      select: { id: true },
    });

    if (found) {
      await prisma.speedGameWordSet.update({
        where: { id: found.id },
        data: {
          name: set.name,
          locale: set.locale,
          keywords: serialized,
        },
      });
      updated += 1;
    } else {
      await prisma.speedGameWordSet.create({
        data: {
          userId: null,
          key: set.key,
          name: set.name,
          locale: set.locale,
          keywords: serialized,
        },
      });
      created += 1;
    }
  }

  console.log(
    `✅ Speed Game word-set seed — sets=${SYSTEM_WORD_SETS.length} created=${created} updated=${updated}`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Speed Game seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
