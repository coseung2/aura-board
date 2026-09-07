import "server-only";

/**
 * Retired with /api/parent/signup and /parent/auth/callback (2026-09-07).
 * Do not restore the development signer/dispatcher: it returned usable login
 * URLs without mailbox verification. Current password and provider OAuth
 * authentication live in their dedicated routes. This module exports no API.
 */
export {};
