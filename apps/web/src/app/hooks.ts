import { useEffect, useState } from 'react';
import type { ApiState } from './types';

export function useRemote<T = any>(loader: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [state, setState] = useState({ loading: true, error: '', data: null as T | null, tick: 0 });
  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    loader()
      .then((data) => alive && setState((prev) => ({ ...prev, loading: false, data })))
      .catch((error) => alive && setState((prev) => ({ ...prev, loading: false, error: error.message || String(error) })));
    return () => {
      alive = false;
    };
  }, [...deps, state.tick]);
  return { ...state, refresh: () => setState((prev) => ({ ...prev, tick: prev.tick + 1 })) };
}

export function useForm<T extends Record<string, any>>(initial: T): [T, (key: keyof T | string, next: any) => void, (next?: T) => void, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const set = (key: keyof T | string, next: any) => setValue((prev) => ({ ...prev, [key]: next }));
  const reset = (next = initial) => setValue(next);
  return [value, set, reset, setValue];
}
