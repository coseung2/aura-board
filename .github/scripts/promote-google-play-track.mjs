import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISHER_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function requireText(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function createServiceAccountAssertion(serviceAccount, nowSeconds = Math.floor(Date.now() / 1000)) {
  const clientEmail = requireText(serviceAccount?.client_email, "service account client_email");
  const privateKey = requireText(serviceAccount?.private_key, "service account private_key");
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: PUBLISHER_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function googleRequest(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 1000)}`);
  }
  return body ? JSON.parse(body) : {};
}

export async function promoteGooglePlayTrack({
  serviceAccount,
  packageName,
  track,
  versionCode,
  fetchImpl = fetch,
}) {
  const normalizedPackage = requireText(packageName, "package name");
  const normalizedTrack = requireText(track, "track");
  const normalizedVersionCode = String(versionCode ?? "").trim();
  if (!/^\d+$/.test(normalizedVersionCode) || normalizedVersionCode === "0") {
    throw new Error("version code must be a positive integer");
  }

  const assertion = createServiceAccountAssertion(serviceAccount);
  const tokenBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const token = await googleRequest(fetchImpl, TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  }, "Google OAuth token request");
  const accessToken = requireText(token.access_token, "Google OAuth access token");
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const appPath = `${PUBLISHER_ROOT}/applications/${encodeURIComponent(normalizedPackage)}`;
  const edit = await googleRequest(fetchImpl, `${appPath}/edits`, {
    method: "POST",
    headers,
    body: "{}",
  }, "Google Play edit creation");
  const editId = requireText(edit.id, "Google Play edit id");
  const editPath = `${appPath}/edits/${encodeURIComponent(editId)}`;

  await googleRequest(fetchImpl, `${editPath}/tracks/${encodeURIComponent(normalizedTrack)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      releases: [{ versionCodes: [normalizedVersionCode], status: "completed" }],
    }),
  }, "Google Play track update");
  await googleRequest(fetchImpl, `${editPath}:commit`, {
    method: "POST",
    headers,
    body: "{}",
  }, "Google Play edit commit");

  return { packageName: normalizedPackage, track: normalizedTrack, versionCode: normalizedVersionCode };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const rawServiceAccount = requireText(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  );
  const result = await promoteGooglePlayTrack({
    serviceAccount: JSON.parse(rawServiceAccount),
    packageName: readArg("--package"),
    track: readArg("--track"),
    versionCode: readArg("--version-code"),
  });
  console.log(`Promoted ${result.packageName} versionCode ${result.versionCode} to ${result.track}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Google Play promotion failed");
    process.exitCode = 1;
  });
}
