#!/usr/bin/env node
// Submits the newest App Store Connect build of a given version for review.
// Requires the EAS Apple API key environment variables to be loaded
// (normally injected by the Infisical secrets action in the workflow).
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const ASC_API_BASE = "https://api.appstoreconnect.apple.com";

const args = parseArgs({
  options: {
    "bundle-id": { type: "string", default: "com.auraboard.app" },
    version: { type: "string", required: true },
    "app-id": { type: "string" },
  },
});

const BUNDLE_ID = args.values["bundle-id"];
const VERSION = args.values.version;
const EXPECTED_ASC_APP_ID = args.values["app-id"] ?? "6780715163";

function fail(message) {
  const candidates = Object.keys(process.env)
    .filter((name) => /APPLE|ASC_API/.test(name))
    .sort();
  console.error(message);
  if (candidates.length) {
    console.error(`Loaded Apple-related env var names: ${candidates.join(", ")}`);
  } else {
    console.error(
      "No APPLE*/ASC_API* env vars are loaded. Check the Infisical secret names in project aura-board-zp9-h (path /mobile, env prod)."
    );
  }
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function loadPrivateKey() {
  const pathCandidates = ["APPLE_API_KEY_PATH"];
  for (const name of pathCandidates) {
    const value = process.env[name];
    if (value) {
      try {
        return createPrivateKey(readFileSync(value, "utf8"));
      } catch (error) {
        fail(`Unable to read private key from ${name}: ${error.message}`);
      }
    }
  }

  const rawCandidates = ["APPLE_API_KEY_P8", "APPLE_P8"];
  for (const name of rawCandidates) {
    const value = process.env[name];
    if (value?.trim()) {
      try {
        return createPrivateKey(value.trim());
      } catch {
        // Not a raw PEM; fall through to base64 candidates.
      }
    }
  }

  const base64Candidates = ["APPLE_P8_BASE64", "APPLE_API_KEY_BASE64", "APPLE_API_KEY_P8_BASE64"];
  for (const name of base64Candidates) {
    const value = process.env[name];
    if (value?.trim()) {
      try {
        const pem = Buffer.from(value.trim(), "base64").toString("utf8");
        return createPrivateKey(pem);
      } catch (error) {
        fail(`Unable to parse private key from ${name} (base64): ${error.message}`);
      }
    }
  }

  fail("No Apple API private key found (APPLE_API_KEY_PATH, APPLE_API_KEY_P8, APPLE_P8_BASE64, APPLE_API_KEY_BASE64).");
}

function loadCredentials() {
  const keyId = process.env.APPLE_API_KEY_ID ?? process.env.APPLE_KEY_ID;
  const issuerId =
    process.env.APPLE_API_KEY_ISSUER_ID ?? process.env.APPLE_API_ISSUER_ID ?? process.env.APPLE_ISSUER_ID;
  if (!keyId) fail("No APPLE_API_KEY_ID/APPLE_KEY_ID env var found.");
  if (!issuerId) fail("No APPLE_API_KEY_ISSUER_ID env var found.");
  return { keyId, issuerId, privateKey: loadPrivateKey() };
}

function createToken({ keyId, issuerId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

async function asc(pathname, options = {}, token, attempt = 1) {
  const response = await fetch(`${ASC_API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (response.ok) return response.json();

  const detail = await response.text().catch(() => "");
  // 429/5xx: retry with backoff a few times; any other error is terminal.
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    return asc(pathname, options, token, attempt + 1);
  }
  const body = detail ? ` ${detail.slice(0, 500)}` : "";
  throw new Error(`ASC API ${options.method ?? "GET"} ${pathname} -> ${response.status}${body}`);
}

function first(data, label) {
  if (!data?.data?.length) {
    throw new Error(`No ${label} found for Aura Board ${VERSION}.`);
  }
  return data.data[0];
}

const { keyId, issuerId, privateKey } = loadCredentials();
const token = createToken({ keyId, issuerId, privateKey });

// 1. Resolve the app by bundle id.
const appData = await asc(
  `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`,
  { method: "GET" },
  token
);
const app = first(appData, `app with bundle id ${BUNDLE_ID}`);
if (app.id !== EXPECTED_ASC_APP_ID) {
  throw new Error(`Resolved app id ${app.id} does not match expected ${EXPECTED_ASC_APP_ID}.`);
}
console.log(`App: ${app.attributes.name ?? BUNDLE_ID} (${app.id})`);

// 2. Find the newest app store version for this version string.
const versionsData = await asc(
  `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(
    VERSION
  )}&limit=50`,
  { method: "GET" },
  token
);
const versions = versionsData.data ?? [];
if (!versions.length) {
  throw new Error(`No App Store version ${VERSION} (iOS) found for ${app.id}.`);
}
const version = versions[0];
const state = version.attributes?.appStoreState ?? "UNKNOWN";
console.log(`App Store version ${VERSION}: id=${version.id} state=${state}`);

if (
  ["SUBMITTED_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"].includes(state) ||
  version.attributes?.appStoreState === "PENDING_APPLE_RELEASE"
) {
  console.log(`Version ${VERSION} is already in review flow (state=${state}); nothing to do.`);
  process.exit(0);
}

// 3. Make sure the version has a non-expired build attached.
const buildData = await asc(`/v1/appStoreVersions/${version.id}/build`, { method: "GET" }, token);
const build = buildData?.data;
if (!build) {
  throw new Error(`App Store version ${VERSION} has no build attached yet.`);
}
console.log(`Build: ${build.attributes?.version ?? build.id} (state=${build.attributes?.buildState ?? "UNKNOWN"})`);

// 4. Avoid duplicating an existing review submission that is still open.
const submissionsData = await asc(
  `/v1/reviewSubmissions?limit=50&sort=-submittedDate`,
  { method: "GET" },
  token
);
const openStates = ["READY_FOR_SUBMISSION", "UNRESOLVED_ISSUES", "SUBMITTED_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"];
const existing = (submissionsData.data ?? []).find(
  (submission) =>
    submission.relationships?.app?.data?.id === app.id && openStates.includes(submission.attributes?.state)
);
if (existing) {
  const existingVersionId =
    existing.relationships?.appStoreVersion?.data?.id ?? existing.relationships?.items?.data?.[0]?.relationships?.appStoreVersion?.data?.id;
  if (!existingVersionId || existingVersionId === version.id) {
    console.log(`Review submission ${existing.id} is already open (state=${existing.attributes?.state}); nothing to do.`);
    process.exit(0);
  }
}

// 5. Create the review submission and attach this app store version.
const created = await asc(
  "/v1/reviewSubmissions",
  {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        relationships: {
          app: { data: { type: "apps", id: app.id } },
        },
      },
    }),
  },
  token
);
const submissionId = created.data.id;
await asc(
  "/v1/reviewSubmissionItems",
  {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
        },
      },
    }),
  },
  token
);
console.log(`Review submission ${submissionId} created for app store version ${version.id}.`);

// 6. Submit for review.
await asc(`/v1/reviewSubmissions/${submissionId}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "reviewSubmissions",
      id: submissionId,
      attributes: { submitted: true },
    },
  }),
}, token);
console.log(`Review submission ${submissionId} submitted.`);

// 7. Poll once for the resulting state.
const deadline = Date.now() + 60_000;
let submissionState = "SUBMITTED_FOR_REVIEW";
while (Date.now() < deadline) {
  const result = await asc(`/v1/reviewSubmissions/${submissionId}`, { method: "GET" }, token);
  submissionState = result.data?.attributes?.state ?? "UNKNOWN";
  if (["WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED", "UNRESOLVED_ISSUES"].includes(submissionState)) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
console.log(
  `Final state: ${submissionState}. Track at https://appstoreconnect.apple.com/apps/${app.id}/appstore/ios/version/updates`
);

if (submissionState === "REJECTED" || submissionState === "UNRESOLVED_ISSUES") {
  process.exitCode = 1;
}
