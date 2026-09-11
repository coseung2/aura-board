#!/usr/bin/env node
// Store credentials stay in memory. Only release metadata is emitted.
import { inspectGooglePlayReleaseState } from './promote-google-play-track.mjs';
import { createAppStoreToken, loadCredentials } from './submit-ios-for-review.mjs';

async function inspectApple() {
  const token = createAppStoreToken(loadCredentials());
  async function pages(path) {
    const data = [], included = [];
    while (path) {
      const url = new URL(path, 'https://api.appstoreconnect.apple.com');
      if (url.origin !== 'https://api.appstoreconnect.apple.com') throw new Error('Unexpected ASC pagination origin');
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`ASC inspection failed: HTTP ${response.status}`);
      const page = await response.json();
      data.push(...(page.data ?? []));
      included.push(...(page.included ?? []));
      path = page.links?.next;
    }
    return { data, included };
  }
  const [builds, versions] = await Promise.all([
    pages('/v1/builds?filter[app]=6780715163&include=preReleaseVersion,buildBetaDetail&limit=200'),
    pages('/v1/apps/6780715163/appStoreVersions?filter[platform]=IOS&limit=200'),
  ]);
  const related = (build, key) => builds.included.find(item => item.id === build.relationships?.[key]?.data?.id && item.type === build.relationships?.[key]?.data?.type)?.attributes;
  return {
    storeVersions: versions.data.map(({ attributes: a }) => ({ version: a.versionString, state: a.appStoreState })),
    testFlight: builds.data.map(build => ({
      version: related(build, 'preReleaseVersion')?.version,
      buildNumber: build.attributes.version,
      processingState: build.attributes.processingState,
      expired: build.attributes.expired,
      uploadedDate: build.attributes.uploadedDate,
      internalState: related(build, 'buildBetaDetail')?.internalBuildState,
      externalState: related(build, 'buildBetaDetail')?.externalBuildState,
    })),
  };
}

const results = await Promise.allSettled([
  inspectGooglePlayReleaseState({ serviceAccount: JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON), packageName: 'com.auraboard.app' }),
  inspectApple(),
]);
const report = { checkedAt: new Date().toISOString() };
for (const [index, platform] of ['android', 'ios'].entries()) {
  const result = results[index];
  if (result.status === 'rejected') {
    report[platform] = { error: 'Store inspection failed; check credentials and API availability.' };
    process.exitCode = 1;
  } else if (platform === 'android') {
    report.android = { tracks: result.value.tracks.map(track => ({ track: track.track, releases: (track.releases ?? []).map(release => ({ name: release.name, status: release.status, versionCodes: release.versionCodes })) })), uploadedVersionCodes: [...new Set([...result.value.bundles, ...result.value.apks].map(item => item.versionCode))] };
  } else report.ios = result.value;
}
console.log(JSON.stringify(report, null, 2));
