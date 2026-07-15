type ActivitySparklineProps = {
  values: number[];
  label: string;
  tone?: "success" | "accent" | "danger";
};

function buildPath(values: number[], forceBaseline = false) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const width = 120;
  const height = 36;
  const padding = 3;

  return values
    .map((value, index) => {
      const x = values.length === 1
        ? width / 2
        : (index / (values.length - 1)) * (width - padding * 2) + padding;
      const normalized = range === 0 ? 0.5 : (value - min) / range;
      const y = forceBaseline
        ? height - padding
        : height - padding - normalized * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ActivitySparkline({
  values,
  label,
  tone = "success",
}: ActivitySparklineProps) {
  const normalizedValues = values
    .filter((value) => Number.isFinite(value))
    .slice(-14);
  const hasNoValues = normalizedValues.length === 0;
  const isZeroSeries = hasNoValues || normalizedValues.every((value) => value === 0);
  const chartValues = hasNoValues
    ? [0, 0, 0, 0, 0, 0, 0]
    : normalizedValues.length === 1
      ? [normalizedValues[0], normalizedValues[0]]
      : normalizedValues;

  return (
    <span
      className={`activity-sparkline activity-sparkline-${tone}${isZeroSeries ? " activity-sparkline-empty" : ""}`}
      role="img"
      aria-label={isZeroSeries ? `${label}, 0걸음` : label}
    >
      <svg viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path
          className="activity-sparkline-grid"
          d="M3 9H117 M3 18H117 M3 27H117"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="activity-sparkline-line"
          d={buildPath(chartValues, isZeroSeries)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
