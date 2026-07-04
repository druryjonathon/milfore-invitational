import { useEffect, useState } from "react";

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

// eslint-disable-next-line react-hooks/exhaustive-deps
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
