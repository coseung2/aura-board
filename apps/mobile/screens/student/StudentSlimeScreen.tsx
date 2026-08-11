import { StudentSlimeScreenView } from "../../components/student-screens/student-slime-view";
import type { StudentSlimeScreenViewModel } from "../../lib/student-slime-screen/student-slime-screen.types";
import { useStudentSlimeScreenModel } from "../../lib/student-slime-screen/use-student-slime-screen-model";

export default function StudentSlimeScreen() {
  const model: StudentSlimeScreenViewModel = useStudentSlimeScreenModel();
  return <StudentSlimeScreenView model={model} />;
}
