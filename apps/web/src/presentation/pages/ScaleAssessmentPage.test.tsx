import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScaleAssessmentPage } from './ScaleAssessmentPage';
import { PHQ9_SCALE, GAD7_SCALE, type AssessmentScale } from '@/domain/assessment-scales/scales';
import { PHQ9_RISK_ITEM_INDEX } from '@/domain/assessment-scales/phq9';
import * as container from '@/app/container';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';

function ResultProbe() {
  const { state } = useLocation() as {
    state: { max: number; totalScore: number; pendingSync?: boolean };
  };
  return (
    <>
      <div>{`Result screen max=${state.max} score=${state.totalScore}`}</div>
      <div>{`pendingSync=${state.pendingSync === true}`}</div>
    </>
  );
}

function renderScale(scale: AssessmentScale, path: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={<ScaleAssessmentPage scale={scale} />} />
          <Route path={routes.assessment} element={<div>Assessment select screen</div>} />
          <Route path={routes.home} element={<div>Home screen</div>} />
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
    // Each test is its own browser session; the in-progress draft is scoped to
    // one, so leaving it behind would resume the previous test's instrument.
    sessionStorage.clear();
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

  it('auto-advances on selection', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    expect(screen.getByText(scale.questions[1]!)).toBeInTheDocument();
    expect(screen.getByText(`2/${total}`)).toBeInTheDocument();
  });

  it('steps back to the previous question with the earlier answer still selected', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Vários dias' }));
    expect(screen.getByText(scale.questions[1]!)).toBeInTheDocument();

    await user.click(screen.getByTestId('question-back'));

    expect(screen.getByText(scale.questions[0]!)).toBeInTheDocument();
    expect(screen.getByText(`1/${total}`)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Vários dias' })).toBeChecked();
  });

  it('records a changed answer instead of the one first tapped', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Quase todos os dias' }));
    await user.click(screen.getByTestId('question-back'));
    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));

    for (let i = 1; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    await waitFor(() => {
      expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledWith({
        scaleType: scale.type,
        answers: new Array(total).fill(0),
      });
    });
  });

  it('disables the step-back control on the first question', () => {
    renderScale(scale, path);
    expect(screen.getByTestId('question-back')).toBeDisabled();
  });

  it("carries the scale's own score ceiling through to the result screen", async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    });

    expect(container.submitAssessmentUseCase.execute).toHaveBeenCalledWith({
      scaleType: scale.type,
      answers: new Array(total).fill(0),
    });
  });

  it('answering the last question opens a review instead of submitting', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }

    expect(container.submitAssessmentUseCase.execute).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar respostas' })).toBeInTheDocument();
    scale.questions.forEach((question) => {
      expect(screen.getByText(question)).toBeInTheDocument();
    });
  });

  it('jumps back from the review to change a single answer', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }

    await user.click(screen.getByTestId('review-edit-0'));

    expect(screen.getByText(`1/${total}`)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Nenhuma vez' })).toBeChecked();
  });

  it('announces each question change to assistive technology', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Pergunta 1 de ${total}: ${scale.questions[0]}`);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    expect(status).toHaveTextContent(`Pergunta 2 de ${total}: ${scale.questions[1]}`);
  });

  it('keeps the answered question on screen and locks the options while the submit is in flight', async () => {
    const { resolve } = pendingSubmit();
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    const submit = screen.getByRole('button', { name: 'Enviar respostas' });
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(screen.getByTestId('review-edit-0')).toBeDisabled();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();

    expect(screen.getByText('Enviando…')).toBeInTheDocument();
    expect(submit.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');

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
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(screen.getByText('Enviando…')).toHaveClass('sr-only');
    expect(screen.getByTestId('wave-text-letters').children).toHaveLength('Enviando…'.length);
  });

  it('guards against double-submit when Enviar is clicked twice rapidly', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }

    const submit = screen.getByRole('button', { name: 'Enviar respostas' });
    fireEvent.click(submit);
    fireEvent.click(submit);

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
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível enviar suas respostas.');
    expect(alert.closest('[aria-busy]')).toBeNull();
    expect(screen.queryByText('Enviando…')).not.toBeInTheDocument();

    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(screen.getByText(`Result screen max=${maxScore} score=5`)).toBeInTheDocument();
    });
  });

  it('names the scale in the shared header rather than a hidden heading', () => {
    renderScale(scale, path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(scale.type);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps the header escape hatch distinct from the in-body step-back control', () => {
    renderScale(scale, path);
    expect(screen.getByTestId('back-button').closest('[data-testid="app-header"]')).not.toBeNull();
    expect(screen.getByTestId('question-back').closest('[data-testid="app-header"]')).toBeNull();
  });

  it('the header escape hatch still exits the assessment entirely', async () => {
    const user = userEvent.setup();
    renderScale(scale, path);

    await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    expect(screen.getByText(scale.questions[1]!)).toBeInTheDocument();

    await user.click(screen.getByTestId('back-button'));
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('carries an upload failure through to the result instead of swallowing it', async () => {
    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: false,
    });
    const user = userEvent.setup();
    renderScale(scale, path);

    for (let i = 0; i < total; i++) {
      await user.click(screen.getByRole('radio', { name: 'Nenhuma vez' }));
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    // submissionSucceeded was produced by the use case and read by nothing, so
    // a check-in that never reached the server looked identical to one that did.
    await waitFor(() => {
      expect(screen.getByText(/pendingSync=true/)).toBeInTheDocument();
    });
  });
});

describe('ScaleAssessmentPage — an interrupted instrument', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(container.submitAssessmentUseCase, 'execute').mockResolvedValue({
      totalScore: 5,
      riskSignal: false,
      submissionSucceeded: true,
    });
  });

  // A phone call, a refresh, a PWA evicted under memory pressure, or an
  // autoUpdate service worker landing mid-session. Starting over is not what an
  // exhausted person does.
  it('brings back the answers and the cursor after the page is remounted', async () => {
    const user = userEvent.setup();
    const first = renderScale(PHQ9_SCALE, routes.phq9);

    await user.click(screen.getAllByRole('radio')[1]!);
    await user.click(screen.getAllByRole('radio')[2]!);
    expect(screen.getByText('3/9')).toBeInTheDocument();
    first.unmount();

    renderScale(PHQ9_SCALE, routes.phq9);
    expect(screen.getByText('3/9')).toBeInTheDocument();
    expect(screen.getByTestId('assessment-resumed')).toBeInTheDocument();
  });

  it('says the answers were kept rather than dropping the reader mid-instrument', () => {
    sessionStorage.setItem(
      'zelo.assessment-draft',
      JSON.stringify({
        scaleType: 'PHQ-9',
        answers: [1, 2, null, null, null, null, null, null, null],
        questionIndex: 2,
      }),
    );

    renderScale(PHQ9_SCALE, routes.phq9);
    expect(screen.getByTestId('assessment-resumed')).toHaveTextContent(
      'Retomamos de onde você parou.',
    );
  });

  it('drops the resumed note once the reader answers again', async () => {
    sessionStorage.setItem(
      'zelo.assessment-draft',
      JSON.stringify({
        scaleType: 'PHQ-9',
        answers: [1, null, null, null, null, null, null, null, null],
        questionIndex: 1,
      }),
    );
    const user = userEvent.setup();
    renderScale(PHQ9_SCALE, routes.phq9);

    await user.click(screen.getAllByRole('radio')[0]!);
    expect(screen.queryByTestId('assessment-resumed')).not.toBeInTheDocument();
  });

  it('starts a fresh instrument at the first item, with no resumed note', () => {
    renderScale(PHQ9_SCALE, routes.phq9);

    expect(screen.getByText('1/9')).toBeInTheDocument();
    expect(screen.queryByTestId('assessment-resumed')).not.toBeInTheDocument();
  });

  // The submitted answers are on the result screen and in IndexedDB; a draft
  // left behind would reopen a finished instrument as if it were unfinished.
  it('forgets the draft once the answers have been sent', async () => {
    const user = userEvent.setup();
    renderScale(PHQ9_SCALE, routes.phq9);

    for (let index = 0; index < PHQ9_SCALE.questions.length; index += 1) {
      await user.click(screen.getAllByRole('radio')[0]!);
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    await screen.findByText(/Result screen/);

    expect(sessionStorage.getItem('zelo.assessment-draft')).toBeNull();
  });
});

describe('ScaleAssessmentPage — the self-harm item', () => {
  beforeEach(() => sessionStorage.clear());

  it("puts the crisis line on the self-harm item itself, before any answer is given", async () => {
    const user = userEvent.setup();
    renderScale(PHQ9_SCALE, routes.phq9);

    for (let index = 0; index < PHQ9_RISK_ITEM_INDEX; index += 1) {
      expect(screen.queryByRole("link", { name: /188/ })).not.toBeInTheDocument();
      await user.click(screen.getAllByRole("radio")[0]!);
    }

    // Ungated on purpose: appearing only once a non-zero answer is picked would
    // make the line's arrival a verdict on the answer.
    const link = screen.getByRole("link", { name: /188/ });
    expect(link).toHaveAttribute("href", "tel:188");
  });

  it("keeps the crisis line on the self-harm item after a zero answer, and drops it on later items", async () => {
    const user = userEvent.setup();
    renderScale(PHQ9_SCALE, routes.phq9);

    for (let index = 0; index < PHQ9_RISK_ITEM_INDEX; index += 1) {
      await user.click(screen.getAllByRole("radio")[0]!);
    }
    expect(screen.getByRole("link", { name: /188/ })).toBeInTheDocument();

    await user.click(screen.getAllByRole("radio")[0]!);
    expect(screen.queryByRole("link", { name: /188/ })).not.toBeInTheDocument();
  });
});
