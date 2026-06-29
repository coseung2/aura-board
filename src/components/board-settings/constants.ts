import type { BoardSettingsTab, BoardTheme } from "./types";

export const TAB_LABELS: Record<BoardSettingsTab, string> = {
  basic: "기본",
  breakout: "브레이크아웃",
  canva: "Canva 연동",
  aura: "아우라 연동",
};

export const BOARD_THEME_OPTIONS: Array<{
  value: BoardTheme;
  label: string;
  swatch: string;
}> = [
  {
    value: "pastel-peach",
    label: "복숭아",
    swatch: "linear-gradient(135deg, #fff4ef 0%, #ffe1dc 100%)",
  },
  {
    value: "pastel-mint",
    label: "민트",
    swatch: "linear-gradient(135deg, #f2fff8 0%, #d9f6ea 100%)",
  },
  {
    value: "pastel-sky",
    label: "하늘",
    swatch: "linear-gradient(135deg, #f2f8ff 0%, #dcecff 100%)",
  },
  {
    value: "pastel-lilac",
    label: "라일락",
    swatch: "linear-gradient(135deg, #f8f4ff 0%, #eadfff 100%)",
  },
  {
    value: "pastel-lemon",
    label: "레몬",
    swatch: "linear-gradient(135deg, #fffdf1 0%, #fff1c9 100%)",
  },
];
