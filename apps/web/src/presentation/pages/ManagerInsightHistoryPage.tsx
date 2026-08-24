import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, FileDown, FileText } from "lucide-react";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { IconButton } from "@/presentation/ui/IconButton";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { ManagerActionBar } from "@/presentation/layout/ManagerActionBar";
import { routes } from "@/presentation/lib/routes";
import { useManagerInsightHistory } from "@/presentation/hooks/useManagerInsightHistory";
import { useManagerInsight } from "@/presentation/hooks/useManagerInsight";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadInsightAsPdf, downloadInsightAsText } from "@/presentation/lib/download-manager-insight";
import type { StoredManagerInsight } from "@/ports/manager-insight-history.port";

function formatDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

function InsightRow({ entry }: { entry: StoredManagerInsight }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = `insight-region-${entry.id}`;
  const dateLabel = formatDate(entry.generatedAt);

  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? regionId : undefined}
        aria-label={`Análise de ${dateLabel}: ${entry.summary}`}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-cell-x py-cell-y text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[12px] text-muted-2">{dateLabel}</span>
          <span className="mt-1 block truncate text-label text-ink-2">{entry.summary}</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`flex-none text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div id={regionId} className="border-t border-line px-cell-x py-cell-y">
          {entry.createdByManagerName && (
            <p className="text-label text-muted">Gerado por {entry.createdByManagerName}</p>
          )}
          <p className="mt-2 text-label text-ink-2">{entry.interpretation}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {entry.suggestedActions.map((action, index) => (
              <li key={index} className="flex items-start gap-2 text-label text-ink-2">
                <span className="text-brand">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <IconButton
              label={`Baixar PDF da análise de ${dateLabel}`}
              icon={<FileDown size={16} />}
              variant="outline"
              onClick={() => downloadInsightAsPdf(entry)}
            />
            <IconButton
              label={`Baixar texto da análise de ${dateLabel}`}
              icon={<FileText size={16} />}
              variant="outline"
              onClick={() => downloadInsightAsText(entry)}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function InsightCard({ entry, isDefaultOpen }: { entry: StoredManagerInsight; isDefaultOpen: boolean }) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? isDefaultOpen;
  const regionId = `insight-card-region-${entry.id}`;
  const dateLabel = formatDate(entry.generatedAt);

  return (
    <Card>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? regionId : undefined}
        aria-label={`Análise de ${dateLabel}: ${entry.summary}`}
        onClick={() => setManualExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[12px] text-muted-2">{dateLabel}</span>
          <span className="mt-1 block truncate text-label text-ink-2">{entry.summary}</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`flex-none text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div id={regionId} className="mt-3 border-t border-line pt-3">
          {entry.createdByManagerName && (
            <p className="text-label text-muted">Gerado por {entry.createdByManagerName}</p>
          )}
          <p className="mt-2 text-label text-ink-2">{entry.interpretation}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {entry.suggestedActions.map((action, index) => (
              <li key={index} className="flex items-start gap-2 text-label text-ink-2">
                <span className="text-brand">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              full={false}
              aria-label={`Baixar PDF da análise de ${dateLabel}`}
              onClick={() => downloadInsightAsPdf(entry)}
            >
              Baixar PDF
            </Button>
            <Button
              variant="outline"
              full={false}
              aria-label={`Baixar texto da análise de ${dateLabel}`}
              onClick={() => downloadInsightAsText(entry)}
            >
              Baixar texto
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ManagerInsightHistoryPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { data, error, isError } = useManagerInsightHistory();
  const insight = useManagerInsight();

  useEffect(() => {
    if (isError && error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [isError, error, clearSession, navigate]);

  const entries = data ?? [];

  return (
    <div className="flex flex-col gap-5 pt-6">
      <ManagerPageHeader
        title="Análises com IA"
        intro="Histórico das análises geradas a partir dos indicadores agregados. Cada linha pode ser expandida para ver a interpretação completa."
      />

      <ManagerActionBar>
        <Button variant="outline" full={false} isLoading={insight.isPending} onClick={() => insight.mutate()}>
          Gerar análise
        </Button>
      </ManagerActionBar>

      {insight.isError && (
        <p role="alert" className="text-label text-danger">
          Não foi possível gerar a análise agora. Tente novamente.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="text-body text-ink">Nenhuma análise gerada ainda.</p>
          <p className="mt-1 text-label text-muted">Use o botão Gerar análise, acima, para criar a primeira.</p>
        </div>
      ) : (
        <>
          <ul data-testid="insight-row-list" className="hidden flex-col gap-2 md:flex">
            {entries.map((entry) => (
              <InsightRow key={entry.id} entry={entry} />
            ))}
          </ul>

          <ul data-testid="insight-card-list" className="flex flex-col gap-3 md:hidden">
            {entries.map((entry, index) => (
              <li key={entry.id}>
                <InsightCard entry={entry} isDefaultOpen={index === 0} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
