import { StudentReadingScreenView } from "./student-reading-view";
import { useStudentReadingScreenModel } from "./use-student-reading-screen-model";

export default function StudentReadingScreen() {
  return <StudentReadingScreenView model={useStudentReadingScreenModel()} />;
}
