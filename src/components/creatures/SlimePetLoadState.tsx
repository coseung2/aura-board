import { styles } from "./SlimePetPage.styles";

type SlimePetLoadStateProps = {
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
};

/** Page-level loading and retry feedback. */
export function SlimePetLoadState({
  loading,
  loadError,
  onRetry,
}: SlimePetLoadStateProps) {
  if (loading) {
    return (
      <p className={styles.status} role="status">
        슬라임 정보를 불러오는 중…
      </p>
    );
  }

  if (!loadError) return null;

  return (
    <div className={styles.status} role="alert">
      <span>슬라임 정보를 불러오지 못했어요.</span>
      <button
        type="button"
        className={styles.retryButton}
        onClick={onRetry}
      >
        다시 시도
      </button>
    </div>
  );
}
