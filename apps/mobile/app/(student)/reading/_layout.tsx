import { Stack } from "expo-router";
import { ReadingScreenProvider } from "../../../screens/student/reading-screen-context";

export default function ReadingLayout() {
  return (
    <ReadingScreenProvider>
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }} />
    </ReadingScreenProvider>
  );
}
