"use strict";

const { withGradleProperties } = require("@expo/config-plugins");

const MIN_ANDROID_SDK = 26;

module.exports = function withAuraBoardHealthConnect(config) {
  return withGradleProperties(config, (nextConfig) => {
    const properties = nextConfig.modResults;
    const minSdkProperty = properties.find(
      (property) =>
        property.type === "property" && property.key === "android.minSdkVersion",
    );

    if (minSdkProperty) {
      const currentValue = Number.parseInt(String(minSdkProperty.value), 10);
      if (!Number.isFinite(currentValue) || currentValue < MIN_ANDROID_SDK) {
        minSdkProperty.value = String(MIN_ANDROID_SDK);
      }
    } else {
      properties.push({
        type: "property",
        key: "android.minSdkVersion",
        value: String(MIN_ANDROID_SDK),
      });
    }

    return nextConfig;
  });
};
