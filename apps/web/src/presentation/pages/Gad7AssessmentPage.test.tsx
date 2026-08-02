import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Gad7AssessmentPage } from "./Gad7AssessmentPage";
import * as container from "@/app/container";
import { GAD7_QUESTIONS } from "@/domain/assessment-scales/gad7";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderGad7() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/assessment/gad7"]}>
        <Routes>
          <Route path="/assessment/gad7" element={<Gad7AssessmentPage />} />
          <Route path="/assessment" element={<div>Assessment select screen</div>} />
          <Route path="/assessment/result" element={<div>Result screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Gad7AssessmentPage", () => {
  beforeEach(() => {
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockResolvedValue({
      totalScore: 3,
      riskSignal: false,
      submissionSucceeded: true,
    });
  });

  it("shows exactly one question at a time with an accurate progress counter", () => {
    renderGad7();
    expect(screen.getByText(GAD7_QUESTIONS[0])).toBeInTheDocument();
    expect(screen.getByText("1/7")).toBeInTheDocument();
  });

  it("submits via the existing pipeline and navigates to the result screen with max=21", async () => {
    const user = userEvent.setup();
    renderGad7();

    for (let i = 0; i < GAD7_QUESTIONS.length; i++) {
      await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    }

    await waitFor(() => {
      expect(screen.getByText("Result screen")).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledWith({
      scaleType: "GAD-7",
      answers: new Array(GAD7_QUESTIONS.length).fill(0),
    });
  });

  it("shows a skeleton in place of the question card while the final submission is in flight", async () => {
    let resolveSubmit!: (value: Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>>((resolve) => {
      resolveSubmit = resolve;
    });
    vi.spyOn(container.submitAssessmentUseCase, "execute").mockReturnValue(pending);

    const user = userEvent.setup();
    renderGad7();

    for (let i = 0; i < GAD7_QUESTIONS.length; i++) {
      await user.click(screen.getByRole("button", { name: "Nenhuma vez" }));
    }

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Nenhuma vez" })).not.toBeInTheDocument();

    resolveSubmit({ totalScore: 0, riskSignal: false, submissionSucceeded: true });

    await waitFor(() => {
      expect(screen.getByText("Result screen")).toBeInTheDocument();
    });
  });
});
