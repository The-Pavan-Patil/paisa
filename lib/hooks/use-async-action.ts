"use client";

import { useCallback, useRef, useState } from "react";

export function useAsyncAction<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  const run = useCallback(
    async (...args: T) => {
      if (lock.current) return;
      lock.current = true;
      setPending(true);
      try {
        await fn(...args);
      } finally {
        lock.current = false;
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending };
}
