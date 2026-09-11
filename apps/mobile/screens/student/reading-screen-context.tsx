import { createContext, type ReactNode, useContext } from "react";
import {
  type StudentReadingScreenViewModel,
  useStudentReadingScreenModel,
} from "./use-student-reading-screen-model";

const ReadingScreenContext =
  createContext<StudentReadingScreenViewModel | null>(null);

export function ReadingScreenProvider({ children }: { children: ReactNode }) {
  const model = useStudentReadingScreenModel();
  return (
    <ReadingScreenContext.Provider value={model}>
      {children}
    </ReadingScreenContext.Provider>
  );
}

export function useReadingScreen() {
  const model = useContext(ReadingScreenContext);
  if (!model) throw new Error("ReadingScreenProvider is required");
  return model;
}
