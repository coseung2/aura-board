import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { colors } from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import { StudentBottomNav } from "../../components/StudentBottomNav";

// Student segment 전체 공통 layout.
export default function StudentLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hideNav = pathname === "/login" || pathname.endsWith("/login");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadMe = useCallback(async () => {
    if (hideNav) {
      setMe(null);
      return;
    }
    try {
      const res = await apiFetch<MeResponse>("/api/student/me");
      setMe(res);
    } catch (e) {
      setMe(null);
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
      }
    }
  }, [hideNav, router]);

  useEffect(() => {
    loadMe();
  }, [loadMe, pathname]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiFetch("/api/student/logout", { method: "POST" }).catch(
        () => undefined,
      );
      await clearSessionToken();
      setMe(null);
      router.replace("/(student)/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <View style={styles.shell}>
      <View style={styles.stack}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "fade",
          }}
        />
      </View>
      {!hideNav ? (
        <StudentBottomNav
          studentName={me?.student.name}
          classroomName={me?.student.classroom?.name ?? undefined}
          duties={me?.duties}
          loggingOut={loggingOut}
          onLogout={handleLogout}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stack: {
    flex: 1,
  },
});
