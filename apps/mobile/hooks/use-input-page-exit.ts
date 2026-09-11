import { usePreventRemove } from "@react-navigation/native";
import { useNavigation, useRouter } from "expo-router";
import { useRef } from "react";
import { Alert } from "react-native";

/** Native Back, header Back and swipe-back must all protect the same draft. */
export function useInputPageExit(dirty: boolean, busy: boolean) {
  const navigation = useNavigation();
  const router = useRouter();
  const saved = useRef(false);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/(student)");
  usePreventRemove(dirty || busy, ({ data }) => {
    const destination = data.action.payload as { name?: string } | undefined;
    // Expired-session recovery must not be trapped by an unsavable draft.
    if (saved.current || destination?.name === "login") {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) {
      Alert.alert("처리 중이에요", "완료될 때까지 잠시 기다려 주세요.");
      return;
    }
    Alert.alert("작성을 그만둘까요?", "저장하지 않은 내용은 사라져요.", [
      { text: "계속 작성", style: "cancel" },
      {
        text: "나가기",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });
  return {
    back,
    finish: () => {
      saved.current = true;
      back();
    },
  };
}
