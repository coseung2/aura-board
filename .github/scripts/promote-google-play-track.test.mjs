import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  assertGooglePlayVersionCodeAvailable,
  collectGooglePlayVersionCodes,
  createServiceAccountAssertion,
  promoteGooglePlayTrack,
} from "./promote-google-play-track.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccount = {
  client_email: "release@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};

test("creates a bounded Android Publisher service-account assertion", () => {
  const assertion = createServiceAccountAssertion(serviceAccount, 1_000);
  const [, payload] = assertion.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(claims.iss, serviceAccount.client_email);
  assert.equal(claims.iat, 1_000);
  assert.equal(claims.exp, 4_600);
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
});

test("rejects reused or stale Google Play version codes across tracks and artifacts", () => {
  const state = {
    tracks: [
      { track: "production", releases: [{ versionCodes: ["48", "49"] }] },
      { track: "internal", releases: [{ versionCodes: ["51"] }] },
    ],
    bundles: [{ versionCode: 50 }],
    apks: [{ versionCode: 47 }],
  };

  assert.deepEqual(collectGooglePlayVersionCodes(state), ["47", "48", "49", "50", "51"]);
  assert.throws(
    () => assertGooglePlayVersionCodeAvailable(state, 51),
    /already uploaded or assigned/,
  );
  assert.throws(
    () => assertGooglePlayVersionCodeAvailable(state, 50),
    /already uploaded or assigned/,
  );
  assert.deepEqual(assertGooglePlayVersionCodeAvailable(state, 52), {
    versionCode: "52",
    highestExistingVersionCode: "51",
  });
});

test("assigns an existing version code to production and commits the edit", async () => {
  const requests = [];
  const responses = [
    { access_token: "access-token" },
    { id: "edit-123" },
    { track: "production" },
    { id: "edit-123", expiryTimeSeconds: "123" },
  ];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  };

  const result = await promoteGooglePlayTrack({
    serviceAccount,
    packageName: "com.auraboard.app",
    track: "production",
    versionCode: 26,
    fetchImpl,
  });

  assert.deepEqual(result, {
    packageName: "com.auraboard.app",
    track: "production",
    versionCode: "26",
  });
  assert.equal(requests.length, 4);
  assert.match(requests[2].url, /edits\/edit-123\/tracks\/production$/);
  assert.deepEqual(JSON.parse(requests[2].init.body), {
    releases: [{ versionCodes: ["26"], status: "completed" }],
  });
  assert.match(requests[3].url, /edits\/edit-123:commit$/);
});
