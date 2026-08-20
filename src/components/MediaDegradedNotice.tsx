import {
  isMediaDegradedModeEnabled,
  MEDIA_DEGRADED_MESSAGE,
} from "@/lib/media-degraded";
import styles from "./MediaDegradedNotice.module.css";

export function MediaDegradedNotice() {
  if (!isMediaDegradedModeEnabled()) return null;

  return (
    <p className={styles.notice} role="status" aria-live="polite">
      {MEDIA_DEGRADED_MESSAGE}
    </p>
  );
}
