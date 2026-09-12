import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { Skeleton } from '@/presentation/ui/Skeleton';
import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { bandForSeverityFraction, type ScoreBandTone } from '@/presentation/lib/band-for';
import type { WeeklyHistoryPoint } from '@/use-cases/get-assessment-history.usecase';
import {
  describeHistoryWeek,
  findPeakIndex,
  toBarHeights,
} from '@/presentation/lib/weekly-history-chart';

// bg-brand only for minimal/mild good news; moderate/high/severe use the same fixed clinical band tokens as the result screen.
const BAND_BAR_CLASS: Record<ScoreBandTone, string> = {
  minimal: 'bg-brand',
  mild: 'bg-brand',
  moderate: 'bg-band-moderate',
  high: 'bg-band-high',
  severe: 'bg-band-severe',
};

function ChartHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
      <p className="text-body font-extrabold text-ink">Seu histórico</p>
      <p className="font-mono text-mono-data text-muted-2">últimas 6 semanas</p>
    </div>
  );
}

export function HistoryChartCard() {
  // A failed fetch and a history with no readings are different things, and the
  // empty chart is the honest drawing of only the second one.
  const { data: history, isLoading, isError, refetch } = useAssessmentHistory();
  const points = history ?? EMPTY_POINTS;
  const bars = toBarHeights(points);
  const latestIndex = points.length - 1;
  const peakIndex = findPeakIndex(points);

  // Peak wins the color, even if it's also the most recent bar.
  const barColorClass = (index: number, point: WeeklyHistoryPoint): string => {
    if (point.severityFraction === null) return 'bg-line';
    if (index === peakIndex) return 'bg-warn';
    return BAND_BAR_CLASS[bandForSeverityFraction(point.severityFraction).tone];
  };

  return (
    <div className="mt-3.5 short:mt-2">
      <Card>
        <ChartHeader />

        {isLoading && (
          <div className="mt-3 flex h-14 items-end gap-2">
            {EMPTY_POINTS.map((_, index) => (
              <Skeleton key={index} className="h-full w-full rounded-md" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="mt-3">
            <p role="alert" className="text-caption text-muted">
              Não foi possível carregar seu histórico. Seus check-ins continuam salvos.
            </p>
            <div className="mt-3">
              <Button variant="outline" size="sm" full={false} onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <ul className="sr-only">
              {points.map((point, index) => (
                <li key={index}>{describeHistoryWeek(point, index, latestIndex, peakIndex)}</li>
              ))}
            </ul>
            {/* Without this, "higher = more symptoms" is left to inference. */}
            <p className="mt-1 text-caption text-muted">
              % da escala de sintomas na semana — quanto maior, mais intenso.
            </p>
            <div className="mt-3 flex gap-2" aria-hidden="true">
              {points.map((point, index) => (
                <span
                  key={index}
                  data-testid="history-bar-value"
                  className="w-full text-center font-mono text-mono-data text-muted-2"
                >
                  {point.severityFraction === null ? '' : `${Math.round(point.severityFraction * 100)}%`}
                </span>
              ))}
            </div>
            <div className="mt-1 flex h-14 items-end gap-2" aria-hidden="true">
              {bars.map((bar, index) => (
                <div
                  key={index}
                  data-testid="history-bar"
                  className={`w-full rounded-md ${barColorClass(index, points[index]!)}`}
                  style={{ height: `${bar.height}%` }}
                />
              ))}
            </div>
            {peakIndex === -1 ? (
              <p className="mt-2 text-caption text-muted">
                Faça seu primeiro check-in para ver sua tendência aqui.
              </p>
            ) : (
              <div className="mt-2 flex gap-3" aria-hidden="true">
                <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                  <span className="h-2 w-2 rounded-full bg-warn" />
                  Pico
                </span>
                {bars[latestIndex]!.hasData && peakIndex !== latestIndex && (
                  <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                    <span
                      className={`h-2 w-2 rounded-full ${barColorClass(latestIndex, points[latestIndex]!)}`}
                    />
                    Mais recente
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
