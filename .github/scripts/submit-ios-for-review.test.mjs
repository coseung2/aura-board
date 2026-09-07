import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAppStoreReleasePreflight,
  compareNumericVersions,
} from "./submit-ios-for-review.mjs";

function version(versionString, appStoreState, id = versionString) {
  return { id, attributes: { versionString, appStoreState } };
}

function build(number) {
  return { id: `build-${number}`, attributes: { version: String(number), processingState: "VALID" } };
}

test("compares numeric App Store marketing versions", () => {
  assert.equal(compareNumericVersions("1.0.12", "1.0.11"), 1);
  assert.equal(compareNumericVersions("1.0.12", "1.0.12"), 0);
  assert.equal(compareNumericVersions("1.10", "1.9.9"), 1);
});

test("allows a new version only when its build number is newer than App Store Connect", () => {
  const result = assertAppStoreReleasePreflight({
    targetVersion: "1.0.12",
    versions: [version("1.0.11", "READY_FOR_SALE")],
    submissions: [],
    builds: [build(50), build(51)],
    candidateBuildNumber: "52",
  });

  assert.deepEqual(result, {
    targetExists: false,
    targetState: null,
    openSubmission: null,
  });
});

test("rejects an already released marketing version", () => {
  assert.throws(
    () => assertAppStoreReleasePreflight({
      targetVersion: "1.0.11",
      versions: [version("1.0.11", "READY_FOR_SALE")],
      submissions: [],
      builds: [],
    }),
    /already exists in state READY_FOR_SALE/,
  );
});

test("rejects a release while another App Store review submission is open", () => {
  assert.throws(
    () => assertAppStoreReleasePreflight({
      targetVersion: "1.0.12",
      versions: [version("1.0.11", "READY_FOR_SALE")],
      submissions: [{ id: "review-1", attributes: { state: "WAITING_FOR_REVIEW" } }],
      builds: [build(51)],
      candidateBuildNumber: "52",
    }),
    /review submission review-1 is already open/,
  );
});

test("rejects duplicate or stale iOS build numbers", () => {
  const input = {
    targetVersion: "1.0.12",
    versions: [version("1.0.11", "READY_FOR_SALE")],
    submissions: [],
    builds: [build(51)],
  };

  assert.throws(
    () => assertAppStoreReleasePreflight({ ...input, candidateBuildNumber: "51" }),
    /already present/,
  );
  assert.throws(
    () => assertAppStoreReleasePreflight({ ...input, candidateBuildNumber: "50" }),
    /must be greater than the highest/,
  );
});

test("rejects a target version when a same-or-newer App Store version already exists", () => {
  assert.throws(
    () => assertAppStoreReleasePreflight({
      targetVersion: "1.0.12",
      versions: [
        version("1.0.11", "READY_FOR_SALE"),
        version("1.0.13", "PREPARE_FOR_SUBMISSION"),
      ],
      submissions: [],
      builds: [],
    }),
    /already has version 1.0.13/,
  );
});
