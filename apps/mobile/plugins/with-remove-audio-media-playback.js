"use strict";

const { withAndroidManifest } = require("@expo/config-plugins");

const MEDIA_PLAYBACK_PERMISSION =
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK";
const AUDIO_CONTROLS_SERVICE = "expo.modules.audio.service.AudioControlsService";
const AUDIO_CONTROLS_SERVICE_SHORT_NAME = ".service.AudioControlsService";

/**
 * expo-audio 1.1.1 contributes its background media service to the merged
 * Android manifest even though Aura Board only needs in-app audio playback.
 * Keep expo-audio itself, but prevent that unused service and typed FGS
 * permission from reaching the production manifest.
 */
module.exports = function withRemoveAudioMediaPlayback(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const permissions = manifest["uses-permission"] ?? [];
    manifest["uses-permission"] = permissions.filter(
      (permission) =>
        permission?.$?.["android:name"] !== MEDIA_PLAYBACK_PERMISSION,
    );
    manifest["uses-permission"].push({
      $: {
        "android:name": MEDIA_PLAYBACK_PERMISSION,
        "tools:node": "remove",
      },
    });

    const application = manifest.application?.[0];
    if (!application) {
      throw new Error("Unable to find the Android application manifest entry.");
    }

    const services = application.service ?? [];
    application.service = services.filter((service) => {
      const name = service?.$?.["android:name"];
      return (
        name !== AUDIO_CONTROLS_SERVICE &&
        name !== AUDIO_CONTROLS_SERVICE_SHORT_NAME
      );
    });
    application.service.push({
      $: {
        "android:name": AUDIO_CONTROLS_SERVICE,
        "tools:node": "remove",
      },
    });

    return manifestConfig;
  });
};
