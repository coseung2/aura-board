import { useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { clearParentSession } from "../../../../../lib/session";

/** Expo Go-only OAuth error handoff. */
export default function ParentAuthErrorCallback() {
  const router = useRouter();
  const { error: routeError } = useLocalSearchParams<{
    error?: string | string[];
  }>();

  useEffect(() => {
    const error = Array.isArray(routeError) ? routeError[0] : routeError;
    if (!error) return;
    void clearParentSession().then(() =>
      router.replace(`/?role=parent&error=${encodeURIComponent(error)}`),
    );
  }, [routeError, router]);

  return <View />;
}
