import { useEffect, useRef, useCallback } from 'react';

export function usePolling(
  callback: () => void,
  interval: number,
  deps: unknown[] = [],
): void {
  const savedCallback = useRef(callback);

  const stableCallback = useCallback(() => {
    savedCallback.current();
  }, []);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) {
        stableCallback();
      }
    };

    const id = setInterval(tick, interval);

    const handleVisibility = () => {
      if (!document.hidden) {
        stableCallback();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, stableCallback, ...deps]);
}
