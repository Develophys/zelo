import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";

describe("HotkeyListener", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("fires the registered handler for a matching keydown", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(<HotkeyListener />);

    fireEvent.keyDown(document, { key: "a" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does nothing for a key with no registered handler", () => {
    render(<HotkeyListener />);
    expect(() => fireEvent.keyDown(document, { key: "z" })).not.toThrow();
  });

  it("ignores a matching key while the focused element is a text input", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(
      <>
        <input data-testid="text-input" />
        <HotkeyListener />
      </>,
    );
    const input = screen.getByTestId("text-input");
    input.focus();

    fireEvent.keyDown(input, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a matching key while the focused element is a textarea", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(
      <>
        <textarea data-testid="textarea" />
        <HotkeyListener />
      </>,
    );
    const textarea = screen.getByTestId("textarea");
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a keydown held with Ctrl, Cmd, or Alt, leaving browser/OS shortcuts alone", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    render(<HotkeyListener />);

    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    fireEvent.keyDown(document, { key: "a", altKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });
    const { unmount } = render(<HotkeyListener />);
    unmount();

    fireEvent.keyDown(document, { key: "a" });

    expect(handler).not.toHaveBeenCalled();
  });
});
