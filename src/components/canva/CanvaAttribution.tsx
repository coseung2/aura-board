type Props = {
  className?: string;
};

export function CanvaAttribution({ className }: Props) {
  return (
    <span className={["canva-attribution", className].filter(Boolean).join(" ")}>
      Powered by <strong>Canva</strong>
    </span>
  );
}
