const ADJECTIVES = [
  "용감한",
  "신중한",
  "영리한",
  "재빠른",
  "냉철한",
  "대담한",
  "고요한",
  "치밀한",
  "은밀한",
  "침착한",
  "예리한",
  "강인한",
] as const;

const ANIMALS = [
  "늑대",
  "부엉이",
  "여우",
  "치타",
  "표범",
  "매",
  "까마귀",
  "독수리",
  "살쾡이",
  "사자",
  "호랑이",
  "코브라",
] as const;

export function createShadowAllianceNickname(
  usedNicknames: ReadonlySet<string> | readonly string[] = [],
): string {
  const used = usedNicknames instanceof Set ? usedNicknames : new Set(usedNicknames);
  for (let index = 0; index < 500; index += 1) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const nickname = `${adjective} ${animal}`;
    if (!used.has(nickname)) return nickname;
  }
  return `그림자 ${used.size + 1}`;
}

export function createShadowAllianceNicknames(count: number): string[] {
  const used = new Set<string>();
  const nicknames: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const nickname = createShadowAllianceNickname(used);
    used.add(nickname);
    nicknames.push(nickname);
  }
  return nicknames;
}
