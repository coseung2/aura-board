export function buildStudentQrLoginUrl(origin: string, qrToken: string): string {
  const baseUrl = new URL(origin);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("Student QR origin must use HTTP or HTTPS");
  }
  return new URL(`/qr/${encodeURIComponent(qrToken)}`, baseUrl.origin).toString();
}

export function isLoopbackAppOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
