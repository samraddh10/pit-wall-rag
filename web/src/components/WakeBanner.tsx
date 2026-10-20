import { useEffect, useEffectEvent, useState } from "react";
import { getHealth } from "../api/client.ts";
import styles from "./WakeBanner.module.css";

/** An awake server answers in well under a second, so anything slower means it was asleep. */
const SLOW_AFTER_MS = 2_000;
/** Render's free server takes about a minute to wake up. After this long, something is wrong. */
const GIVE_UP_AFTER_MS = 90_000;

type ServerStatus = "checking" | "waking" | "awake" | "down";

interface WakeBannerProps {
  /** Called once the server has answered. */
  onAwake: () => void;
}

/**
 * Pings the server when the page opens. Render's free plan puts the server to sleep after 15 idle
 * minutes, and the first request then takes up to a minute. A slow reply shows a friendly
 * explanation instead of a page that looks broken, and no reply shows an error with a retry button.
 */
export function WakeBanner({ onAwake }: WakeBannerProps) {
  const [status, setStatus] = useState<ServerStatus>("checking");
  // Bumped by the "Try again" button to run the check again.
  const [attempt, setAttempt] = useState(0);
  // Lets the effect below call the latest onAwake without re-running when it changes.
  const reportAwake = useEffectEvent(onAwake);

  useEffect(() => {
    const cleanup = new AbortController();
    // The request stops when this component goes away, or when it has taken too long.
    const signal = AbortSignal.any([cleanup.signal, AbortSignal.timeout(GIVE_UP_AFTER_MS)]);
    const slowTimer = setTimeout(() => setStatus("waking"), SLOW_AFTER_MS);

    getHealth(signal)
      .then(() => {
        setStatus("awake");
        reportAwake();
      })
      .catch(() => {
        if (!cleanup.signal.aborted) setStatus("down");
      })
      .finally(() => clearTimeout(slowTimer));

    return () => {
      cleanup.abort();
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  if (status === "waking") {
    return (
      <div className={styles.banner} role="status">
        <span className={styles.light} aria-hidden="true" />
        Waking up the free server. This can take up to a minute.
      </div>
    );
  }

  if (status === "down") {
    return (
      <div className={`${styles.banner} ${styles.down}`} role="alert">
        <span className={styles.light} aria-hidden="true" />
        Can't reach the server right now.
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            setStatus("checking");
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Still within the first two seconds, or already awake: nothing to say.
  return null;
}
