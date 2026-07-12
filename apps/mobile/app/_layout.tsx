import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { NotoSansKR_400Regular } from "@expo-google-fonts/noto-sans-kr/400Regular";
import { NotoSansKR_600SemiBold } from "@expo-google-fonts/noto-sans-kr/600SemiBold";
import { NotoSansKR_700Bold } from "@expo-google-fonts/noto-sans-kr/700Bold";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { colors } from "../theme/tokens";
import { clearParentSession, saveParentToken } from "../lib/session";
import { useAndroidBackBehavior } from "../hooks/use-android-back-behavior";

// 루트 레이아웃. 모든 스크린을 Stack 으로 감싸되 헤더는 각 segment 에서 커스텀.
// 학부모 이메일 매직링크 콜백(auraboard://parent/auth/callback#...) 을
// 앱이 cold/foreground 상태일 때 모두 잡아서 처리한다.

const CALLBACK_PATH = "parent/auth/callback";

void SplashScreen.preventAutoHideAsync();

function parseCallback(url: string) {
  if (!url.startsWith("auraboard://")) return null;

  // host 가 parent 이거나 path 에 parent/auth/callback 가 포함되면 처리.
  const afterScheme = url.slice("auraboard://".length);
  const pathPart = afterScheme.split("?")[0].split("#")[0].replace(/\/$/, "");
  if (!pathPart.endsWith(CALLBACK_PATH) && pathPart !== CALLBACK_PATH) {
    return null;
  }

  const hashIdx = url.indexOf("#");
  const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
  const params = new URLSearchParams(fragment);

  return {
    token: params.get("token"),
    expiresAt: params.get("expiresAt"),
    error: params.get("error"),
  };
}

function errorMessage(code: string) {
  switch (code) {
    case "expired":
      return "링크가 만료되었어요. 다시 로그인해 주세요.";
    case "invalid":
      return "유효하지 않은 링크예요.";
    case "used":
      return "이미 사용된 링크예요.";
    default:
      return "로그인에 실패했어요.";
  }
}

function useParentDeepLink() {
  const router = useRouter();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    async function handle(url: string) {
      const parsed = parseCallback(url);
      if (!parsed) return;
      if (url === lastHandled.current) return;
      lastHandled.current = url;

      if (parsed.token) {
        await saveParentToken(parsed.token);
        router.replace("/(parent)");
      } else {
        await clearParentSession();
        const msg = parsed.error ? errorMessage(parsed.error) : "로그인 링크가 유효하지 않아요.";
        router.replace(`/(parent)/login?error=${encodeURIComponent(msg)}`);
      }
    }

    let sub: { remove: () => void } | null = null;
    const init = async () => {
      const initial = await Linking.getInitialURL();
      if (initial) await handle(initial);
      sub = Linking.addEventListener("url", (ev) => {
        if (ev.url) handle(ev.url);
      });
    };
    init();

    return () => {
      sub?.remove();
    };
  }, [router]);
}

function DeepLinkHandler() {
  useParentDeepLink();
  return null;
}

export default function RootLayout() {
  useAndroidBackBehavior();

  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_600SemiBold,
    NotoSansKR_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DeepLinkHandler />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </SafeAreaProvider>
  );
}
