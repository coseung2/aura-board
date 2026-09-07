#!/usr/bin/env node
// Validates App Store release slots and submits the newest build of a version
// for review. Apple credentials are normally injected by Infisical in CI.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ASC_API_BASE = "https://api.appstoreconnect.apple.com";
const DEFAULT_BUNDLE_ID = "com.auraboard.app";
const DEFAULT_APP_ID = "6780715163";
const REVIEW_ACTIVE_STATES = new Set([
  "READY_FOR_SUBMISSION",
  "UNRESOLVED_ISSUES",
  "SUBMITTED_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
]);
const VERSION_RETRYABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "METADATA_REJECTED",
  "REJECTED",
]);
const VERSION_ALREADY_SUBMITTED_STATES = new Set([
  "SUBMITTED_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PROCESSING_FOR_APP_STORE",
  "READY_FOR_SALE",
  "READY_FOR_DISTRIBUTION",
]);

function credentialError(message, env = process.env) {
  const candidates = Object.keys(env)
    .filter((name) => /APPLE|ASC_API/.test(name))
    .sort();
  const suffix = candidates.length
    ? ` Loaded Apple-related env var names: ${candidates.join(", ")}.`
    : " No APPLE*/ASC_API* env vars are loaded. Check Infisical project aura-board-zp9-h (prod /mobile).";
  throw new Error(`${message}${suffix}`);
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function loadPrivateKey(env = process.env) {
  for (const name of ["APPLE_API_KEY_PATH"]) {
    const value = env[name];
    if (!value) continue;
    try {
      return createPrivateKey(readFileSync(value, "utf8"));
    } catch (error) {
      credentialError(`Unable to read private key from ${name}: ${error.message}.`, env);
    }
  }

  for (const name of ["APPLE_API_KEY_P8", "APPLE_P8"]) {
    const value = env[name];
    if (!value?.trim()) continue;
    try {
      return createPrivateKey(value.trim());
    } catch {
      // It may be base64 content. Fall through to the explicit base64 names.
    }
  }

  for (const name of ["APPLE_P8_BASE64", "APPLE_API_KEY_BASE64", "APPLE_API_KEY_P8_BASE64"]) {
    const value = env[name];
    if (!value?.trim()) continue;
    try {
      return createPrivateKey(Buffer.from(value.trim(), "base64").toString("utf8"));
    } catch (error) {
      credentialError(`Unable to parse private key from ${name}: ${error.message}.`, env);
    }
  }

  credentialError(
    "No Apple API private key found (APPLE_API_KEY_PATH, APPLE_API_KEY_P8, APPLE_P8_BASE64, APPLE_API_KEY_BASE64).",
    env,
  );
}

function loadCredentials(env = process.env) {
  const keyId = env.APPLE_API_KEY_ID ?? env.APPLE_KEY_ID;
  const issuerId =
    env.APPLE_API_KEY_ISSUER_ID ?? env.APPLE_API_ISSUER_ID ?? env.APPLE_ISSUER_ID;
  if (!keyId) credentialError("No APPLE_API_KEY_ID/APPLE_KEY_ID env var found.", env);
  if (!issuerId) credentialError("No APPLE_API_KEY_ISSUER_ID env var found.", env);
  return { keyId, issuerId, privateKey: loadPrivateKey(env) };
}

export function createAppStoreToken({ keyId, issuerId, privateKey }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: nowSeconds,
    exp: nowSeconds + 20 * 60,
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

function numericParts(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    throw new Error(`${label} must contain only numeric dot-separated components: ${normalized || "<empty>"}`);
  }
  return normalized.split(".").map((part) => Number(part));
}

export function compareNumericVersions(left, right) {
  const a = numericParts(left, "Version");
  const b = numericParts(right, "Version");
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function versionString(version) {
  return version?.attributes?.versionString ?? "";
}

function versionState(version) {
  return version?.attributes?.appStoreState ?? "UNKNOWN";
}

function buildNumber(build) {
  return build?.attributes?.version ?? "";
}

function buildProcessingState(build) {
  return build?.attributes?.processingState ?? "UNKNOWN";
}

export function assertAppStoreReleasePreflight({
  targetVersion,
  versions = [],
  submissions = [],
  builds = [],
  candidateBuildNumber,
}) {
  numericParts(targetVersion, "Target App Store version");

  const targetMatches = versions.filter((version) => versionString(version) === targetVersion);
  if (targetMatches.length > 1) {
    throw new Error(`App Store has ${targetMatches.length} records for version ${targetVersion}; resolve the duplicate state before release.`);
  }

  const target = targetMatches[0];
  if (target && !VERSION_RETRYABLE_STATES.has(versionState(target))) {
    throw new Error(
      `App Store version ${targetVersion} already exists in state ${versionState(target)}; choose a newer marketing version.`,
    );
  }

  const blockingNewerVersion = versions
    .filter((version) => version !== target && /^\d+(?:\.\d+)*$/.test(versionString(version)))
    .sort((left, right) => compareNumericVersions(versionString(right), versionString(left)))
    .find((version) => compareNumericVersions(versionString(version), targetVersion) >= 0);
  if (blockingNewerVersion) {
    throw new Error(
      `App Store already has version ${versionString(blockingNewerVersion)} (${versionState(blockingNewerVersion)}), which is not older than ${targetVersion}.`,
    );
  }

  const openSubmission = submissions.find((submission) =>
    REVIEW_ACTIVE_STATES.has(submission?.attributes?.state),
  );
  if (openSubmission) {
    throw new Error(
      `App Store review submission ${openSubmission.id ?? "<unknown>"} is already open (${openSubmission.attributes.state}); close or finish it before creating a new release.`,
    );
  }

  if (candidateBuildNumber !== undefined && candidateBuildNumber !== null && String(candidateBuildNumber).trim()) {
    const candidate = String(candidateBuildNumber).trim();
    numericParts(candidate, "Candidate iOS build number");
    const usedBuilds = builds.filter((build) => /^\d+(?:\.\d+)*$/.test(buildNumber(build)));
    const duplicate = usedBuilds.find((build) => buildNumber(build) === candidate);
    if (duplicate) {
      throw new Error(`iOS build number ${candidate} is already present in App Store Connect.`);
    }
    const highest = usedBuilds
      .map(buildNumber)
      .sort((left, right) => compareNumericVersions(right, left))[0];
    if (highest && compareNumericVersions(candidate, highest) <= 0) {
      throw new Error(
        `Candidate iOS build number ${candidate} must be greater than the highest App Store Connect build ${highest}.`,
      );
    }
  }

  return {
    targetExists: Boolean(target),
    targetState: target ? versionState(target) : null,
    openSubmission: null,
  };
}

function createAscClient(token, fetchImpl = fetch) {
  return async function asc(pathname, options = {}, attempt = 1) {
    const response = await fetchImpl(`${ASC_API_BASE}${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (response.ok) {
      return response.status === 204 ? {} : response.json();
    }

    const detail = await response.text().catch(() => "");
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
      return asc(pathname, options, attempt + 1);
    }
    const body = detail ? ` ${detail.slice(0, 4000)}` : "";
    throw new Error(`ASC API ${options.method ?? "GET"} ${pathname} -> ${response.status}${body}`);
  };
}

function first(data, label) {
  if (!data?.data?.length) throw new Error(`No ${label} found.`);
  return data.data[0];
}

async function resolveApp({ asc, bundleId, expectedAppId }) {
  const appData = await asc(
    `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`,
    { method: "GET" },
  );
  const app = first(appData, `app with bundle id ${bundleId}`);
  if (app.id !== expectedAppId) {
    throw new Error(`Resolved App Store app id ${app.id} does not match expected ${expectedAppId}.`);
  }
  return app;
}

async function inspectReleaseSlot({ asc, app, targetVersion }) {
  const [versionsData, submissionsData, buildsData] = await Promise.all([
    asc(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=200`, { method: "GET" }),
    asc(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=200`, { method: "GET" }),
    asc(`/v1/builds?filter[app]=${app.id}&limit=200`, { method: "GET" }),
  ]);
  return {
    targetVersion,
    versions: versionsData.data ?? [],
    submissions: submissionsData.data ?? [],
    builds: buildsData.data ?? [],
  };
}

async function getTargetBuilds({ asc, app, targetVersion }) {
  const data = await asc(
    `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${encodeURIComponent(targetVersion)}&limit=200`,
    { method: "GET" },
  );
  return data.data ?? [];
}

function selectNewestValidBuild(builds) {
  return builds
    .filter((build) => buildProcessingState(build) === "VALID")
    .sort((left, right) => compareNumericVersions(buildNumber(right), buildNumber(left)))[0] ?? null;
}

async function waitForValidBuild({ asc, app, targetVersion, timeoutMs = 10 * 60_000 }) {
  const deadline = Date.now() + timeoutMs;
  let latestStates = [];
  while (Date.now() < deadline) {
    const builds = await getTargetBuilds({ asc, app, targetVersion });
    const valid = selectNewestValidBuild(builds);
    if (valid) return valid;
    latestStates = builds.map((build) => `${buildNumber(build) || build.id}:${buildProcessingState(build)}`);
    const terminal = builds.length > 0 && builds.every((build) => ["FAILED", "INVALID"].includes(buildProcessingState(build)));
    if (terminal) break;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(
    `No VALID App Store Connect build is available for ${targetVersion}. Observed: ${latestStates.join(", ") || "none"}.`,
  );
}

async function patchReleaseNotes({ asc, version, whatsNew }) {
  const localizationsData = await asc(
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
    { method: "GET" },
  );
  const localizations = localizationsData.data ?? [];
  if (localizations.length === 0) {
    throw new Error(`App Store version ${versionString(version)} has no version localization to receive release notes.`);
  }
  for (const localization of localizations) {
    if (localization.attributes?.whatsNew === whatsNew) continue;
    await asc(`/v1/appStoreVersionLocalizations/${localization.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "appStoreVersionLocalizations",
          id: localization.id,
          attributes: { whatsNew },
        },
      }),
    });
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs({
    args: argv,
    options: {
      "bundle-id": { type: "string", default: DEFAULT_BUNDLE_ID },
      version: { type: "string", required: true },
      "app-id": { type: "string", default: DEFAULT_APP_ID },
      preflight: { type: "boolean", default: false },
      "candidate-build-number": { type: "string" },
      "whats-new": { type: "string" },
    },
    allowPositionals: false,
  });

  const bundleId = args.values["bundle-id"];
  const targetVersion = args.values.version;
  const expectedAppId = args.values["app-id"];
  const preflightOnly = args.values.preflight;
  const candidateBuildNumber = args.values["candidate-build-number"];
  const whatsNew = args.values["whats-new"]?.trim();

  if (!preflightOnly && !whatsNew) {
    throw new Error("--whats-new is required when submitting an iOS version for review.");
  }

  const credentials = loadCredentials(env);
  const token = createAppStoreToken(credentials);
  const asc = createAscClient(token);
  const app = await resolveApp({ asc, bundleId, expectedAppId });
  const slot = await inspectReleaseSlot({ asc, app, targetVersion });
  const target = slot.versions.find((version) => versionString(version) === targetVersion);
  const targetState = target ? versionState(target) : null;

  console.log(`App: ${app.attributes?.name ?? bundleId} (${app.id})`);
  console.log(`Target App Store version: ${targetVersion}${targetState ? ` (${targetState})` : " (new)"}`);

  if (!preflightOnly && target && VERSION_ALREADY_SUBMITTED_STATES.has(targetState)) {
    console.log(`Version ${targetVersion} is already in the App Store review/release flow (${targetState}); nothing to do.`);
    return { appId: app.id, targetVersion, state: targetState, alreadySubmitted: true };
  }

  assertAppStoreReleasePreflight({
    targetVersion,
    versions: slot.versions,
    submissions: slot.submissions,
    builds: slot.builds,
    candidateBuildNumber,
  });

  if (preflightOnly) {
    console.log(
      `App Store preflight passed for ${targetVersion}${candidateBuildNumber ? ` with candidate build ${candidateBuildNumber}` : ""}.`,
    );
    return { appId: app.id, targetVersion, candidateBuildNumber, preflight: true };
  }

  let version = target;
  if (!version) {
    version = (await asc(
      "/v1/appStoreVersions",
      {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "appStoreVersions",
            attributes: { platform: "IOS", versionString: targetVersion },
            relationships: { app: { data: { type: "apps", id: app.id } } },
          },
        }),
      },
    )).data;
  }
  console.log(`App Store version ${targetVersion}: id=${version.id} state=${versionState(version)}`);

  let build = (await asc(`/v1/appStoreVersions/${version.id}/build`, { method: "GET" }))?.data;
  if (!build || buildProcessingState(build) !== "VALID") {
    build = await waitForValidBuild({ asc, app, targetVersion });
    await asc(`/v1/appStoreVersions/${version.id}/relationships/build`, {
      method: "PATCH",
      body: JSON.stringify({ data: { type: "builds", id: build.id } }),
    });
  }
  console.log(`Build: ${buildNumber(build) || build.id} (state=${buildProcessingState(build)})`);

  await patchReleaseNotes({ asc, version, whatsNew });

  const freshSubmissions = await asc(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=200`, { method: "GET" });
  const existing = (freshSubmissions.data ?? []).find((submission) =>
    REVIEW_ACTIVE_STATES.has(submission?.attributes?.state),
  );
  if (existing) {
    throw new Error(
      `Review submission ${existing.id ?? "<unknown>"} is already open (${existing.attributes.state}); refusing to create a second submission.`,
    );
  }

  const created = await asc(
    "/v1/reviewSubmissions",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "reviewSubmissions",
          relationships: { app: { data: { type: "apps", id: app.id } } },
        },
      }),
    },
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
  );
  console.log(`Review submission ${submissionId} created for app store version ${version.id}.`);

  await asc(`/v1/reviewSubmissions/${submissionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        id: submissionId,
        attributes: { submitted: true },
      },
    }),
  });
  console.log(`Review submission ${submissionId} submitted.`);

  const deadline = Date.now() + 60_000;
  let submissionState = "SUBMITTED_FOR_REVIEW";
  while (Date.now() < deadline) {
    const result = await asc(`/v1/reviewSubmissions/${submissionId}`, { method: "GET" });
    submissionState = result.data?.attributes?.state ?? "UNKNOWN";
    if (["WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED", "UNRESOLVED_ISSUES"].includes(submissionState)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.log(`Final state: ${submissionState}.`);

  if (["REJECTED", "UNRESOLVED_ISSUES"].includes(submissionState)) {
    throw new Error(`App Store review submission ended in ${submissionState}.`);
  }
  return { appId: app.id, targetVersion, buildNumber: buildNumber(build), submissionId, state: submissionState };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
