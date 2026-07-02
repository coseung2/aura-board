"use client";

import { AVATAR_CATEGORIES } from "./types";

type Props = {
  active: string;
  onChange: (key: string) => void;
};

export function CategoryTabs({ active, onChange }: Props) {
  return (
    <div className="avatar-category-tabs" role="tablist" aria-label="카테고리">
      {AVATAR_CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          type="button"
          role="tab"
          aria-selected={active === cat.key}
          className={`avatar-category-tab${active === cat.key ? " is-active" : ""}`}
          onClick={() => onChange(cat.key)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
