import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { Skeleton } from "@/presentation/ui/Skeleton";
import { routes } from "@/presentation/lib/routes";
import { useManagerSignals } from "@/presentation/hooks/useManagerSignals";
import { useManagerInsight } from "@/presentation/hooks/useManagerInsight";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadPgrReportAsCsv, downloadPgrReportAsPdf } from "@/presentation/lib/download-manager-pgr-report";

const MIN_TREND_BAR_HEIGHT = 8;
const TREND_SKELETON_BAR_COUNT = 6;
const SEGMENTS_SKELETON_ROW_COUNT = 3;

function toTrendBarHeights(trend: { concerningRate: number }[]): number[] {
  return trend.map((point) => Math.max(MIN_TREND_BAR_HEIGHT, Math.round(point.concerningRate * 100)));
}

function KpiCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={["text-center", className].join(" ")}>
      <Skeleton className="mx-auto h-[30px] w-16 rounded-md" />
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

export function ManagerDashboardPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { data, error, isError, isLoading } = useManagerSignals();
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
    <PhoneShell bg="canvas-alt">
      <div className="pt-[26px]">
        <div className="flex items-center justify-between">
          <BackButton label="Sair da demo" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <div className="mt-4">
          <SectionLabel>Painel do gestor</SectionLabel>
        </div>
        <h1 className="mt-2 text-h2 text-ink">Tendências da equipe</h1>
        <p className="mt-1 text-caption text-muted">
          Somente dados anônimos e agregados. Segmentos com menos de 5 respostas ficam ocultos
          para evitar re-identificação.
        </p>

        <div data-testid="kpi-grid" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {isLoading ? (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton className="col-span-2 md:col-span-1" />
            </>
          ) : (
            <>
              <Card className="text-center">
                <p className="font-serif text-[30px] text-warn">{Math.round(overallConcerningRate * 100)}%</p>
                <p className="text-caption text-muted">sinais de burnout na equipe</p>
              </Card>
              <Card className="text-center">
                <p className="font-serif text-[30px] text-brand">{checkInsLast4Weeks}</p>
                <p className="text-caption text-muted">questionários respondidos (4 semanas)</p>
              </Card>
              <Card className="col-span-2 text-center md:col-span-1">
                <p className="font-serif text-[30px] text-brand">{Math.round(followUpResponseRate * 100)}%</p>
                <p className="text-caption text-muted">taxa de resposta do follow-up</p>
              </Card>
            </>
          )}
        </div>

        <div data-testid="trend-segments-grid" className="mt-[14px] grid gap-[14px] lg:grid-cols-[2fr_1fr]">
          <div>
            {isLoading ? (
              <TrendCardSkeleton />
            ) : (
              <Card>
                <div className="flex items-center justify-between">
                  <p className="text-body font-extrabold text-ink">Tendência geral</p>
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
                <p className="text-body font-extrabold text-ink">Sinais por setor</p>
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

        {data && (
          <div className="mt-3.5">
            <Card>
              <SectionLabel>Conformidade NR-1</SectionLabel>
              <p className="mt-2 text-body font-extrabold text-ink">Insumo para o PGR</p>
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
                >
                  Exportar CSV
                </Button>
                <Button
                  variant="outline"
                  full={false}
                  disabled={segments.length === 0}
                  onClick={() => downloadPgrReportAsPdf(data)}
                >
                  Exportar PDF
                </Button>
              </div>
            </Card>
          </div>
        )}

        <div className="mt-3.5">
          <Card className="mb-2">
            <div className="flex items-center justify-between">
              <p className="text-body font-extrabold text-ink">Análise com IA</p>
              <Link to={routes.managerHistory} className="text-label font-bold text-brand">
                Ver histórico
              </Link>
            </div>
            {!insight.data && (
              <div className="mt-3">
                <Button className="p-2 cursor-pointer" variant="outline" full={false} loading={insight.isPending} onClick={() => insight.mutate()}>
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
        </div>
      </div>
    </PhoneShell>
  );
}
