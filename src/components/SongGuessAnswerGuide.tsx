"use client";

import { useId, useState } from "react";
import type { SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import controls from "./SongGuessBoard.module.css";
import styles from "./SongGuessAnswerGuide.module.css";

export function SongGuessAnswerGuide({ setup, currentRoundId }: {
  setup: SongGuessTeacherSetup;
  currentRoundId?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={styles.guide}>
      <button type="button" className={controls.secondaryButton} aria-expanded={open}
        aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {open ? "교사용 정답 목록 닫기" : "교사용 정답 목록"}
      </button>
      {open && <section id={panelId} className={styles.content} aria-label="교사용 정답 목록">
        <div className={styles.heading}><h2>정답과 인정 답안</h2><span>{setup.rounds.length}문제</span></div>
        <p>대표 정답 또는 아래 인정 답안과 일치하면 정답입니다. 영어 대소문자와 앞뒤 공백은 구분하지 않습니다. 오타와 띄어쓰기 차이는 자동으로 인정하지 않습니다.</p>
        <p className={styles.note}>학생 기기에는 표시되지 않습니다. 이 화면을 공유하면 정답도 보입니다.</p>
        <ol className={styles.list}>
          {[...setup.rounds].sort((a, b) => a.order - b.order).map((round) => (
            <li key={round.id} aria-current={currentRoundId === round.id ? "step" : undefined}>
              <div className={styles.round}><strong>{round.order + 1}번</strong>{currentRoundId === round.id && <span>현재 문제</span>}</div>
              <dl><dt>대표 정답</dt><dd>{round.representativeAnswer}</dd>
                <dt>인정 답안</dt><dd>{round.aliases.length ? round.aliases.join(" · ") : "대표 정답만 인정"}</dd></dl>
            </li>
          ))}
        </ol>
      </section>}
    </div>
  );
}
