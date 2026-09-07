import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HistoryChartCard } from './HistoryChartCard';
import * as container from '@/app/container';

const SIX_NULL_POINTS = Array.from({ length: 6 }, () => ({ weekStart: '', severityFraction: null }));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistoryChartCard />
    </QueryClientProvider>,
  );
}

describe('HistoryChartCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a skeleton while the history is loading, not an empty chart', () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockReturnValue(
      new Promise(() => {}),
    );

    renderCard();

    // One skeleton bar per week, so the card holds its height and does not jump
    // when the real chart arrives.
    expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
    expect(screen.queryAllByTestId('history-bar')).toHaveLength(0);
  });

  it('says the history could not be loaded instead of drawing it as empty', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockRejectedValue(
      new Error('offline'),
    );

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar seu histórico.',
    );
    expect(screen.queryAllByTestId('history-bar')).toHaveLength(0);
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('retries the fetch from the error state', async () => {
    const execute = vi
      .spyOn(container.getAssessmentHistoryUseCase, 'execute')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SIX_NULL_POINTS);
    const user = userEvent.setup();

    renderCard();
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByTestId('history-bar')).toHaveLength(6);
  });

  it('draws the empty chart when the history loaded but holds no readings', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue(SIX_NULL_POINTS);

    renderCard();

    await waitFor(() => {
      expect(screen.queryAllByTestId('history-bar')).toHaveLength(6);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('drops the Mais recente/Pico legend when no bar actually uses those colors, and explains why the chart is flat', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue(SIX_NULL_POINTS);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    // A legend naming colors that never appear on the chart reads as broken,
    // not empty — so it should not render at all here.
    expect(screen.queryByText('Mais recente')).not.toBeInTheDocument();
    expect(screen.queryByText('Pico')).not.toBeInTheDocument();
    expect(
      screen.getByText('Faça seu primeiro check-in para ver sua tendência aqui.'),
    ).toBeInTheDocument();
  });

  it('keeps the legend once there is at least one real reading to point at', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      ...SIX_NULL_POINTS.slice(0, 5),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.4 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    // A single real reading is both the latest week and the peak; peak wins
    // the bar's colour (so a severe latest reading is never painted the same
    // "good news" colour as a minimal one), so "Mais recente" must not claim
    // a colour that bar doesn't use.
    expect(screen.getByText('Pico')).toBeInTheDocument();
    expect(screen.queryByText('Mais recente')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Faça seu primeiro check-in para ver sua tendência aqui.'),
    ).not.toBeInTheDocument();
  });

  it('shows both legend entries once the peak and the latest week are different bars', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 0.9 },
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.2 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    expect(screen.getByText('Mais recente')).toBeInTheDocument();
    expect(screen.getByText('Pico')).toBeInTheDocument();
  });

  it('prints each week\'s percentage above its bar, matching the manager dashboard\'s trend chart', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.4 },
      { weekStart: '2026-08-08T00:00:00.000Z', severityFraction: 0.67 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    const values = screen.getAllByTestId('history-bar-value');
    expect(values.map((el) => el.textContent)).toEqual(['', '', '', '', '40%', '67%']);
  });

  it('never paints a severe latest reading the same brand-green as a minimal one', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 1 },
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 1 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    const bars = screen.getAllByTestId('history-bar');
    // The latest week is also the maximal-possible reading (peak): the bar
    // must read as an alarm, not as good news.
    expect(bars[5]!.className).not.toContain('bg-brand');
  });

  it('colors each non-peak bar by its own severity band, not a fixed good-news color', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 1 },
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.5 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    const bars = screen.getAllByTestId('history-bar');
    expect(bars[0]!.className).toContain('bg-warn'); // peak
    // 0.5 * 27 ≈ 14, the top of the "Moderado" band — not a minimal/mild
    // reading, so it must not render the brand's affirmative green.
    expect(bars[5]!.className).not.toContain('bg-brand');
    expect(bars[5]!.className).toContain('bg-band-moderate');
  });

  it('still paints a genuinely minimal, non-peak latest reading brand-green', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 0.9 },
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.05 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    const bars = screen.getAllByTestId('history-bar');
    expect(bars[5]!.className).toContain('bg-brand');
  });

  it("colors the Mais recente legend dot to match what the latest bar actually renders", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 0.9 },
      ...SIX_NULL_POINTS.slice(0, 4),
      { weekStart: '2026-08-01T00:00:00.000Z', severityFraction: 0.5 },
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    const dot = screen.getByText('Mais recente').firstElementChild!;
    expect(dot.className).toContain('bg-band-moderate');
    expect(dot.className).not.toContain('bg-brand');
  });

  it('drops "Mais recente" when the latest week itself has no check-in, even though an earlier week is the peak', async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: '2026-07-01T00:00:00.000Z', severityFraction: 0.9 },
      ...SIX_NULL_POINTS.slice(0, 5),
    ]);

    renderCard();
    await waitFor(() => expect(screen.queryAllByTestId('history-bar')).toHaveLength(6));

    expect(screen.getByText('Pico')).toBeInTheDocument();
    expect(screen.queryByText('Mais recente')).not.toBeInTheDocument();
  });
});
