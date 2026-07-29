import { afterEach, describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "./cron-auth";

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it.each([
    {
      name: "rejects a missing secret",
      secret: undefined,
      headers: { authorization: "Bearer cron-test" },
      expected: false,
    },
    {
      name: "rejects a blank secret",
      secret: "   ",
      headers: { authorization: "Bearer cron-test" },
      expected: false,
    },
    {
      name: "rejects a missing authorization header",
      secret: "cron-test",
      headers: {},
      expected: false,
    },
    {
      name: "rejects a malformed scheme",
      secret: "cron-test",
      headers: { authorization: "Basic cron-test" },
      expected: false,
    },
    {
      name: "rejects a wrong secret",
      secret: "cron-test",
      headers: { authorization: "Bearer wrong" },
      expected: false,
    },
    {
      name: "rejects x-vercel-cron without bearer authentication",
      secret: "cron-test",
      headers: { "x-vercel-cron": "1" },
      expected: false,
    },
    {
      name: "accepts the configured bearer secret",
      secret: "cron-test",
      headers: { authorization: "Bearer cron-test" },
      expected: true,
    },
  ])("$name", ({ secret, headers, expected }) => {
    if (secret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = secret;
    }

    const request = new Request("http://localhost/api/cron/test", { headers });
    expect(isAuthorizedCronRequest(request)).toBe(expected);
  });
});
