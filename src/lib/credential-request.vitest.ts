import { describe, expect, it } from "vitest";
import { validateCredentialRequest } from "./credential-request";

function request(headers: Record<string, string>) {
  return new Request("https://aura-board.com/api/account/credentials/signup", {
    method: "POST",
    headers,
  });
}

describe("credential request boundary", () => {
  it("accepts same-origin JSON browser requests", () => {
    expect(validateCredentialRequest(request({
      "content-type": "application/json",
      origin: "https://aura-board.com",
    }))).toEqual({ ok: true });
  });

  it("rejects cross-site and simple text requests", () => {
    expect(validateCredentialRequest(request({
      "content-type": "application/json",
      origin: "https://attacker.test",
    }))).toEqual({ ok: false, status: 403 });
    expect(validateCredentialRequest(request({ "content-type": "text/plain" })))
      .toEqual({ ok: false, status: 400 });
  });

  it("accepts native JSON only with the custom mobile header", () => {
    expect(validateCredentialRequest(request({
      "content-type": "application/json",
      "x-aura-mobile-capabilities": "slime-wearable-assets-v1",
    }))).toEqual({ ok: true });
    expect(validateCredentialRequest(request({ "content-type": "application/json" })))
      .toEqual({ ok: false, status: 403 });
  });
});
