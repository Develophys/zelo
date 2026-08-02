import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Phq9AssessmentPage } from "./Phq9AssessmentPage";
import * as container from "@/app/container";
import { PHQ9_QUESTIONS } from "@/domain/assessment-scales/phq9";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderPhq9() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/assessment/phq9"]}>
        <Routes>
          <Route path="/assessment/phq9" element={<Phq9AssessmentPage />} />
          <Route path="/assessment" element={<div>Assessment select screen</div>} />
          <Route path="/assessment/result" element={<div>Result screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Phq9AssessmentPage", () => {
  beforeEach(() => {
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
  });

  it("shows exactly one question at a time with an accurate progress counter", () => {
    renderPhq9();
    expect(screen.getByText(PHQ9_QUESTIONS[0])).toBeInTheDocument();
    expect(screen.queryByText(PHQ9_QUESTIONS[1])).not.toBeInTheDocument();
    expect(screen.getByText("1/9")).toBeInTheDocument();
  });

  it("auto-advances on selection; back steps to the previous question, then to the selector", async () => {
    const user = userEvent.setup();
    renderPhq9();

    await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    expect(screen.getByText(PHQ9_QUESTIONS[1])).toBeInTheDocument();
    expect(screen.getByText("2/9")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText(PHQ9_QUESTIONS[0])).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Assessment select screen")).toBeInTheDocument();
  });

  it("submits via the existing pipeline and navigates to the result screen with the on-device score", async () => {
    const user = userEvent.setup();
    renderPhq9();

    for (let i = 0; i < PHQ9_QUESTIONS.length; i++) {
      await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    }

    await waitFor(() => {
      expect(screen.getByText("Result screen")).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledWith({
      scaleType: "PHQ-9",
      answers: new Array(PHQ9_QUESTIONS.length).fill(0),
    });
  });

  it("shows a skeleton in place of the question card while the final submission is in flight", async () => {
    let resolveSubmit!: (value: Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>>((resolve) => {
      resolveSubmit = resolve;
    });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockReturnValue(pending);

    const user = userEvent.setup();
    renderPhq9();

    for (let i = 0; i < PHQ9_QUESTIONS.length; i++) {
      await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    }

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Nenhuma vez" })).not.toBeInTheDocument();

    resolveSubmit({ totalScore: 0, riskSignal: false, submissionSucceeded: true });

    await waitFor(() => {
      expect(screen.getByText("Result screen")).toBeInTheDocument();
    });
  });

  it("guards against double-submit when the final question's option is clicked twice rapidly", async () => {
    const user = userEvent.setup();
    renderPhq9();

    for (let i = 0; i < PHQ9_QUESTIONS.length - 1; i++) {
      await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    }

    const finalOption = screen.getByRole("button", { name: "Nenhuma vez" });
    fireEvent.click(finalOption);
    fireEvent.click(finalOption);

    await waitFor(() => {
      expect(screen.getByText("Result screen")).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledTimes(1);
  });
});
