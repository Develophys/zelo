import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeyHelpModal } from "./HotkeyHelpModal";
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerPrefsStore } from "@/stores/manager-prefs.store";

function noop() {}

function Probe({ handler }: { handler: () => void }) {
  useHotkey("d", handler, "Desativar", { scope: "page" });
  return null;
}

describe("HotkeyHelpModal", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map(), helpOpen: false });
    useManagerPrefsStore.setState({ hotkeys: "on" });
  });

  it("renders nothing when closed", () => {
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on '?'", () => {
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Atalhos de teclado" })).toBeInTheDocument();
  });

  it("lists global and page-scoped entries in their own sections", () => {
    useHotkeyStore.getState().register("i", { handler: noop, label: "Início", scope: "global" });
    useHotkeyStore.getState().register("a", { handler: noop, label: "Adicionar instituição", scope: "page" });
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );

    fireEvent.keyDown(document, { key: "?" });

    const dialog = screen.getByRole("dialog");
    const globalSection = within(dialog).getByRole("region", { name: "Atalhos globais" });
    expect(within(globalSection).getByText("Início")).toBeInTheDocument();
    expect(within(globalSection).getByText("i")).toBeInTheDocument();

    const pageSection = within(dialog).getByRole("region", { name: "Nesta página" });
    expect(within(pageSection).getByText("Adicionar instituição")).toBeInTheDocument();
    expect(within(pageSection).getByText("a")).toBeInTheDocument();
  });

  it("lists entries alphabetized by key (including its own '?'), not by registration order", () => {
    useHotkeyStore.getState().register("v", { handler: noop, label: "Você", scope: "global" });
    useHotkeyStore.getState().register("i", { handler: noop, label: "Início", scope: "global" });
    useHotkeyStore.getState().register("g", { handler: noop, label: "Configurações", scope: "global" });
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );

    fireEvent.keyDown(document, { key: "?" });

    const globalSection = within(screen.getByRole("dialog")).getByRole("region", { name: "Atalhos globais" });
    const keys = [...globalSection.querySelectorAll("kbd")].map((kbd) => kbd.textContent);
    expect(keys).toEqual(["?", "g", "i", "v"]);
  });

  it("says there is nothing page-specific when only global entries are registered", () => {
    useHotkeyStore.getState().register("i", { handler: noop, label: "Início", scope: "global" });
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );

    fireEvent.keyDown(document, { key: "?" });

    const dialog = screen.getByRole("dialog");
    const pageSection = within(dialog).getByRole("region", { name: "Nesta página" });
    expect(within(pageSection).getByText("Nenhum atalho nesta página.")).toBeInTheDocument();
  });

  it("closes on Escape, same as every other modal", () => {
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );
    fireEvent.keyDown(document, { key: "?" });
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("suppresses page hotkeys while it is open, reference-only overlay or not", () => {
    const handler = vi.fn();
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
        <Probe handler={handler} />
      </>
    );

    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "d" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("lets page hotkeys fire again once it closes", () => {
    const handler = vi.fn();
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
        <Probe handler={handler} />
      </>
    );

    fireEvent.keyDown(document, { key: "?" });
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "d" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("offers the shared hotkeys preference right where you're already looking", async () => {
    const user = userEvent.setup();
    render(
      <>
        <HotkeyListener />
        <HotkeyHelpModal />
      </>
    );
    fireEvent.keyDown(document, { key: "?" });
    const dialog = within(screen.getByRole("dialog"));

    await user.click(dialog.getByRole("radio", { name: "Desativados" }));

    expect(useManagerPrefsStore.getState().hotkeys).toBe("off");
  });
});
