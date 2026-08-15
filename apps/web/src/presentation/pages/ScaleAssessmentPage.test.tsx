import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScaleAssessmentPage } from './ScaleAssessmentPage';
import { PHQ9_SCALE, GAD7_SCALE, type AssessmentScale } from '@/domain/assessment-scales/scales';
import * as container from '@/app/container';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';

function ResultProbe() {
  const { state } = useLocation() as { state: { max: number; totalScore: number } };
  return <div>{`Result screen max=${state.max} score=${state.totalScore}`}</div>;
}

function renderScale(scale: AssessmentScale, path: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={<ScaleAssessmentPage scale={scale} />} />
          <Route path={routes.assessment} element={<div>Assessment select screen</div>} />
          <Route path={routes.result} element={<ResultProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function pendingSubmit() {
  let resolve!: (
    value: Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>,
  ) => void;
  const promise = new Promise<
    Awaited<ReturnType<typeof container.submitAssessmentUseCase.execute>>
  >((r) => {
    resolve = r;
  });
  vi.spyOn(container.submitAssessmentUseCase, 'execute').mockReturnValue(promise);
  return { resolve };
}

const SCALES = [
  { name: 'PHQ-9', scale: PHQ9_SCALE, path: routes.phq9, total: 9, maxScore: 27 },
  { name: 'GAD-7', scale: GAD7_SCALE, path: routes.gad7, total: 7, maxScore: 21 },
];

describe.each(SCALES)('ScaleAssessmentPage — $name', ({ scale, path, total, maxScore }) => {
  beforeEach(() => {
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
  });

  it('shows exactly one question at a time with an accurate progress counter', () => {
    renderScale(scale, path);
    expect(screen.getByText(scale.questions[0]!)).toBeInTheDocument();
    expect(screen.queryByText(scale.questions[1]!)).not.toBeInTheDocument();
    expect(screen.getByText(`1/${total}`)).toBeInTheDocument();
  });

  it('auto-advances on selection; back steps to the previous question, then to the selector', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    expect(screen.getByText(scale.questions[1]!)).toBeInTheDocument();
    expect(screen.getByText(`2/${total}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText(scale.questions[0]!)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Assessment select screen')).toBeInTheDocument();
  });

  it("carries the scale's own score ceiling through to the result screen", async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }

    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledWith({
      scaleType: scale.type,
      answers: new Array(total).fill(0),
    });
  });

  it('announces each question change to assistive technology', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Pergunta 1 de ${total}: ${scale.questions[0]}`);

    await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    expect(status).toHaveTextContent(`Pergunta 2 de ${total}: ${scale.questions[1]}`);
  });

  it('keeps the answered question on screen and locks the options while the submit is in flight', async () => {
    const { resolve } = pendingSubmit();
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }

    expect(screen.getByText(scale.questions[total - 1]!)).toBeInTheDocument();
    const chosen = screen.getByRole('button', { name: 'Nenhuma vez' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quase todos os dias' })).toBeDisabled();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();

    expect(screen.getByText('Enviando…')).toBeInTheDocument();
    expect(screen.getByTestId('back-button')).toBeDisabled();
    expect(chosen.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');

    resolve({ totalScore: 0, riskSignal: false, submissionSucceeded: true });
    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=0`)).toBeInTheDocument();
    });
  });

  it('animates the in-flight label per letter while keeping it one word for assistive tech', async () => {
    pendingSubmit();
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }

    expect(screen.getByText('Enviando…')).toHaveClass('sr-only');
    expect(screen.getByTestId('wave-text-letters').children).toHaveLength('Enviando…'.length);
  });

  it('guards against double-submit when the final option is clicked twice rapidly', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total - 1; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }

    const finalOption = screen.getByRole('button', { name: 'Nenhuma vez' });
    fireEvent.click(finalOption);
    fireEvent.click(finalOption);

    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('raises a submit failure as an alert and lets the same option retry', async () => {
    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockRejectedValueOnce(
      new Error('offline'),
    );
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Não foi possível enviar. Selecione uma opção para tentar novamente.',
    );
    expect(alert.closest('[aria-busy]')).toBeNull();
    expect(screen.queryByText('Enviando…')).not.toBeInTheDocument();
    expect(screen.getByTestId('back-button')).toBeEnabled();

    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
    await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));

    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    });
  });

  it('drops the submit failure alert when the user steps back to another question', async () => {
    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockRejectedValueOnce(
      new Error('offline'),
    );
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('button', { name: 'Nenhuma vez' }));
    }
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByText(scale.questions[total - 2]!)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the scale in a page heading for assistive technology', () => {
    renderScale(scale, path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `Autoavaliação ${scale.type}`,
    );
  });
});
