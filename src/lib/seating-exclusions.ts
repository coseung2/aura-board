export function isSeatingExcludedStudent(student: { name: string }): boolean {
  return student.name.trim().toLowerCase() === "test";
}
