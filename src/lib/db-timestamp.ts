export function normalizeDbTimestamp(value: string): string {
  const trimmed = value.trim();
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
  ) {
    return `${trimmed}Z`;
  }
  return trimmed;
}
