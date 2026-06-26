"use client";

import type { LetterState } from "../engine";

type Props = {
  locale: string;
  letterStates: Map<string, LetterState>;
  onKey: (key: string) => void;
  disabled?: boolean;
};

// Minimal two-row QWERTY layout for English. Korean mode shows a focused
// jamo picker (consonant + vowel rows) so the student taps a leading
// jamo, then a medial, then an optional trail to fill one slot.
// Composition happens client-side via recomposeHangul in KordleBoard.

const EN_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

// Jamos in code-point order so the keyboard emits canonical characters
// (e.g. U+1100 = ?, U+1161 = ?). String.fromCodePoint keeps the file
// ASCII-only.
const JAMO = {
  LEAD: [
    "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
    "?", "?", "?", "?", "?", "?", "?", "?", "?",
  ],
  MEDIAL: [
    "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
    "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
  ],
  TRAIL: [
    "", "?", "?", "?", "?", "?", "?", "?", "?", "?",
    "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
    "?", "?", "?", "?", "?", "?", "?", "?",
  ],
};

function isSpecialKey(label: string): boolean {
  return label === "ENTER" || label === "BACK";
}

export function KordleKeyboard({ locale, letterStates, onKey, disabled }: Props) {
  if (locale.toLowerCase().startsWith("ko")) {
    return (
      <div className="kordle-kbd" data-locale="ko" aria-label="Korean keyboard">
        <div className="kordle-kbd-row">
          {JAMO.LEAD.map((c) => (
            <button
              key={`lead-${c}`}
              type="button"
              className={`kordle-kbd-key kordle-kbd-key--lead ${letterStates.has(c) ? `kordle-kbd-key--${letterStates.get(c)}` : ""}`}
              onClick={() => onKey(c)}
              disabled={disabled}
              aria-label={`?? ${c}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="kordle-kbd-row">
          {JAMO.MEDIAL.map((c) => (
            <button
              key={`med-${c}`}
              type="button"
              className="kordle-kbd-key kordle-kbd-key--med"
              onClick={() => onKey(c)}
              disabled={disabled}
              aria-label={`?? ${c}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="kordle-kbd-row">
          {JAMO.TRAIL.map((c, i) => (
            <button
              key={`trail-${i}`}
              type="button"
              className={`kordle-kbd-key kordle-kbd-key--trail ${i === 0 ? "kordle-kbd-key--blank" : ""}`}
              onClick={() => onKey(c)}
              disabled={disabled || c === ""}
              aria-label={c ? `?? ${c}` : "?? ??"}
            >
              {c || "?"}
            </button>
          ))}
          <button
            type="button"
            className="kordle-kbd-key kordle-kbd-key--action"
            onClick={() => onKey("ENTER")}
            disabled={disabled}
          >
            ??
          </button>
          <button
            type="button"
            className="kordle-kbd-key kordle-kbd-key--action"
            onClick={() => onKey("BACK")}
            disabled={disabled}
          >
            ??
          </button>
        </div>
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
                {label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
