import { useEffect, useRef } from "react";

/** A ref that always holds the latest value (updated after each render). */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Calls `onResult` once each time a fetcher submission/load finishes with data. */
export function useFetcherResult<T>(fetcher: { state: string; data?: T }, onResult: (data: T) => void) {
  const callback = useLatest(onResult);
  const previousState = useRef(fetcher.state);
  useEffect(() => {
    const was = previousState.current;
    previousState.current = fetcher.state;
    if (was !== "idle" && fetcher.state === "idle" && fetcher.data !== undefined) {
      callback.current(fetcher.data);
    }
  }, [fetcher.state, fetcher.data, callback]);
}
