// refined-icons (2026-04-26): 모달/툴바용 SVG 아이콘 세트.
// Unicode 글리프 (× ‹ › ▶ ⛶) 가 글꼴별 metric 차이로 픽셀 단위로 어긋나
// 보이는 문제 해결. 모든 아이콘은 24×24 viewBox, currentColor stroke.
// stroke-width 2, line-cap round, line-join round — 미세 비대칭 X.

type IconProps = {
  size?: number;
  className?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function PlayIcon({ size = 20, className }: IconProps) {
  // 시각적 중앙 보정 위해 X 6 부터 시작 — 삼각형 무게중심이 도형 좌측에 있음.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

export function DownloadIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 4v10" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function FullscreenEnterIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="4 9 4 4 9 4" />
      <polyline points="20 9 20 4 15 4" />
      <polyline points="4 15 4 20 9 20" />
      <polyline points="20 15 20 20 15 20" />
    </svg>
  );
}

export function FullscreenExitIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polyline points="9 4 9 9 4 9" />
      <polyline points="15 4 15 9 20 9" />
      <polyline points="9 20 9 15 4 15" />
      <polyline points="15 20 15 15 20 15" />
    </svg>
  );
}

export function StarFilledIcon({ size = 20, className }: IconProps) {
  // 24-pt star, 5점 정확 대칭. 1px 진하기 stroke 으로 그라데 hint.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="starGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.95 5.97 6.6.96-4.78 4.65 1.13 6.57L12 17.55 6.1 20.65l1.13-6.57L2.45 9.43l6.6-.96L12 2.5z"
        fill="url(#starGold)"
        stroke="#d97706"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
