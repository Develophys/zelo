import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectorMultiSelect } from "./SectorMultiSelect";

const SECTORS = [{ id: "a", name: "UTI" }, { id: "b", name: "Pronto-Socorro" }];

function openPanel(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { expanded: false }));
}

describe("SectorMultiSelect", () => {
  it("renders one checkbox per sector, all checked when selected is undefined (defaults to all)", async () => {
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />);

    await openPanel(user);

    expect(screen.getByLabelText("UTI")).toBeChecked();
    expect(screen.getByLabelText("Pronto-Socorro")).toBeChecked();
  });

  it("calls onChange with the toggled sector removed from the full set when unchecking one of an implicit all-selected state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={onChange} />);

    await openPanel(user);
    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with the sector added back when re-checking an explicitly narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={["b"]} onChange={onChange} />);

    await openPanel(user);
    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });

  it("labels the trigger 'Todos os setores' when every sector is selected", () => {
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Todos os setores" })).toBeInTheDocument();
  });

  it("labels the trigger with the sector's own name when exactly one is selected", () => {
    render(<SectorMultiSelect sectors={SECTORS} selected={["a"]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "UTI" })).toBeInTheDocument();
  });

  it("labels the trigger with a count when several but not all sectors are selected", () => {
    const sectors = [...SECTORS, { id: "c", name: "Emergência" }];
    render(<SectorMultiSelect sectors={sectors} selected={["a", "b"]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "2 setores selecionados" })).toBeInTheDocument();
  });

  it("selects every sector when 'Todos' is clicked from a narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={["a"]} onChange={onChange} />);

    await openPanel(user);
    await user.click(screen.getByLabelText("Todos"));

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("closes the panel and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />);

    const trigger = screen.getByRole("button", { name: "Todos os setores" });
    await user.click(trigger);
    expect(screen.getByLabelText("UTI")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the panel when clicking outside of it", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />
        <button type="button">outside</button>
      </div>,
    );

    await openPanel(user);
    expect(screen.getByLabelText("UTI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
  });
});
