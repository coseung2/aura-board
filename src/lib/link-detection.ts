const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;

export function detectFirstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/, "");
}

export function removeUrlFromText(text: string, url: string): string {
  return text
    .replace(url, "")
    .replace(/[ \t]+([,.;!?])/g, "$1")
    .replace(/(^|\s)[,.;!?]+(\s|$)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
