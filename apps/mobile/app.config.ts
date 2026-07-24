import type { ExpoConfig } from "expo/config";
import { baseColors } from "./theme/base-colors.cjs";

// Expo Go loads the JavaScript bundle directly from Metro. Its bundled
// expo-updates client must not attempt to fetch Aura Board's EAS update first.
// This flag is set only by the local Expo Go launcher; release builds retain
// the production update configuration below.
const isExpoGoDevelopment = process.env.AURA_EXPO_GO === "1";

const config: ExpoConfig = {
  name: "Aura-board",
  slug: "aura-board-mobile",
  scheme: "auraboard",
  version: "0.2.10",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: baseColors.bg,
  },
  ios: {
    bundleIdentifier: "com.auraboard.app",
    supportsTablet: true,
    requireFullScreen: false,
  },
  android: {
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "com.auraboard.app",
    versionCode: 10,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-notifications",
    "./plugins/with-aura-board-health-connect",
    "./plugins/with-android-debug-network-security",
  ],
  experiments: {
    typedRoutes: true,
  },
  ...(isExpoGoDevelopment
    ? {
        updates: {
          enabled: false,
        },
      }
    : {
        runtimeVersion: {
          policy: "appVersion",
        },
        updates: {
          url: "https://u.expo.dev/fd9f26c1-ef04-4f19-8663-ed7c481af3ea",
        },
      }),
  extra: {
    router: {},
    eas: {
      projectId: "fd9f26c1-ef04-4f19-8663-ed7c481af3ea",
    },
  },
  owner: "coseung2",
};

export default config;
