"use client";

import { useRouter } from "next/navigation";

export function PlayBoardContinueButton({
  href = "/student",
}: {
  href?: "/student" | "/dashboard";
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="play-board-continue-button"
      onClick={() => router.push(href)}
    >
      다음에 이어하기
    </button>
  );
}
