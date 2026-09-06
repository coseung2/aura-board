/** Current structured replies plus historical HTML/code-fence messages. */
export function extractAgentHtml(content: string): string | null {
  let source = content.trim();
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed && typeof parsed === "object") {
      const value = parsed as { code?: unknown; message?: unknown };
      if (typeof value.code === "string" && value.code.trim()) return value.code.trim();
      if (typeof value.message === "string") source = value.message.trim();
    }
  } catch { /* Historical replies were not JSON. */ }
  const fence = source.match(/```html?\s*\n([\s\S]*?)```/i);
  if (fence) return fence[1].trim() || null;
  return /^<(?:!doctype\b|[a-z][\w-]*(?:\s|>))/i.test(source) ? source : null;
}
