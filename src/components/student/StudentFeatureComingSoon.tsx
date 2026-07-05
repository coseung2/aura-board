import Link from "next/link";

type Props = {
  title: string;
  description?: string;
};

export function StudentFeatureComingSoon({ title, description }: Props) {
  return (
    <main className="student-coming-soon-page">
      <section className="student-coming-soon-card" aria-labelledby="coming-soon-title">
        <p className="student-coming-soon-eyebrow">개발중</p>
        <h1 id="coming-soon-title">{title}</h1>
        <p>
          {description ??
            "이 기능은 아직 준비 중이에요. 더 안정적으로 사용할 수 있도록 다듬고 있습니다."}
        </p>
        <Link href="/student" className="student-coming-soon-link">
          학생 홈으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
