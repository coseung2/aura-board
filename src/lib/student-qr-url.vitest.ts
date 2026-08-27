import { describe, expect, it } from "vitest";
import { buildStudentQrLoginUrl, isLoopbackAppOrigin } from "./student-qr-url";

describe("student QR URLs", () => {
  it("builds a student login URL on the supplied public origin", () => {
    expect(buildStudentQrLoginUrl("https://aura-board.com/path", "token/value")).toBe(
      "https://aura-board.com/qr/token%2Fvalue",
    );
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("recognizes loopback origin %s", (origin) => {
    expect(isLoopbackAppOrigin(origin)).toBe(true);
  });

  it("allows a LAN origin for physical-device testing", () => {
    expect(isLoopbackAppOrigin("http://192.168.0.20:3000")).toBe(false);
  });
});
