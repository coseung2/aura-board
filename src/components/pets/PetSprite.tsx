import Image from "next/image";

type Props = {
  spriteKey: string;
  name: string;
  locked?: boolean;
  size?: "small" | "medium" | "large";
};

export function PetSprite({ spriteKey, name, locked = false, size = "medium" }: Props) {
  return (
    <span className={`pet-sprite pet-sprite-${size}${locked ? " is-locked" : ""}`}>
      <Image
        src={`/pets/${spriteKey}.webp`}
        alt={locked ? "아직 발견하지 못한 펫의 실루엣" : `${name} 픽셀 아트`}
        width={96}
        height={96}
        unoptimized
      />
    </span>
  );
}
