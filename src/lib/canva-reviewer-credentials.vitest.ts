import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCanvaReviewerPasswordHash,
  getCanvaReviewerCredentialConfig,
  verifyCanvaReviewerPassword,
  verifyConfiguredCanvaReviewer,
} from "./canva-reviewer-credentials";

const PASSWORD = "reviewer-password-very-long";
const SALT = Buffer.alloc(16, 7);

describe("Canva reviewer credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a valid scrypt password and rejects an invalid password", () => {
    const encoded = createCanvaReviewerPasswordHash(PASSWORD, SALT);

    expect(verifyCanvaReviewerPassword(PASSWORD, encoded)).toBe(true);
    expect(verifyCanvaReviewerPassword("wrong-password", encoded)).toBe(false);
  });

  it.each(["", "sha256$salt$hash", "scrypt$bad$hash", "scrypt$only-salt"])(
    "fails closed for malformed hash %s",
    (encoded) => {
      expect(verifyCanvaReviewerPassword(PASSWORD, encoded)).toBe(false);
    },
  );

  it("requires complete server configuration", () => {
    vi.stubEnv("CANVA_REVIEWER_EMAIL", "integrations-support@canva.com");
    vi.stubEnv("CANVA_REVIEWER_PASSWORD_HASH", "");

    expect(getCanvaReviewerCredentialConfig()).toBeNull();
  });

  it("matches only the configured email and password", () => {
    const encoded = createCanvaReviewerPasswordHash(PASSWORD, SALT);
    vi.stubEnv("CANVA_REVIEWER_EMAIL", "integrations-support@canva.com");
    vi.stubEnv("CANVA_REVIEWER_PASSWORD_HASH", encoded);

    expect(
      verifyConfiguredCanvaReviewer(
        " Integrations-Support@Canva.com ",
        PASSWORD,
      ),
    ).toMatchObject({ email: "integrations-support@canva.com" });
    expect(
      verifyConfiguredCanvaReviewer("someone@example.com", PASSWORD),
    ).toBeNull();
    expect(
      verifyConfiguredCanvaReviewer(
        "integrations-support@canva.com",
        "wrong-password",
      ),
    ).toBeNull();
  });
});
