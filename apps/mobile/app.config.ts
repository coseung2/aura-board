import type { ExpoConfig } from "expo/config";
import { baseColors } from "./theme/base-colors.cjs";

const config: ExpoConfig = {
  name: "Aura-board",
  slug: "aura-board-mobile",
  scheme: "auraboard",
  version: "0.2.2",
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
    supportsTablet: true,
    requireFullScreen: false,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundImage: "./assets/adaptive-icon-background.png",
      backgroundColor: "#8e8cff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "com.auraboard.app",
    versionCode: 3,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "./plugins/with-aura-board-health-connect",
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    router: {},
    eas: {
      projectId: "fd9f26c1-ef04-4f19-8663-ed7c481af3ea",
    },
  },
  updates: {
    url: "https://u.expo.dev/fd9f26c1-ef04-4f19-8663-ed7c481af3ea",
  },
  owner: "coseung2",
};

export default config;
