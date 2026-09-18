import { useEffect, useMemo, useRef, useState } from "react";
import { normalize } from "@/presentation/lib/normalize-search";

const DEFAULT_DELAY_MS = 300;

export interface UseDebouncedSearch<T> {
  /** Echoes every keystroke — this is what the search input binds to. */
  search: string;
  setSearch(value: string): void;
  /** Trails `search` by the debounce delay. */
  debouncedSearch: string;
  /** A non-blank query is live: tells "matched nothing" apart from "none registered". */
  hasQuery: boolean;
  filtered: T[];
}

/**
 * Debounced client-side filtering for the admin tables.
 *
 * `toHaystack` returns the row's searchable text; it is read through a ref so
 * callers can pass an inline arrow without busting the filter memo on every
 * render — `filtered` feeds useDataTableSelection, which reads a new array
 * identity as a row-set change.
 */
export function useDebouncedSearch<T>(
  rows: T[],
  toHaystack: (row: T) => string,
  { delayMs = DEFAULT_DELAY_MS }: { delayMs?: number } = {},
): UseDebouncedSearch<T> {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const toHaystackRef = useRef(toHaystack);
  // eslint-disable-next-line react-hooks/refs -- must be read synchronously inside useMemo below; a useLayoutEffect write would be one render stale
  toHaystackRef.current = toHaystack;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), delayMs);
    return () => clearTimeout(timer);
  }, [search, delayMs]);

  const query = normalize(debouncedSearch.trim());

  const filtered = useMemo(() => {
    if (query === "") return rows;
    // eslint-disable-next-line react-hooks/refs -- toHaystackRef is written synchronously above, before this render's useMemo runs
    return rows.filter((row) => normalize(toHaystackRef.current(row)).includes(query));
  }, [rows, query]);

  return { search, setSearch, debouncedSearch, hasQuery: query !== "", filtered };
}
