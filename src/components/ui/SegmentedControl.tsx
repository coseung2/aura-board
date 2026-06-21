"use client";

// Generic 3+ option segmented control — quiz-extensions B2 introduces it
// for the difficulty picker. Pure pass-through; caller owns state.

import { useId } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  const groupId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="segmented-control"
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        const id = `${groupId}-${opt.value}`;
        return (
          <button
            key={opt.value}
            id={id}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            className={`segmented-control-item${checked ? " is-active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
