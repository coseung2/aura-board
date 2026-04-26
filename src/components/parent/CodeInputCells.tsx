"use client";

import { useCallback, useRef } from "react";
import { CODE_LENGTH, normalizeCode } from "@/lib/class-invite-codes-shared";

// invite-code-5-digit (2026-04-26): 기존 CodeInput8 (8칸 4-4 split) →
// CodeInputCells (CODE_LENGTH 칸 단일 행). 길이는 shared 상수로 일원화.

export interface CodeInputCellsProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

const SLOT_COUNT = CODE_LENGTH;

export function CodeInputCells({ value, onChange, onComplete, disabled, autoFocus }: CodeInputCellsProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setSlot = useCallback(
    (idx: number, raw: string) => {
      const normalized = normalizeCode(raw);
      if (normalized.length === 0) {
        // backspace on a filled slot clears and stays
        const next = value.slice(0, idx) + value.slice(idx + 1);
        onChange(next.slice(0, SLOT_COUNT));
        return;
      }
      // Accept either a single char (typed) or a full paste (distribute).
      const chars = normalized.split("");
      const next = (value.slice(0, idx) + chars.join("") + value.slice(idx + chars.length)).slice(
        0,
        SLOT_COUNT
      );
      onChange(next);
      const focusIdx = Math.min(idx + chars.length, SLOT_COUNT - 1);
      refs.current[focusIdx]?.focus();
      refs.current[focusIdx]?.select();
      if (next.length === SLOT_COUNT && onComplete) {
        onComplete(next);
      }
    },
    [onChange, onComplete, value]
  );

  return (
    <div
      role="group"
      aria-label={`학급 코드 ${SLOT_COUNT}자리`}
      style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}
    >
      {Array.from({ length: SLOT_COUNT }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && idx === 0}
          aria-label={`${idx + 1}번째 자리`}
          value={value[idx] ?? ""}
          onChange={(e) => setSlot(idx, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text");
            setSlot(idx, pasted);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !(value[idx] ?? "")) {
              if (idx > 0) {
                refs.current[idx - 1]?.focus();
                refs.current[idx - 1]?.select();
              }
              return;
            }
            if (e.key === "ArrowLeft" && idx > 0) {
              e.preventDefault();
              refs.current[idx - 1]?.focus();
            } else if (e.key === "ArrowRight" && idx < SLOT_COUNT - 1) {
              e.preventDefault();
              refs.current[idx + 1]?.focus();
            }
          }}
          style={{
            width: 48,
            height: 56,
            fontSize: 22,
            textAlign: "center",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            textTransform: "uppercase",
          }}
        />
      ))}
    </div>
  );
}
