import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHotkeyStore } from "./hotkey.store";

function noop() {}

describe("useHotkeyStore", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map(), helpOpen: false });
  });

  it("registers a new key and reports success", () => {
    const registered = useHotkeyStore
      .getState()
      .register("a", { handler: noop, label: "Adicionar", scope: "page" });

    expect(registered).toBe(true);
    const entry = useHotkeyStore.getState().entries.get("a");
    expect(entry).toMatchObject({ label: "Adicionar", scope: "page", count: 1 });
  });

  it("merges an identical registration (same key, label, scope) into a reference count instead of warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = useHotkeyStore.getState();

    const first = store.register("i", { handler: noop, label: "Início", scope: "global" });
    const second = store.register("i", { handler: noop, label: "Início", scope: "global" });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(useHotkeyStore.getState().entries.get("i")?.count).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("keeps the first registration and warns in dev when a different label claims the same key", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = useHotkeyStore.getState();

    const first = store.register("a", { handler: noop, label: "Adicionar instituição", scope: "page" });
    const second = store.register("a", { handler: noop, label: "Ativar", scope: "page" });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(useHotkeyStore.getState().entries.get("a")).toMatchObject({ label: "Adicionar instituição", count: 1 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Adicionar instituição"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ativar"));
    warnSpy.mockRestore();
  });

  it("decrements the count on unregister, only removing the entry once the count reaches zero", () => {
    const store = useHotkeyStore.getState();
    store.register("i", { handler: noop, label: "Início", scope: "global" });
    store.register("i", { handler: noop, label: "Início", scope: "global" });

    store.unregister("i");
    expect(useHotkeyStore.getState().entries.get("i")?.count).toBe(1);

    store.unregister("i");
    expect(useHotkeyStore.getState().entries.has("i")).toBe(false);
  });

  it("does nothing when asked to unregister a key that was never registered", () => {
    expect(() => useHotkeyStore.getState().unregister("z")).not.toThrow();
    expect(useHotkeyStore.getState().entries.size).toBe(0);
  });

  it("fires the handler that was actually registered, not a stale closure", () => {
    const handler = vi.fn();
    useHotkeyStore.getState().register("a", { handler, label: "Adicionar", scope: "page" });

    useHotkeyStore.getState().entries.get("a")?.handler();

    expect(handler).toHaveBeenCalledOnce();
  });
});
