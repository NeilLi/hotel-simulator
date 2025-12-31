import { useRef } from "react";

export function useDebounced<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  const t = useRef<number | null>(null);
  return (...args: Parameters<T>) => {
    if (t.current) {
      window.clearTimeout(t.current);
    }
    t.current = window.setTimeout(() => {
      fn(...args);
    }, ms);
  };
}

