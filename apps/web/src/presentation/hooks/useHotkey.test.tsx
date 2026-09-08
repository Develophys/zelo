import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useHotkey } from "./useHotkey";
import { useHotkeyStore } from "@/stores/hotkey.store";

function Probe({
  hotkeyKey,
  handler,
  label = "Testar",
  enabled = true,
}: {
  hotkeyKey: string;
  handler: () => void;
  label?: string;
  enabled?: boolean;
}) {
  useHotkey(hotkeyKey, handler, label, { enabled });
  return null;
}

describe("useHotkey", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers the key on mount", () => {
    render(<Probe hotkeyKey="a" handler={() => {}} />);
    expect(useHotkeyStore.getState().entries.get("a")?.label).toBe("Testar");
  });

  it("unregisters on unmount", () => {
    const { unmount } = render(<Probe hotkeyKey="a" handler={() => {}} />);
    unmount();
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("never registers while enabled is false", () => {
    render(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("registers once enabled flips to true, and unregisters once it flips back to false", () => {
    const { rerender } = render(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);

    rerender(<Probe hotkeyKey="a" handler={() => {}} enabled />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(true);

    rerender(<Probe hotkeyKey="a" handler={() => {}} enabled={false} />);
    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
  });

  it("re-registers under the new key when key changes, dropping the old one", () => {
    const { rerender } = render(<Probe hotkeyKey="a" handler={() => {}} />);
    rerender(<Probe hotkeyKey="b" handler={() => {}} />);

    expect(useHotkeyStore.getState().entries.has("a")).toBe(false);
    expect(useHotkeyStore.getState().entries.has("b")).toBe(true);
  });

  it("calls the latest handler even though a re-render never re-registers it", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { rerender } = render(<Probe hotkeyKey="a" handler={firstHandler} />);

    rerender(<Probe hotkeyKey="a" handler={secondHandler} />);
    act(() => {
      useHotkeyStore.getState().entries.get("a")?.handler();
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
  });
});
