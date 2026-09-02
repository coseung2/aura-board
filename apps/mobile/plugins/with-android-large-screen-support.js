"use strict";

const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Keep the generated Android manifest explicitly compatible with tablets,
 * foldables, free-form windows, and Android 16 large-screen behavior.
 *
 * Expo's `orientation: "default"` currently emits
 * `android:screenOrientation="unspecified"`. That is not a fixed orientation,
 * but Play's large-screen analyzer reports manifest orientation attributes as
 * a compatibility signal. Remove the attribute entirely and make the app
 * resizable at the application level so generated native projects cannot
 * regress to a restricted window configuration.
 */
module.exports = function withAndroidLargeScreenSupport(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Unable to find the Android application manifest entry.");
    }

    application.$ = application.$ ?? {};
    application.$["android:resizeableActivity"] = "true";

    for (const activity of application.activity ?? []) {
      activity.$ = activity.$ ?? {};
      delete activity.$["android:screenOrientation"];
      delete activity.$["android:resizeableActivity"];
      delete activity.$["android:maxAspectRatio"];
      delete activity.$["android:minAspectRatio"];
    }

    return manifestConfig;
  });
};
