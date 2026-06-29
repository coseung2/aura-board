"use client";

import type { LetterState } from "../engine";

type Props = {
  locale: string;
  letterStates: Map<string, LetterState>;
  onKey: (key: string) => void;
  disabled?: boolean;
};

// Minimal QWERTY layout for English. Korean mode uses the familiar 2-beolsik
// QWERTY shape and emits compatibility jamo labels; KordleBoard converts those
// labels into canonical lead/medial/trail jamo for the engine.

const EN_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

const KO_ROWS: string[][] = [
  ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅅ", "ㅛ", "ㅕ", "ㅑ", "ㅐ", "ㅔ"],
  ["ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅎ", "ㅗ", "ㅓ", "ㅏ", "ㅣ"],
  ["ENTER", "ㅋ", "ㅌ", "ㅊ", "ㅍ", "ㅠ", "ㅜ", "ㅡ", "BACK"],
];

const KO_TO_CANONICAL: Record<string, string[]> = {
  ㄱ: [
    String.fromCodePoint(0x1100),
    String.fromCodePoint(0x1101),
    String.fromCodePoint(0x11a8),
    String.fromCodePoint(0x11a9),
    String.fromCodePoint(0x11aa),
    String.fromCodePoint(0x11b0),
  ],
  ㄴ: [
    String.fromCodePoint(0x1102),
    String.fromCodePoint(0x11ab),
    String.fromCodePoint(0x11ac),
    String.fromCodePoint(0x11ad),
  ],
  ㄷ: [String.fromCodePoint(0x1103), String.fromCodePoint(0x1104), String.fromCodePoint(0x11ae)],
  ㄹ: [
    String.fromCodePoint(0x1105),
    String.fromCodePoint(0x11af),
    String.fromCodePoint(0x11b0),
    String.fromCodePoint(0x11b1),
    String.fromCodePoint(0x11b2),
    String.fromCodePoint(0x11b3),
    String.fromCodePoint(0x11b4),
    String.fromCodePoint(0x11b5),
    String.fromCodePoint(0x11b6),
  ],
  ㅁ: [String.fromCodePoint(0x1106), String.fromCodePoint(0x11b7), String.fromCodePoint(0x11b1)],
  ㅂ: [
    String.fromCodePoint(0x1107),
    String.fromCodePoint(0x1108),
    String.fromCodePoint(0x11b8),
    String.fromCodePoint(0x11b2),
    String.fromCodePoint(0x11b9),
  ],
  ㅅ: [
    String.fromCodePoint(0x1109),
    String.fromCodePoint(0x110a),
    String.fromCodePoint(0x11ba),
    String.fromCodePoint(0x11aa),
    String.fromCodePoint(0x11b3),
    String.fromCodePoint(0x11b9),
    String.fromCodePoint(0x11bb),
  ],
  ㅇ: [String.fromCodePoint(0x110b), String.fromCodePoint(0x11bc)],
  ㅈ: [
    String.fromCodePoint(0x110c),
    String.fromCodePoint(0x110d),
    String.fromCodePoint(0x11bd),
    String.fromCodePoint(0x11ac),
  ],
  ㅊ: [String.fromCodePoint(0x110e), String.fromCodePoint(0x11be)],
  ㅋ: [String.fromCodePoint(0x110f), String.fromCodePoint(0x11bf)],
  ㅌ: [String.fromCodePoint(0x1110), String.fromCodePoint(0x11c0), String.fromCodePoint(0x11b4)],
  ㅍ: [String.fromCodePoint(0x1111), String.fromCodePoint(0x11c1), String.fromCodePoint(0x11b5)],
  ㅎ: [
    String.fromCodePoint(0x1112),
    String.fromCodePoint(0x11c2),
    String.fromCodePoint(0x11ad),
    String.fromCodePoint(0x11b6),
  ],
  ㅏ: [String.fromCodePoint(0x1161)],
  ㅐ: [String.fromCodePoint(0x1162)],
  ㅑ: [String.fromCodePoint(0x1163)],
  ㅔ: [String.fromCodePoint(0x1166)],
  ㅓ: [String.fromCodePoint(0x1165)],
  ㅕ: [String.fromCodePoint(0x1167)],
  ㅗ: [String.fromCodePoint(0x1169)],
  ㅛ: [String.fromCodePoint(0x116d)],
  ㅜ: [String.fromCodePoint(0x116e)],
  ㅠ: [String.fromCodePoint(0x1172)],
  ㅡ: [String.fromCodePoint(0x1173)],
  ㅣ: [String.fromCodePoint(0x1175)],
};

function isSpecialKey(label: string): boolean {
  return label === "ENTER" || label === "BACK";
}

export function KordleKeyboard({ locale, letterStates, onKey, disabled }: Props) {
  function getKoreanKeyState(label: string): LetterState | undefined {
    const canonical = KO_TO_CANONICAL[label] ?? [];
    let best: LetterState | undefined;
    for (const char of canonical) {
      const state = letterStates.get(char);
      if (state === "correct") return state;
      if (state === "present") best = state;
      else if (state === "absent" && !best) best = state;
    }
    return best;
  }

  if (locale.toLowerCase().startsWith("ko")) {
    return (
      <div className="kordle-kbd" data-locale="ko" aria-label="한글 키보드">
        {KO_ROWS.map((row, i) => (
          <div className="kordle-kbd-row" key={i}>
            {row.map((label) => {
              const state = !isSpecialKey(label) ? getKoreanKeyState(label) : undefined;
              return (
                <button
                  key={label}
                  type="button"
                  className={[
                    "kordle-kbd-key",
                    isSpecialKey(label) ? "kordle-kbd-key--action" : "",
                    state ? `kordle-kbd-key--${state}` : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => onKey(label)}
                  disabled={disabled}
                  aria-label={label === "ENTER" ? "확인" : label === "BACK" ? "지움" : label}
                >
                  {label === "ENTER" ? "확인" : label === "BACK" ? "지움" : label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="kordle-kbd" data-locale="en" aria-label="Keyboard">
      {EN_ROWS.map((row, i) => (
        <div className="kordle-kbd-row" key={i}>
          {row.map((label) => {
            // English feedback is stored lowercase; the keyboard labels are
            // uppercase, so lowercase before lookup.
            const state = !isSpecialKey(label) ? letterStates.get(label.toLowerCase()) : undefined;
            return (
              <button
                key={label}
                type="button"
                className={[
                  "kordle-kbd-key",
                  isSpecialKey(label) ? "kordle-kbd-key--action" : "",
                  state ? `kordle-kbd-key--${state}` : "",
                ].filter(Boolean).join(" ")}
                onClick={() => onKey(label)}
                disabled={disabled}
                aria-label={isSpecialKey(label) ? (label === "ENTER" ? "Enter" : "Backspace") : label}
              >
                {label === "ENTER" ? "Enter" : label === "BACK" ? "Back" : label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
