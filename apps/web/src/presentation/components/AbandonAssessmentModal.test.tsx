import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Blocker } from "react-router";
import { AbandonAssessmentModal } from "./AbandonAssessmentModal";

function unblockedBlocker(): Blocker {
  return { state: "unblocked", proceed: undefined, reset: undefined, location: undefined } as Blocker;
}

function blockedBlocker(overrides: { proceed: () => void; reset: () => void }): Blocker {
  return {
    state: "blocked",
    proceed: overrides.proceed,
    reset: overrides.reset,
    location: { pathname: "/home", search: "", hash: "", state: null, key: "default" },
  } as Blocker;
}

describe("AbandonAssessmentModal", () => {
  it("renders nothing visible when the blocker is unblocked", () => {
    render(<AbandonAssessmentModal blocker={unblockedBlocker()} onConfirmLeave={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the confirmation dialog when the blocker is blocked", () => {
    render(
      <AbandonAssessmentModal blocker={blockedBlocker({ proceed: vi.fn(), reset: vi.fn() })} onConfirmLeave={vi.fn()} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sair sem terminar?")).toBeInTheDocument();
  });

  it("'Continuar respondendo' calls blocker.reset(), not onConfirmLeave", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const proceed = vi.fn();
    const onConfirmLeave = vi.fn();
    render(<AbandonAssessmentModal blocker={blockedBlocker({ proceed, reset })} onConfirmLeave={onConfirmLeave} />);

    await user.click(screen.getByRole("button", { name: "Continuar respondendo" }));

    expect(reset).toHaveBeenCalledOnce();
    expect(proceed).not.toHaveBeenCalled();
    expect(onConfirmLeave).not.toHaveBeenCalled();
  });

  it("'Sair mesmo assim' calls onConfirmLeave then blocker.proceed()", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const proceed = vi.fn();
    const onConfirmLeave = vi.fn();
    render(<AbandonAssessmentModal blocker={blockedBlocker({ proceed, reset })} onConfirmLeave={onConfirmLeave} />);

    await user.click(screen.getByRole("button", { name: "Sair mesmo assim" }));

    expect(onConfirmLeave).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });
});
