import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  MANAGER_METRICS,
  checkInsReading,
  concerningRateReading,
  followUpBandFor,
  followUpReading,
  sectorCoverageReading,
  type MetricDefinition,
} from "@zelo/domain";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { Skeleton } from "@/presentation/ui/Skeleton";
import { CardTitle } from "@/presentation/ui/CardTitle";
import { MultiSelectDropdown } from "@/presentation/ui/MultiSelectDropdown";
import { SectorPillPicker, SECTOR_PILL_CLASS } from "@/presentation/ui/SectorPillPicker";
import { MetricHelp } from "@/presentation/ui/MetricHelp";
import { Pill } from "@/presentation/ui/Pill";
import { Tooltip } from "@/presentation/ui/Tooltip";
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
  trendWeekDetail,
  toTrendBarHeights,
  toTrendBars,
  weekLabel,
  type TrendWeekDetail,
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

const DASHBOARD_DISCLOSURE = "Nenhum dado individual é exibido.";

const TREND_EMPTY =
  "Sem dados nas últimas 6 semanas. O gráfico aparece assim que houver check-ins.";

// An empty segment list usually means k-anonymity suppressed every one of them,
// not that nothing happened. Saying so is the difference between a dashboard
// that looks broken and one that is visibly working as designed.
const SEGMENTS_EMPTY =
  "Nenhum setor com 5 respostas ou mais ainda. Setores abaixo desse limite ficam ocultos.";

// checkInsLast4Weeks === 0 covers both a genuinely empty institution and a
// sector filter narrow enough that k-anonymity hid everything — either way,
// 0% burnout signals reads as a real all-clear, and the hospital-wide
// follow-up rate (uncomputed per sector) beside "0 questionários
// respondidos" contradicts itself. Withheld like the load-failure branch,
// not printed as if it were a measurement.
const KPI_EMPTY = "Sem dados suficientes para os indicadores desta seleção.";

const INSIGHT_EMPTY_EXPLANATION =
  "Interpreta os indicadores agregados e anônimos desta página e sugere ações para a liderança, sem acesso a dados individuais de nenhum profissional.";

const PEAK_LEGEND_HELP =
  "A semana com a maior proporção de sinais dentro deste período. É uma comparação relativa à própria série e não é um limite de alerta: a barra fica marcada mesmo que o valor seja baixo, porque indica o ponto mais alto do período, não que ele seja preocupante.";

const LATEST_LEGEND_HELP =
  "A última semana com dados. Aparece separada porque é a que reflete a situação atual; quando ela também é o pico, prevalece a marcação de pico.";

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
        <MultiSelectDropdown
          options={sectors}
          selected={selectedSectorIds}
          onChange={onChange}
          allLabel="Todos os setores"
          countLabel={(count) => `${count} setores selecionados`}
          groupLabel="Setores"
        />
      </div>
    </div>
  );
}

function metricHelpContent(metric: MetricDefinition, extra?: string) {
  return (
    <span className="flex flex-col gap-1.5">
      <span>{metric.method}</span>
      <span>{metric.window}</span>
      <span>{metric.suppression}</span>
      {extra && <span>{extra}</span>}
    </span>
  );
}

interface KpiCardProps {
  metric: MetricDefinition;
  value: string;
  valueClass: string;
  reading: string;
  /** Acrescentado ao fim do tooltip — o significado da faixa, quando há uma. */
  extraHelp?: string;
  badge?: ReactNode;
}

function KpiCard({ metric, value, valueClass, reading, extraHelp, badge }: KpiCardProps) {
  return (
    <Card className="flex h-full flex-col text-center" data-testid="kpi-card">
      <p className={`font-serif text-stat ${valueClass}`}>{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-caption text-muted">
        <span>{metric.label}</span>
        <MetricHelp label={metric.label} content={metricHelpContent(metric, extraHelp)} />
      </p>
      <p className="mt-1.5 text-pretty text-label text-muted-2">{reading}</p>
      {badge && <div className="mt-2">{badge}</div>}
    </Card>
  );
}

function TrendWeekBubble({ detail }: { detail: TrendWeekDetail }) {
  const move =
    detail.deltaPoints === null
      ? "Primeira semana da série"
      : detail.deltaPoints === 0
        ? "Sem variação vs. a semana anterior"
        : `${detail.deltaPoints > 0 ? "+" : "−"}${Math.abs(detail.deltaPoints)} pontos vs. a semana anterior`;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold">Semana de {detail.weekLabel}</span>
      <span>
        {detail.percent}% — {detail.concerning} de {detail.checkIns}{" "}
        {detail.checkIns === 1 ? "resposta" : "respostas"}
      </span>
      <span>{move}</span>
    </span>
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
  const sectorCoverage = data?.sectorCoverage ?? { visible: 0, total: 0 };
  const concerningPercent = Math.round(overallConcerningRate * 100);
  const followUpPercent = Math.round(followUpResponseRate * 100);
  // A faixa lê o mesmo inteiro que o card imprime: classificar a fração crua
  // faria 0,804 e 0,7996 exibirem ambos "80%" em faixas diferentes.
  const followUpBand = followUpBandFor(followUpPercent);
  // O KPI principal é da semana de referência, que a API nomeia — não uma
  // média da série e não necessariamente a última entrada: uma semana em curso
  // entra na tendência sem ter atingido o mínimo por conta própria, e lê-la
  // aqui pareava a porcentagem de uma semana com o denominador e a data de
  // outra.
  const referenceWeek =
    weeklyTrend.find((point) => point.weekStart === data?.referenceWeekStart) ??
    weeklyTrend[weeklyTrend.length - 1];
  const referenceWeekResponses = referenceWeek?.checkIns ?? 0;
  const referenceWeekLabel = referenceWeek ? weekLabel(referenceWeek.weekStart) : "—";
  // A API não recorta janela nenhuma: a tendência traz quantas semanas houver.
  const trendWindowLabel =
    weeklyTrend.length === 1 ? "última semana" : `últimas ${weeklyTrend.length} semanas`;

  return (
    <div>
      {sectorsQuery.data && sectorsQuery.data.length > 1 && (
        <div data-testid="dashboard-filter-row" className="flex flex-wrap items-center gap-2">
          <SectorFilter sectors={sectorsQuery.data} selectedSectorIds={selectedSectorIds} onChange={handleSectorChange} />
        </div>
      )}

      <div className="mt-3 flex max-w-[62ch] flex-wrap items-center gap-x-1.5 gap-y-1">
        <p className="text-label text-muted">{DASHBOARD_DISCLOSURE}</p>
        {data && (
          <p className="flex items-center gap-1 text-label text-ink-2" data-testid="sector-coverage">
            <span>{sectorCoverageReading(sectorCoverage)}</span>
            <MetricHelp
              label={MANAGER_METRICS.sectorCoverage.label}
              content={metricHelpContent(MANAGER_METRICS.sectorCoverage)}
            />
          </p>
        )}
      </div>

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
          ) : checkInsLast4Weeks === 0 ? (
            <Card className="h-full text-center md:col-span-2 lg:col-span-3" data-testid="kpi-empty">
              <p className="text-pretty text-label text-muted">{KPI_EMPTY}</p>
            </Card>
          ) : (
            <>
              {/* Deliberadamente sem tom. O que conta como taxa preocupante é
                  questão de produto em aberto, e um âmbar incondicional lê
                  como alerta até a 0%. O follow-up abaixo ganha tom porque
                  "qual taxa de resposta é boa" é metodologia de survey, não
                  questão clínica em aberto. */}
              <KpiCard
                metric={MANAGER_METRICS.concerningRate}
                value={`${concerningPercent}%`}
                valueClass="text-ink"
                reading={concerningRateReading({
                  percent: concerningPercent,
                  responses: referenceWeekResponses,
                  weekLabel: referenceWeekLabel,
                })}
              />
              <KpiCard
                metric={MANAGER_METRICS.checkIns}
                value={String(checkInsLast4Weeks)}
                valueClass="text-brand"
                reading={checkInsReading({
                  total: checkInsLast4Weeks,
                  visibleSectors: sectorCoverage.visible,
                })}
              />
              <KpiCard
                metric={MANAGER_METRICS.followUpRate}
                value={`${followUpPercent}%`}
                valueClass="text-muted"
                reading={followUpReading()}
                extraHelp={followUpBand.meaning}
                badge={
                  <span className="flex items-center justify-center gap-2">
                    <Pill tone="neutral">demonstração</Pill>
                    <Pill tone={followUpBand.tone === "poor" ? "warning" : "neutral"}>
                      {followUpBand.label}
                    </Pill>
                  </span>
                }
              />
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
                  {weeklyTrend.length > 0 && (
                    <p className="font-mono text-mono-data text-muted-2">{trendWindowLabel}</p>
                  )}
                </div>
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
                    <div className="mt-auto hidden h-14 items-end gap-2 md:flex">
                      {bars.map((bar, index) => {
                        const detail = trendWeekDetail(weeklyTrend, index, peakWeek);
                        return (
                          <Tooltip
                            key={index}
                            align="start"
                            content={<TrendWeekBubble detail={detail} />}
                            redundantWithName
                            wrapperClassName="flex h-full w-full items-end"
                          >
                            <button
                              type="button"
                              data-testid="trend-bar"
                              aria-label={describeTrendWeek(detail)}
                              className={`w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
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
                          </Tooltip>
                        );
                      })}
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
                    <div className="mt-auto flex flex-col gap-2 md:hidden">
                      {weeklyTrend.map((point, index) => {
                        const bar = bars[index]!;
                        const detail = trendWeekDetail(weeklyTrend, index, peakWeek);
                        return (
                          <Tooltip
                            key={index}
                            align="start"
                            content={<TrendWeekBubble detail={detail} />}
                            redundantWithName
                          >
                            <button
                              type="button"
                              aria-label={describeTrendWeek(detail)}
                              className="flex w-full items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <span aria-hidden="true" className="w-19 shrink-0 whitespace-nowrap font-mono text-mono-data text-muted-2">
                                {weekLabel(point.weekStart)}
                              </span>
                              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-pill bg-canvas-alt">
                                <span
                                  data-testid="trend-bar-mobile"
                                  className={`block h-full rounded-pill ${
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
                              </span>
                              <span aria-hidden="true" className="w-9 shrink-0 text-right font-mono text-mono-data text-muted-2">
                                {Math.round(point.concerningRate * 100)}%
                              </span>
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                    {/* Without this the colours are a guess. Same legend the
                        médico's own chart already carries. Each entry only
                        shows when a bar actually uses that colour — peak and
                        latest coincide on a rising series, and this bar
                        renders bg-warn, not bg-brand, when they do. */}
                    <div className="mt-2 flex gap-3">
                      {peakWeek !== -1 && (
                        <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warn" />
                          Pico
                          <MetricHelp label="Pico" content={PEAK_LEGEND_HELP} />
                        </span>
                      )}
                      {weeklyTrend.length > 0 &&
                        !bars[weeklyTrend.length - 1]!.isZero &&
                        peakWeek !== weeklyTrend.length - 1 && (
                          <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
                            Mais recente
                            <MetricHelp label="Mais recente" content={LATEST_LEGEND_HELP} />
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

      <p className="mt-4 mb-6 text-label text-muted">
        <Link
          to={routes.managerMethodology}
          className="flex w-fit items-center gap-0.5 rounded-control font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Como calculamos estes números
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
