import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

const OPTIONS = [{ id: "a", name: "UTI" }, { id: "b", name: "Pronto-Socorro" }];
const ALL_LABEL = "Todos os setores";
const countLabel = (count: number) => `${count} setores selecionados`;

function openPanel(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { expanded: false }));
}

describe("MultiSelectDropdown", () => {
  it("renders one checkbox per option, all checked when selected is undefined (defaults to all)", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={undefined}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);

    expect(screen.getByLabelText("UTI")).toBeChecked();
    expect(screen.getByLabelText("Pronto-Socorro")).toBeChecked();
  });

  it("calls onChange with the toggled option removed from the full set when unchecking one of an implicit all-selected state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={undefined}
        onChange={onChange}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);
    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with the option added back when re-checking an explicitly narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={["b"]}
        onChange={onChange}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);
    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });

  it("labels the trigger with allLabel when every option is selected", () => {
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={undefined}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );
    expect(screen.getByRole("button", { name: ALL_LABEL })).toBeInTheDocument();
  });

  it("labels the trigger with the option's own name when exactly one is selected", () => {
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={["a"]}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );
    expect(screen.getByRole("button", { name: "UTI" })).toBeInTheDocument();
  });

  it("labels the trigger with countLabel's result when several but not all options are selected", () => {
    const options = [...OPTIONS, { id: "c", name: "Emergência" }];
    render(
      <MultiSelectDropdown
        options={options}
        selected={["a", "b"]}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );
    expect(screen.getByRole("button", { name: "2 setores selecionados" })).toBeInTheDocument();
  });

  it("selects every option when 'Todos' is clicked from a narrowed selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={["a"]}
        onChange={onChange}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);
    await user.click(screen.getByLabelText("Todos"));

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("closes the panel and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={undefined}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    const trigger = screen.getByRole("button", { name: ALL_LABEL });
    await user.click(trigger);
    expect(screen.getByLabelText("UTI")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("stacks above the fixed bottom nav and caps its own height so a long option list scrolls instead of hiding underneath it", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={undefined}
        onChange={() => {}}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);

    const panel = screen.getByRole("group", { name: "Setores" });
    expect(panel).toHaveClass("z-40");
    expect(panel).toHaveClass("max-h-72", "overflow-y-auto");
  });

  it("falls back to every option when unchecking the last remaining one, since an empty filter shows nothing at all", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={OPTIONS}
        selected={["a"]}
        onChange={onChange}
        allLabel={ALL_LABEL}
        countLabel={countLabel}
        groupLabel="Setores"
      />,
    );

    await openPanel(user);
    await user.click(screen.getByLabelText("UTI"));

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("closes the panel when clicking outside of it", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MultiSelectDropdown
          options={OPTIONS}
          selected={undefined}
          onChange={() => {}}
          allLabel={ALL_LABEL}
          countLabel={countLabel}
          groupLabel="Setores"
        />
        <button type="button">outside</button>
      </div>,
    );

    await openPanel(user);
    expect(screen.getByLabelText("UTI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
  });

  it("uses a distinct groupLabel when rendering a non-sector option set", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={[{ id: "INVITE_ACCEPTED", name: "Convite aceito" }]}
        selected={undefined}
        onChange={() => {}}
        allLabel="Todos os tipos"
        countLabel={(n) => `${n} tipos selecionados`}
        groupLabel="Tipos de notificação"
      />,
    );

    await openPanel(user);
    expect(screen.getByRole("group", { name: "Tipos de notificação" })).toBeInTheDocument();
  });
});
