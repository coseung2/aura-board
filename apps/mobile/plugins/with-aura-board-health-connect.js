"use strict";

const {
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
} = require("@expo/config-plugins");

const MIN_ANDROID_SDK = 26;

module.exports = function withAuraBoardHealthConnect(config) {
  config = withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.NSHealthShareUsageDescription =
      "Aura Board는 날짜별 걸음 수와 이동 거리 합계를 보여 주기 위해 Apple 건강 데이터 접근 권한을 요청합니다.";
    return nextConfig;
  });

  config = withEntitlementsPlist(config, (nextConfig) => {
    nextConfig.modResults["com.apple.developer.healthkit"] = true;
    return nextConfig;
  });

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
