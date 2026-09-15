import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedSearch } from "./useDebouncedSearch";

interface Row {
  id: string;
  name: string;
  email: string;
}

const ROWS: Row[] = [
  { id: "a", name: "Ana Konder", email: "ana@zelo-demo.local" },
  { id: "b", name: "Paulo Reis", email: "paulo@zelo-demo.local" },
  { id: "c", name: "Plantão Noturno", email: "noturno@zelo-demo.local" },
];

function setup(rows: Row[] = ROWS) {
  return renderHook(() => useDebouncedSearch(rows, (row) => [row.name, row.email].join(" ")));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedSearch", () => {
  it("returns every row while no query has been typed", () => {
    const { result } = setup();
    expect(result.current.filtered).toEqual(ROWS);
    expect(result.current.hasQuery).toBe(false);
  });

  // The input is controlled by `search`, so it has to echo each keystroke
  // immediately — only the filtering waits.
  it("echoes typing immediately but holds the filter until the debounce elapses", () => {
    vi.useFakeTimers();
    const { result } = setup();

    act(() => result.current.setSearch("paulo"));
    expect(result.current.search).toBe("paulo");
    expect(result.current.filtered).toEqual(ROWS);

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.filtered).toEqual([ROWS[1]]);
  });

  // A burst of keystrokes must cost one filter pass, not one per character.
  it("keeps resetting the timer while typing continues", () => {
    vi.useFakeTimers();
    const { result } = setup();

    act(() => result.current.setSearch("p"));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.setSearch("pa"));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.filtered).toEqual(ROWS);

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.filtered).toEqual([ROWS[1]]);
  });

  it("matches accent- and case-insensitively, since the haystack is normalized", () => {
    vi.useFakeTimers();
    const { result } = setup();

    act(() => result.current.setSearch("PLANTAO"));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.filtered).toEqual([ROWS[2]]);
  });

  it("searches every field the haystack joins, not just the first", () => {
    vi.useFakeTimers();
    const { result } = setup();

    act(() => result.current.setSearch("noturno@zelo"));
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.filtered).toEqual([ROWS[2]]);
  });

  // `hasQuery` is what tells "no rows because the search matched nothing" apart
  // from "no rows because none are registered" in the empty state.
  it("reports a live query only once the debounce has caught up, ignoring blank input", () => {
    vi.useFakeTimers();
    const { result } = setup();

    act(() => result.current.setSearch("zzz"));
    expect(result.current.hasQuery).toBe(false);

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.hasQuery).toBe(true);
    expect(result.current.filtered).toEqual([]);

    act(() => result.current.setSearch("   "));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.hasQuery).toBe(false);
    expect(result.current.filtered).toEqual(ROWS);
  });

  // Callers feed `filtered` straight into useDataTableSelection, which treats a
  // new array identity as a row-set change — returning a fresh copy on every
  // render would churn it.
  it("keeps the same array identity across renders when nothing changed", () => {
    const { result, rerender } = setup();
    const first = result.current.filtered;

    rerender();

    expect(result.current.filtered).toBe(first);
  });
});
