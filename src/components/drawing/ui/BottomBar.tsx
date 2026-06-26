"use client";

import { ToolStrip } from "./ToolStrip";
import type { Tool } from "../canvas/types";

const DEFAULT_PALETTE = [
  "#111111",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ffffff",
];

/** Ibis 스타일 하단 바: 좌측 undo/redo/layers · 중앙 도구 스트립 · 우측 색상. */
export function BottomBar({
  tool,
  color,
  recent,
  canUndo,
  canRedo,
  onToolChange,
  onColorClick,
  onColorPick,
  onUndo,
  onRedo,
  onLayerToggle,
}: {
  tool: Tool;
  color: string;
  recent: string[];
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (t: Tool) => void;
  onColorClick: () => void;
  onColorPick: (hex: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayerToggle: () => void;
}) {
  return (
    <div className="ds-bottombar">
      <div className="ds-bb-left">
        <button
          type="button"
          className="ds-bb-btn"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="되돌리기"
          title="되돌리기 (Ctrl+Z / 2-finger tap)"
        >
          ⟲
        </button>
        <button
          type="button"
          className="ds-bb-btn"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="다시"
          title="다시 (Ctrl+Y / 3-finger tap)"
        >
          ⟳
        </button>
        <button
          type="button"
          className="ds-bb-btn"
          onClick={onLayerToggle}
          aria-label="레이어 패널"
          title="레이어 (L)"
        >
          📁
        </button>
      </div>

      <div className="ds-bb-tools-wrap">
        <ToolStrip tool={tool} onToolChange={onToolChange} />
      </div>

      <div className="ds-bb-colors">
        <button
          type="button"
          className="ds-color-current"
          style={{ background: color }}
          onClick={onColorClick}
          aria-label={`현재 색 ${color} - 피커 열기`}
          title="색상 선택"
        />
        <div className="ds-colorbar-divider" aria-hidden="true" />
        <div className="ds-color-row" role="group" aria-label="팔레트">
          {DEFAULT_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`ds-color-swatch-sm ${c === color ? "is-active" : ""}`}
              style={{ background: c }}
              aria-label={`색 ${c}`}
              onClick={() => onColorPick(c)}
            />
          ))}
        </div>
        {recent.length > 0 && (
          <>
            <div className="ds-colorbar-divider" aria-hidden="true" />
            <div className="ds-color-row" role="group" aria-label="최근">
              {recent.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ds-color-swatch-sm ${c === color ? "is-active" : ""}`}
                  style={{ background: c }}
                  aria-label={`최근 색 ${c}`}
                  onClick={() => onColorPick(c)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
