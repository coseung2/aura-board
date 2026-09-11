import { useReadingScreen } from "./reading-screen-context";
import { StudentReadingScreenView } from "./student-reading-view";

export default function StudentReadingScreen() {
  const model = useReadingScreen();
  const { view } = useLocalSearchParams<{ view?: string | string[] }>();
  const requestedView = Array.isArray(view) ? view[0] : view;
  const { setActiveTab } = model;
  useEffect(() => {
    if (requestedView === "records" || requestedView === "missions" || requestedView === "titles") setActiveTab(requestedView);
  }, [requestedView, setActiveTab]);
  return <StudentReadingScreenView model={model} />;
}
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
