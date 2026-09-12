import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFollowUpAnswer, ACKNOWLEDGMENT_WINDOW_HOURS } from './useFollowUpAnswer';
import * as container from '@/app/container';
import { useFollowUpStore } from '@/stores/followup.store';
import { FOLLOWUP_INTERVAL_DAYS } from '@/use-cases/should-show-followup-prompt.usecase';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useFollowUpAnswer', () => {
  beforeEach(() => {
    localStorage.clear();
    useFollowUpStore.setState({ answer: null, answeredAt: null });
    vi.restoreAllMocks();
  });

  it('reports answeredThisCycle as false before history resolves, so nothing renders prematurely', () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.answeredThisCycle).toBe(false);
  });

  it('reports answeredThisCycle true once a recorded answer matches the current assessment cycle', async () => {
    const now = new Date();
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: now.toISOString(), severityFraction: 0.4 },
    ]);
    const answeredAt = new Date(now.getTime() + 1000);
    useFollowUpStore.setState({ answer: 'no', answeredAt: answeredAt.toISOString() });

    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.answeredThisCycle).toBe(true);
    expect(result.current.answer).toBe('no');
  });

  it('reports answeredThisCycle false when the recorded answer predates a newer assessment', async () => {
    const now = new Date();
    const staleAnswer = new Date(now);
    staleAnswer.setUTCDate(staleAnswer.getUTCDate() - 30);
    const newerAssessment = new Date(now);
    newerAssessment.setUTCDate(newerAssessment.getUTCDate() - 10);

    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: newerAssessment.toISOString(), severityFraction: 0.2 },
    ]);
    useFollowUpStore.setState({ answer: 'no', answeredAt: staleAnswer.toISOString() });

    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.answeredThisCycle).toBe(false);
    expect(result.current.shouldShowPrompt).toBe(true);
  });

  it(`reports shouldShowPrompt false when fewer than ${FOLLOWUP_INTERVAL_DAYS} days have passed`, async () => {
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - (FOLLOWUP_INTERVAL_DAYS - 1));
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: recent.toISOString(), severityFraction: 0.4 },
    ]);

    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.shouldShowPrompt).toBe(false);
    expect(result.current.answeredThisCycle).toBe(false);
  });

  it('shows the acknowledgment right after answering', async () => {
    const now = new Date();
    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: now.toISOString(), severityFraction: 0.4 },
    ]);
    const answeredAt = new Date(now.getTime() + 1000);
    useFollowUpStore.setState({ answer: 'no', answeredAt: answeredAt.toISOString() });

    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.showAcknowledgment).toBe(true);
  });

  it(`stops showing the acknowledgment once ${ACKNOWLEDGMENT_WINDOW_HOURS}h have passed, even though the cycle is still answered`, async () => {
    const now = new Date();
    const answeredAt = new Date(now);
    answeredAt.setHours(answeredAt.getHours() - (ACKNOWLEDGMENT_WINDOW_HOURS + 1));

    vi.spyOn(container.getAssessmentHistoryUseCase, 'execute').mockResolvedValue([
      { weekStart: answeredAt.toISOString(), severityFraction: 0.4 },
    ]);
    useFollowUpStore.setState({ answer: 'no', answeredAt: answeredAt.toISOString() });

    const { result } = renderHook(() => useFollowUpAnswer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // "Obrigado por dizer" days later reads as stale, not caring — but the
    // question still must not re-appear until a brand new assessment cycle.
    expect(result.current.showAcknowledgment).toBe(false);
    expect(result.current.answeredThisCycle).toBe(true);
    expect(result.current.shouldShowPrompt).toBe(false);
  });
});
