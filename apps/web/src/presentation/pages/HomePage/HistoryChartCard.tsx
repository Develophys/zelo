import { Card } from '@/presentation/ui/Card';
import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import {
  describeHistoryWeek,
  findPeakIndex,
  toBarHeights,
} from '@/presentation/lib/weekly-history-chart';

export function HistoryChartCard() {
  const { data: history } = useAssessmentHistory();
  const points = history ?? EMPTY_POINTS;
  const bars = toBarHeights(points);
  const latestIndex = points.length - 1;
  const peakIndex = findPeakIndex(points);

  return (
    <div className="mt-3.5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <p className="text-body font-extrabold text-ink">Seu histórico</p>
          <p className="font-mono text-mono-data text-muted-2">últimas 6 semanas</p>
        </div>
        <ul className="sr-only">
          {points.map((point, index) => (
            <li key={index}>{describeHistoryWeek(point, index, latestIndex, peakIndex)}</li>
          ))}
        </ul>
        <div className="mt-3 flex h-14 items-end gap-2" aria-hidden="true">
          {bars.map((bar, index) => (
            <div
              key={index}
              data-testid="history-bar"
              className={`w-full rounded-md ${
                !bar.hasData
                  ? 'bg-line'
                  : index === latestIndex
                    ? 'bg-brand'
                    : index === peakIndex
                      ? 'bg-warn'
                      : 'bg-track'
              }`}
              style={{ height: `${bar.height}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-3" aria-hidden="true">
          <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
            <span className="h-2 w-2 rounded-full bg-brand" />
            Mais recente
          </span>
          <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
            <span className="h-2 w-2 rounded-full bg-warn" />
            Pico
          </span>
        </div>
      </Card>
    </div>
  );
}
