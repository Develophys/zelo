import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectorMultiSelect } from "./SectorMultiSelect";

const SECTORS = [{ id: "a", name: "UTI" }, { id: "b", name: "Pronto-Socorro" }];

describe("SectorMultiSelect", () => {
  it("renders one checkbox per sector, all checked when selected is undefined (defaults to all)", () => {
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={() => {}} />);

    expect(screen.getByLabelText("UTI")).toBeChecked();
    expect(screen.getByLabelText("Pronto-Socorro")).toBeChecked();
  });

  it("calls onChange with the toggled sector removed from the full set when unchecking one of an implicit all-selected state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={undefined} onChange={onChange} />);

    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with the sector added back when re-checking an explicitly narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorMultiSelect sectors={SECTORS} selected={["b"]} onChange={onChange} />);

    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });
});
