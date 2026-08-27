import type { ExpoConfig } from "expo/config";
import { baseColors } from "./theme/base-colors.cjs";

// Expo Go loads the JavaScript bundle directly from Metro. Its bundled
// expo-updates client must not attempt to fetch Aura Board's EAS update first.
// This flag is set only by the local Expo Go launcher; release builds retain
// the production update configuration below.
const isExpoGoDevelopment = process.env.AURA_EXPO_GO === "1";
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

const config: ExpoConfig = {
  name: "Aura-board",
  slug: "aura-board-mobile",
  scheme: "auraboard",
  version: "1.0.9",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.auraboard.app",
    usesAppleSignIn: true,
    supportsTablet: true,
    requireFullScreen: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
    package: "com.auraboard.app",
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 112,
        resizeMode: "contain",
        backgroundColor: baseColors.bg,
      },
    ],
    "expo-font",
    "expo-apple-authentication",
    "expo-secure-store",
    [
      "expo-audio",
      {
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    "expo-notifications",
    "./plugins/with-aura-board-health-connect",
    "./plugins/with-android-debug-network-security",
    "./plugins/with-remove-audio-media-playback",
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
  extra: isExpoGoDevelopment
    ? {
        router: {},
      }
    : {
        router: {},
        eas: {
          projectId: "fd9f26c1-ef04-4f19-8663-ed7c481af3ea",
        },
      },
  ...(isExpoGoDevelopment ? {} : { owner: "coseung2" }),
};

export default config;
