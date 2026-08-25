import { useEffect, useState } from 'react';
import { authClient } from './authClient';

const SESSION_TIMEOUT_MS = 12_000;

export function useSessionWithFallback() {
  const sessionState = authClient.useSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!sessionState.isPending) return undefined;

    const timer = window.setTimeout(() => setTimedOut(true), SESSION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [sessionState.isPending]);

  return {
    ...sessionState,
    isPending: sessionState.isPending && !timedOut,
    isUnavailable: timedOut || Boolean(sessionState.error),
  };
}
