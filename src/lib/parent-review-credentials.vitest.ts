import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createParentReviewCodeHash,
  getParentReviewCredentialConfig,
  parentReviewIdentityMatches,
  verifyParentReviewCode,
} from "./parent-review-credentials";

const CODE = "A1B2C3";
const SALT = Buffer.alloc(16, 9);

describe("parent review credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a salted scrypt code and rejects mismatches", () => {
    const encoded = createParentReviewCodeHash(CODE, SALT);

    expect(verifyParentReviewCode(CODE, encoded)).toBe(true);
    expect(verifyParentReviewCode("wrong", encoded)).toBe(false);
    expect(verifyParentReviewCode(" a1b2c3 ", encoded)).toBe(true);

    const shortCode = createParentReviewCodeHash("367", SALT);
    expect(verifyParentReviewCode("367", shortCode)).toBe(true);
  });

  it.each(["", "sha256$salt$hash", "scrypt$bad$hash", "scrypt$only-salt"])(
    "fails closed for malformed hash %s",
    (encoded) => {
      expect(verifyParentReviewCode(CODE, encoded)).toBe(false);
    },
  );

  it("requires an identity selector and a valid hash", () => {
    const encoded = createParentReviewCodeHash(CODE, SALT);
    vi.stubEnv("PARENT_REVIEW_CODE_HASH", encoded);

    expect(getParentReviewCredentialConfig()).toBeNull();

    vi.stubEnv("PARENT_REVIEW_EMAIL", "Review.Parent@example.com");
    expect(getParentReviewCredentialConfig()).toMatchObject({
      email: "review.parent@example.com",
      codeHash: encoded,
    });
  });

  it("requires the configured parent identity", () => {
    const encoded = createParentReviewCodeHash(CODE, SALT);
    vi.stubEnv("PARENT_REVIEW_PARENT_ID", "parent_review");
    vi.stubEnv("PARENT_REVIEW_CODE_HASH", encoded);
    const config = getParentReviewCredentialConfig();

    expect(config).not.toBeNull();
    expect(
      parentReviewIdentityMatches(
        { id: "parent_review", email: "review@example.com" },
        config!,
      ),
    ).toBe(true);
    expect(
      parentReviewIdentityMatches(
        { id: "other", email: "review@example.com" },
        config!,
      ),
    ).toBe(false);
  });
});
