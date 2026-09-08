import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HotkeyHelpModal } from "./HotkeyHelpModal";
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";

function noop() {}

describe("HotkeyHelpModal", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
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
});
