type ShadowAllianceBoardProps = {
  boardId: string;
  boardTitle: string;
};

export function ShadowAllianceBoard({ boardId, boardTitle }: ShadowAllianceBoardProps) {
  const src = `/games/shadow-alliance?boardId=${encodeURIComponent(boardId)}`;

  return (
    <section className="shadow-alliance-board" aria-label={boardTitle}>
      <iframe
        className="shadow-alliance-frame"
        title={boardTitle || "그림자연합"}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      />
    </section>
  );
}
