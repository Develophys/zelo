import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
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
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadPgrReportAsCsv, downloadPgrReportAsPdf } from "@/presentation/lib/download-manager-pgr-report";
import { ArrowRight } from "lucide-react";

const MIN_TREND_BAR_HEIGHT = 8;
const TREND_SKELETON_BAR_COUNT = 6;
const SEGMENTS_SKELETON_ROW_COUNT = 3;

const DASHBOARD_INTRO =
  "Indicadores agregados e anônimos do seu hospital. Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.";

function toTrendBarHeights(trend: { concerningRate: number }[]): number[] {
  return trend.map((point) => Math.max(MIN_TREND_BAR_HEIGHT, Math.round(point.concerningRate * 100)));
}

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
    <Card>
      <Skeleton className="h-4 w-32 rounded-md" />
      <div className="mt-3 flex h-14 items-end gap-2">
        {Array.from({ length: TREND_SKELETON_BAR_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-full w-full rounded-md" />
        ))}
      </div>
    </Card>
  );
}

function SegmentsCardSkeleton() {
  return (
    <Card>
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
    const next = effectiveSelected.includes(id)
      ? effectiveSelected.filter((sectorId) => sectorId !== id)
      : [...effectiveSelected, id];
    onChange(next);
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
    <div className="mt-3">
      <div data-testid="sector-filter-pills" className="hidden md:flex">
        <SectorPillPicker
          sectors={sectors}
          selectedIds={effectiveSelected}
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
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const sectorsQuery = useManagerSectors();
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[] | undefined>(undefined);
  const { data, error, isError, isLoading } = useManagerSignals(selectedSectorIds);
  const insight = useManagerInsight();

  useEffect(() => {
    if (isError && error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [isError, error, clearSession, navigate]);

  const trend = data?.weeklyTrend ?? [];
  const bars = toTrendBarHeights(trend);
  const segments = data?.segments ?? [];
  const overallConcerningRate = data?.overallConcerningRate ?? 0;
  const checkInsLast4Weeks = data?.checkInsLast4Weeks ?? 0;
  const followUpResponseRate = data?.followUpResponseRate ?? 0;

  return (
    <div className="pt-6">
      <ManagerPageHeader title="Tendências" intro={DASHBOARD_INTRO} actions={<PrivacyBadge />} />

      {sectorsQuery.data && sectorsQuery.data.length > 1 && (
        <SectorFilter sectors={sectorsQuery.data} selectedSectorIds={selectedSectorIds} onChange={setSelectedSectorIds} />
      )}

      <div data-testid="kpi-grid" className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <Card className="h-full text-center" data-testid="kpi-card">
              <p className="font-serif text-[30px] text-warn">{Math.round(overallConcerningRate * 100)}%</p>
              <p className="text-caption text-muted">sinais de burnout na equipe</p>
            </Card>
            <Card className="h-full text-center" data-testid="kpi-card">
              <p className="font-serif text-[30px] text-brand">{checkInsLast4Weeks}</p>
              <p className="text-caption text-muted">questionários respondidos (4 semanas)</p>
            </Card>
            <Card className="h-full text-center" data-testid="kpi-card">
              <p className="font-serif text-[30px] text-brand">{Math.round(followUpResponseRate * 100)}%</p>
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
            <Card>
              <div className="flex items-center justify-between">
                <CardTitle>Tendência geral</CardTitle>
                <p className="font-mono text-[12px] text-muted-2">últimas 6 semanas</p>
              </div>
              <div className="mt-3 flex h-14 items-end gap-2">
                {bars.map((height, index) => (
                  <div key={index} data-testid="trend-bar" className="w-full rounded-md bg-brand" style={{ height: `${height}%` }} />
                ))}
              </div>
            </Card>
          )}
        </div>
        <div>
          {isLoading ? (
            <SegmentsCardSkeleton />
          ) : (
            <Card>
              <CardTitle>Sinais por setor</CardTitle>
              <div className="mt-3 flex flex-col gap-3">
                {segments.map((segment) => (
                  <div key={segment.label}>
                    <div className="flex items-center justify-between text-label text-ink-2">
                      <span>{segment.label}</span>
                      <span className="font-mono text-[12px] text-muted-2">
                        {segment.value}% · n={segment.n}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas-alt">
                      <div className="h-full rounded-pill bg-brand" style={{ width: `${segment.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <div data-testid="insight-pgr-grid" className="mt-3.5 grid items-start gap-4 lg:grid-cols-[7fr_3fr]">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Análise com IA</CardTitle>
            <Link to={routes.managerHistory} className="flex gap-0.5 items-center text-label font-bold text-brand">
              Ver histórico
              <ArrowRight size={16} />
            </Link>
          </div>
          {!insight.data && (
            <div className="mt-3">
              <Button className="p-2 cursor-pointer" variant="outline" full={false} isLoading={insight.isPending} onClick={() => insight.mutate()}>
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
                full={false}
                disabled={segments.length === 0}
                onClick={() => downloadPgrReportAsCsv(data)}
                className="p-2 cursor-pointer"
              >
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                full={false}
                disabled={segments.length === 0}
                onClick={() => downloadPgrReportAsPdf(data)}
                className="p-2 cursor-pointer"
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
