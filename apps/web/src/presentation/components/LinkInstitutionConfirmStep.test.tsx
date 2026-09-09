import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LinkInstitutionConfirmStep } from "./LinkInstitutionConfirmStep";

function renderStep({
  onConfirm = vi.fn(),
  onReject = vi.fn(),
}: { onConfirm?: () => void; onReject?: () => void } = {}) {
  return render(
    <MemoryRouter>
      <LinkInstitutionConfirmStep
        institutionName="Hospital São Lucas"
        sectorName="UTI"
        onConfirm={onConfirm}
        onReject={onReject}
      />
    </MemoryRouter>,
  );
}

describe("LinkInstitutionConfirmStep", () => {
  it("shows the institution and sector names and confirms on click", () => {
    const onConfirm = vi.fn();
    renderStep({ onConfirm });

    expect(screen.getByText("Hospital São Lucas")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onReject when the person says it's the wrong code", () => {
    const onReject = vi.fn();
    renderStep({ onReject });

    fireEvent.click(screen.getByRole("button", { name: /não é isso/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
