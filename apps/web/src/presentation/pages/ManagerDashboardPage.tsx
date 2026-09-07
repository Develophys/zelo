import { Link, useSearchParams } from "react-router";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { Skeleton } from "@/presentation/ui/Skeleton";
import { CardTitle } from "@/presentation/ui/CardTitle";
import { SectorMultiSelect } from "@/presentation/ui/SectorMultiSelect";
import { SectorPillPicker, SECTOR_PILL_CLASS } from "@/presentation/ui/SectorPillPicker";
import { routes } from "@/presentation/lib/routes";
import { useManagerSignals } from "@/presentation/hooks/useManagerSignals";
import { useManagerSectors } from "@/presentation/hooks/useManagerSectors";
import { useManagerInsight } from "@/presentation/hooks/useManagerInsight";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadPgrReportAsCsv, downloadPgrReportAsPdf } from "@/presentation/lib/download-manager-pgr-report";
import { MANAGER_INSIGHT_DISCLAIMER } from "@/presentation/lib/manager-insight-disclaimer";
import { ArrowRight } from "lucide-react";
import {
  peakSegmentLabel,
  peakTrendIndex,
  describeSegment,
  describeTrendWeek,
  toTrendBarHeights,
  toTrendBars,
  weekLabel,
} from "@/presentation/lib/manager-trend-chart";

const TREND_SKELETON_BAR_COUNT = 6;
const SEGMENTS_SKELETON_ROW_COUNT = 3;

const SECTOR_PARAM = "sectorIds";

/**
 * Reads the sector filter out of the URL.
 *
 * `undefined` means "no filter" — the request goes out without the parameter at
 * all, and the API answers with every sector the manager can see. An explicit
 * list of every id would be the same set but is *not* the same request: it
 * pins the query to ids the server would otherwise have chosen itself.
 *
 * A selection of nothing is never one of the states. It can only draw an empty
 * screen, so every way of reaching it resolves to "no filter" instead.
 */
function parseSectorParam(raw: string | null, sectors: { id: string }[] | undefined): string[] | undefined {
  if (raw === null) return undefined;

  const requested = raw.split(",").filter((id) => id.length > 0);
  if (requested.length === 0) return undefined;
  // Validation waits for the sector list; until it lands the URL is taken at
  // face value, so a shared link fetches its own data on the first try rather
  // than fetching everything and correcting itself.
  if (!sectors) return requested;

  const valid = requested.filter((id) => sectors.some((sector) => sector.id === id));
  // A link naming only sectors that were deleted, or that belong to another
  // institution, is meaningless. Showing the whole panel beats an empty
  // dashboard that reads as "your institution has no data".
  if (valid.length === 0) return undefined;
  if (valid.length === sectors.length) return undefined;
  return valid;
}

const DASHBOARD_DISCLOSURE =
  "Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.";

const TREND_EMPTY =
  "Sem dados nas últimas 6 semanas. O gráfico aparece assim que houver check-ins.";

// An empty segment list usually means k-anonymity suppressed every one of them,
// not that nothing happened. Saying so is the difference between a dashboard
// that looks broken and one that is visibly working as designed.
const SEGMENTS_EMPTY =
  "Nenhum setor com 5 respostas ou mais ainda. Setores abaixo desse limite ficam ocultos.";

const INSIGHT_EMPTY_EXPLANATION =
  "Interpreta os indicadores agregados e anônimos desta página e sugere ações para a liderança, sem acesso a dados individuais de nenhum profissional.";

function KpiCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={["h-full text-center", className].join(" ")} data-testid="kpi-card">
      <Skeleton className="mx-auto h-7.5 w-16 rounded-md" />
      <Skeleton className="mx-auto mt-2 h-3 w-32 rounded-md" />
    </Card>
  );
}

function TrendCardSkeleton() {
  return (
    <Card className="flex h-full flex-col">
      <Skeleton className="h-4 w-32 rounded-md" />
      <div className="mt-auto flex h-14 items-end gap-2">
        {Array.from({ length: TREND_SKELETON_BAR_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-full w-full rounded-md" />
        ))}
      </div>
    </Card>
  );
}

function SegmentsCardSkeleton() {
  return (
    <Card className="h-full">
      <Skeleton className="h-4 w-28 rounded-md" />
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: SEGMENTS_SKELETON_ROW_COUNT }, (_, index) => (
          <div key={index}>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded-md" />
              <Skeleton className="h-3 w-14 rounded-md" />
            </div>
            <Skeleton className="mt-1 h-2 w-full rounded-pill" />
          </div>
        ))}
      </div>
    </Card>
  );
}

interface SectorFilterProps {
  sectors: { id: string; name: string }[];
  selectedSectorIds: string[] | undefined;
  onChange: (selected: string[]) => void;
}

function SectorFilter({ sectors, selectedSectorIds, onChange }: SectorFilterProps) {
  const effectiveSelected = selectedSectorIds ?? sectors.map((sector) => sector.id);
  const allSelected = effectiveSelected.length === sectors.length;

  const toggleSector = (id: string) => {
    // From "Todos", every id is already in effectiveSelected, so the toggle
    // below would read a first click as "remove this one, keep the rest" —
    // the opposite of what clicking a single pill means. The resting state
    // has nothing explicitly chosen, so the first click sets the choice
    // instead of subtracting from an implicit full set.
    if (allSelected) {
      onChange([id]);
      return;
    }
    const next = effectiveSelected.includes(id)
      ? effectiveSelected.filter((sectorId) => sectorId !== id)
      : [...effectiveSelected, id];
    // Switching off the last one would filter every sector away and leave the
    // panel blank, so it clears the filter instead.
    onChange(next.length === 0 ? sectors.map((sector) => sector.id) : next);
  };

  const todosButton = (
    <button
      type="button"
      aria-pressed={allSelected}
      onClick={() => onChange(sectors.map((sector) => sector.id))}
      className={SECTOR_PILL_CLASS(allSelected)}
    >
      Todos
    </button>
  );

  return (
    <div>
      <div data-testid="sector-filter-pills" className="hidden md:flex">
        <SectorPillPicker
          sectors={sectors}
          selectedIds={allSelected ? [] : effectiveSelected}
          onToggle={toggleSector}
          emptyHref={routes.managerAdminSectors}
          emptyLabel="Cadastrar um setor"
          leading={todosButton}
        />
      </div>
      <div data-testid="sector-filter-dropdown" className="md:hidden">
        <SectorMultiSelect sectors={sectors} selected={selectedSectorIds} onChange={onChange} />
      </div>
    </div>
  );
}

export function ManagerDashboardPage() {
  const sectorsQuery = useManagerSectors();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectors = sectorsQuery.data;
  const selectedSectorIds = parseSectorParam(searchParams.get(SECTOR_PARAM), sectors);
  const { data, error, isError, isLoading, refetch } = useManagerSignals(selectedSectorIds);

  // The URL is the filter's only state, so a reload, the back button and a
  // link pasted into a message all land on the same view.
  const handleSectorChange = (next: string[]) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (sectors && next.length === sectors.length) params.delete(SECTOR_PARAM);
        else params.set(SECTOR_PARAM, next.join(","));
        return params;
      },
      // Toggling pills would otherwise stack one history entry per click,
      // turning the back button into a rewind of the manager's own filtering.
      { replace: true },
    );
  };
  const insight = useManagerInsight();

  // A non-401 failure used to fall through these `?? 0` defaults, so a
  // coordinator read 0% and 0 questionários as if they had been measured. The
  // screen refuses to render numbers it does not have.
  const loadFailed = isError && !(error instanceof UnauthorizedManagerError);

  const weeklyTrend = data?.weeklyTrend ?? [];
  const bars = toTrendBars(weeklyTrend);
  const trendBarProportions = toTrendBarHeights(weeklyTrend);
  const segments = data?.segments ?? [];
  const peakWeek = peakTrendIndex(weeklyTrend);
  const peakSector = peakSegmentLabel(segments);
  const overallConcerningRate = data?.overallConcerningRate ?? 0;
  const checkInsLast4Weeks = data?.checkInsLast4Weeks ?? 0;
  const followUpResponseRate = data?.followUpResponseRate ?? 0;

  return (
    <div>
      {sectorsQuery.data && sectorsQuery.data.length > 1 && (
        <div data-testid="dashboard-filter-row" className="flex flex-wrap items-center gap-2">
          <SectorFilter sectors={sectorsQuery.data} selectedSectorIds={selectedSectorIds} onChange={handleSectorChange} />
        </div>
      )}

      <p className="mt-3 max-w-[62ch] text-label text-muted">{DASHBOARD_DISCLOSURE}</p>

      {loadFailed && (
        <div className="mt-5 rounded-card border border-danger-border bg-danger-bg p-4.5">
          <p role="alert" className="text-body font-extrabold text-danger">
            Não foi possível carregar os indicadores.
          </p>
          <p className="mt-1 text-pretty text-caption text-danger-ink">
            Nada aqui foi medido — estes números não existem até a próxima tentativa.
          </p>
          <div className="mt-4">
            <Button variant="outline" full={false} onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Numbers are withheld entirely on a failed load rather than
          defaulting to zero, which reads as a measurement. */}
      {!loadFailed && (
        <>
        <div data-testid="kpi-grid" className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </>
          ) : (
            <>
              <Card className="h-full text-center" data-testid="kpi-card">
                {/* Deliberately not tone-coded. What counts as a concerning rate is
                    an open product question (PRODUCT.md), and an unconditional
                    amber reads as a warning even at 0%. */}
                <p className="font-serif text-stat text-ink">{Math.round(overallConcerningRate * 100)}%</p>
                <p className="text-caption text-muted">sinais de burnout na equipe</p>
              </Card>
              <Card className="h-full text-center" data-testid="kpi-card">
                <p className="font-serif text-stat text-brand">{checkInsLast4Weeks}</p>
                <p className="text-caption text-muted">questionários respondidos (4 semanas)</p>
              </Card>
              <Card className="h-full text-center" data-testid="kpi-card">
                <p className="font-serif text-stat text-brand">{Math.round(followUpResponseRate * 100)}%</p>
                <p className="text-caption text-muted">taxa de resposta do follow-up</p>
              </Card>
            </>
          )}
        </div>

        <div data-testid="trend-segments-grid" className="mt-3.5 grid gap-3.5 lg:grid-cols-[2fr_1fr]">
          <div>
            {isLoading ? (
              <TrendCardSkeleton />
            ) : (
              <Card className="flex h-full flex-col" data-testid="manager-card">
                <div className="flex items-center justify-between">
                  <CardTitle>Tendência geral</CardTitle>
                  <p className="font-mono text-mono-data text-muted-2">últimas 6 semanas</p>
                </div>
                <ul data-testid="trend-description" className="sr-only">
                  {weeklyTrend.map((point, index) => (
                    <li key={index}>{describeTrendWeek(point, index, weeklyTrend.length - 1)}</li>
                  ))}
                </ul>
                {weeklyTrend.length === 0 ? (
                  <div className="mt-auto flex h-14 items-end gap-2" aria-hidden="true">
                    {Array.from({ length: TREND_SKELETON_BAR_COUNT }, (_, index) => (
                      <div key={index} className="h-1 w-full rounded-md bg-line" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="hidden gap-2 md:flex" aria-hidden="true">
                      {weeklyTrend.map((point, index) => (
                        <span
                          key={index}
                          data-testid="trend-bar-value"
                          className="w-full text-center font-mono text-mono-data text-muted-2"
                        >
                          {Math.round(point.concerningRate * 100)}%
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto hidden h-14 items-end gap-2 md:flex" aria-hidden="true">
                      {bars.map((bar, index) => (
                        <div
                          key={index}
                          data-testid="trend-bar"
                          className={`w-full rounded-md ${
                            bar.isZero
                              ? "bg-control-edge"
                              : index === peakWeek
                                ? "bg-warn"
                                : index === weeklyTrend.length - 1
                                  ? "bg-brand"
                                  : "bg-control-edge"
                          }`}
                          style={{ height: `${trendBarProportions[index]}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 hidden gap-2 md:flex" aria-hidden="true">
                      {weeklyTrend.map((point, index) => (
                        <span
                          key={index}
                          className="w-full truncate text-center font-mono text-mono-data text-muted-2"
                        >
                          {weekLabel(point.weekStart)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-col gap-2 md:hidden" aria-hidden="true">
                      {weeklyTrend.map((point, index) => {
                        const bar = bars[index]!;
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <span className="w-19 shrink-0 whitespace-nowrap font-mono text-mono-data text-muted-2">
                              {weekLabel(point.weekStart)}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-canvas-alt">
                              <div
                                data-testid="trend-bar-mobile"
                                className={`h-full rounded-pill ${
                                  bar.isZero
                                    ? "bg-control-edge"
                                    : index === peakWeek
                                      ? "bg-warn"
                                      : index === weeklyTrend.length - 1
                                        ? "bg-brand"
                                        : "bg-control-edge"
                                }`}
                                style={{ width: `${trendBarProportions[index]}%` }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right font-mono text-mono-data text-muted-2">
                              {Math.round(point.concerningRate * 100)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Without this the colours are a guess. Same legend the
                        médico's own chart already carries. Each entry only
                        shows when a bar actually uses that colour — peak and
                        latest coincide on a rising series, and this bar
                        renders bg-warn, not bg-brand, when they do. */}
                    <div className="mt-2 flex gap-3" aria-hidden="true">
                      {peakWeek !== -1 && (
                        <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                          <span className="h-2 w-2 rounded-full bg-warn" />
                          Pico
                        </span>
                      )}
                      {weeklyTrend.length > 0 &&
                        !bars[weeklyTrend.length - 1]!.isZero &&
                        peakWeek !== weeklyTrend.length - 1 && (
                          <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                            <span className="h-2 w-2 rounded-full bg-brand" />
                            Mais recente
                          </span>
                        )}
                    </div>
                  </>
                )}
                {weeklyTrend.length === 0 && (
                  <p data-testid="trend-empty" className="mt-3 text-pretty text-label text-muted">
                    {TREND_EMPTY}
                  </p>
                )}
              </Card>
            )}
          </div>
          <div>
            {isLoading ? (
              <SegmentsCardSkeleton />
            ) : (
              <Card className="h-full" data-testid="manager-card">
                <CardTitle>Sinais por setor</CardTitle>
                <ul data-testid="segments-description" className="sr-only">
                  {segments.map((segment) => (
                    <li key={segment.label}>{describeSegment(segment)}</li>
                  ))}
                </ul>
                {segments.length === 0 && (
                  <p data-testid="segments-empty" className="mt-3 text-pretty text-label text-muted">
                    {SEGMENTS_EMPTY}
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-3" aria-hidden="true">
                  {segments.map((segment) => (
                    <div key={segment.label}>
                      <div className="flex items-center justify-between gap-2 text-label text-ink-2">
                        <span className="min-w-0 truncate">{segment.label}</span>
                        <span className="shrink-0 font-mono text-mono-data text-muted-2">
                          {segment.value}% · {segment.n} {segment.n === 1 ? "resposta" : "respostas"}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas-alt">
                        <div
                          className={`h-full rounded-pill ${
                            segment.label === peakSector ? "bg-warn" : "bg-control-edge"
                          }`}
                          style={{ width: `${segment.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
        </>
      )}

      <hr data-testid="insight-pgr-divider" className="mt-3 border-t border-line" />

      <div data-testid="insight-pgr-grid" className="mt-3 grid gap-4 lg:grid-cols-[3fr_7fr]">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Análise com IA</CardTitle>
            <Link
              to={routes.managerHistory}
              className="flex min-h-11 items-center gap-0.5 rounded-control text-label font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Ver histórico
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {!insight.data && (
            <div className="mt-3">
              <p className="text-label text-muted">{INSIGHT_EMPTY_EXPLANATION}</p>
              <Button className="mt-3" variant="outline" size="sm" full={false} isLoading={insight.isPending} onClick={() => insight.mutate()}>
                Gerar análise
              </Button>
              {insight.isError && (
                <p role="alert" className="mt-2 text-label text-danger">
                  Não foi possível gerar a análise agora. Tente novamente.
                </p>
              )}
            </div>
          )}
          {insight.data && (
            <div className="mt-3">
              <p className="text-label text-ink-2">{insight.data.interpretation}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {insight.data.suggestedActions.map((action, index) => (
                  <li key={index} className="flex items-start gap-2 text-label text-ink-2">
                    <span className="text-brand">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
              {/* Same string the exports carry, so what a manager reads here and
                  what lands in a meeting deck cannot say different things. */}
              <p
                data-testid="insight-disclaimer"
                className="mt-4 border-t border-line pt-3 text-pretty text-caption text-muted"
              >
                {MANAGER_INSIGHT_DISCLAIMER}
              </p>
            </div>
          )}
        </Card>

        {data && (
          <Card>
            <SectionLabel>Conformidade NR-1</SectionLabel>
            <CardTitle>Insumo para o PGR</CardTitle>
            <p className="mt-2 text-label text-ink-2">
              Estes sinais mapeiam fatores de risco psicossocial reconhecidos pela NR-1 — sobrecarga,
              jornada, esgotamento por setor. Isto é um insumo para a gestão de risco psicossocial do
              empregador, <strong>não uma certificação de conformidade com a NR-1</strong>.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                full={false}
                disabled={segments.length === 0}
                onClick={() => downloadPgrReportAsCsv(data)}
              >
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                full={false}
                disabled={segments.length === 0}
                onClick={() => downloadPgrReportAsPdf(data)}
              >
                Exportar PDF
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
