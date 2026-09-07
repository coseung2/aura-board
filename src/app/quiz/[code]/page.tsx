import { QuizPlay } from "@/components/QuizPlay";
import { getCurrentStudent } from "@/lib/student-auth";
import { notFound } from "next/navigation";
import { productFeatureDenial } from "@/lib/product-release-server";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  if (await productFeatureDenial("developmentLayouts")) notFound();
  const { code } = await params;
  const student = await getCurrentStudent();

  return (
    <QuizPlay
      initialCode={code.toUpperCase()}
      studentName={student?.name}
      studentId={student?.id}
    />
  );
}
