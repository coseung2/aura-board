import { StudentWalkingScreenView } from "./student-walking-view";
import { useStudentWalkingScreenModel } from "./use-student-walking-screen-model";

export default function StudentWalkingScreen() {
  return <StudentWalkingScreenView model={useStudentWalkingScreenModel()} />;
}
