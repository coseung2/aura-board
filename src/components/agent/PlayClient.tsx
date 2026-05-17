"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildStudioSrcDoc } from "@/lib/vibe-arcade/sandbox-renderer";

interface Props {
  boardId: string;
  project: {
    id: string;
    title: string;
    htmlContent: string;
    cssContent: string;
    jsContent: string;
  };
}

export function PlayClient({ boardId, project }: Props) {
  const [shareText, setShareText] = useState<string | null>(null);

  const srcdoc = useMemo(
    () =>
      buildStudioSrcDoc({
        htmlContent: project.htmlContent,
        cssContent: project.cssContent,
        jsContent: project.jsContent,
      }),
    [project]
  );

  const handleRestart = () => {
    const iframe = document.getElementById("game-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.srcDoc = srcdoc;
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareText("✅ 링크 복사됨");
      setTimeout(() => setShareText(null), 2000);
    } catch {
      setShareText("❌ 복사 실패");
      setTimeout(() => setShareText(null), 2000);
    }
  };

  return (
    <div className="play-page">
      {/* Top bar */}
      <div className="play-topbar">
        <div className="play-topbar-main">
          <Link
            href={`/board/${boardId}/project/${project.id}`}
            className="play-detail-link"
          >
            ← 상세
          </Link>
          <h1 className="play-title">{project.title}</h1>
        </div>
        <div className="play-actions">
          {shareText && <span className="play-share-status">{shareText}</span>}
          <button
            type="button"
            className="play-control-button"
            onClick={handleRestart}
          >
            🔄 다시하기
          </button>
          <button
            type="button"
            className="play-control-button play-control-button-primary"
            onClick={handleShare}
          >
            🔗 공유
          </button>
        </div>
      </div>

      {/* Game */}
      <div className="play-frame-wrap">
        <iframe
          id="game-iframe"
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          title={project.title}
          className="play-iframe"
        />
      </div>
    </div>
  );
}
