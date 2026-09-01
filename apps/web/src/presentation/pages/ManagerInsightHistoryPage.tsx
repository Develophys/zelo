import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, FileDown, FileText } from "lucide-react";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { IconButton } from "@/presentation/ui/IconButton";
import { DataTableShell } from "@/presentation/ui/DataTable/DataTableShell";
import { DataTableToolbar } from "@/presentation/ui/DataTable/DataTableToolbar";
import { DataTableEmpty } from "@/presentation/ui/DataTable/DataTableEmpty";
import { DataTableError } from "@/presentation/ui/DataTable/DataTableError";
import { routes } from "@/presentation/lib/routes";
import { useManagerInsightHistory } from "@/presentation/hooks/useManagerInsightHistory";
import { useManagerInsight } from "@/presentation/hooks/useManagerInsight";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadInsightAsPdf, downloadInsightAsText } from "@/presentation/lib/download-manager-insight";
import { MANAGER_INSIGHT_DISCLAIMER } from "@/presentation/lib/manager-insight-disclaimer";
import type { StoredManagerInsight } from "@/ports/manager-insight-history.port";

function formatDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

// The body an analysis carries is long and normally collapsed, so searching
// only the visible summary would miss most of what the manager is looking for.
function matches(entry: StoredManagerInsight, term: string): boolean {
  const haystack = [entry.summary, entry.interpretation, ...entry.suggestedActions]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function InsightDetail({
  entry,
  downloads,
}: {
  entry: StoredManagerInsight;
  downloads: "icons" | "words";
}) {
  const dateLabel = formatDate(entry.generatedAt);

  return (
    <>
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
      {/* Sits immediately above the download buttons on purpose: the reader sees
          how this was produced before choosing to take it out of the app. */}
      <p
        data-testid="insight-disclaimer"
        className="mt-4 border-t border-line pt-3 text-pretty text-caption text-muted"
      >
        {MANAGER_INSIGHT_DISCLAIMER}
      </p>
      <div className="mt-3 flex gap-2">
        {downloads === "icons" ? (
          <>
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
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}

function InsightRow({ entry }: { entry: StoredManagerInsight }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = `insight-region-${entry.id}`;
  const dateLabel = formatDate(entry.generatedAt);

  return (
    <>
      <tr className="border-b border-line last:border-b-0">
        <td className="px-cell-x py-cell-y align-top">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? regionId : undefined}
            aria-label={`Análise de ${dateLabel}: ${entry.summary}`}
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`flex-none text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-mono-data text-muted-2">{dateLabel}</span>
              <span className={`mt-1 block text-label text-ink-2 ${expanded ? "" : "truncate"}`}>
                {entry.summary}
              </span>
            </span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr id={regionId} className="border-b border-line last:border-b-0">
          <td className="bg-canvas px-cell-x py-cell-y">
            <InsightDetail entry={entry} downloads="icons" />
          </td>
        </tr>
      )}
    </>
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
          <span className="block font-mono text-mono-data text-muted-2">{dateLabel}</span>
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
          <InsightDetail entry={entry} downloads="words" />
        </div>
      )}
    </Card>
  );
}

export function ManagerInsightHistoryPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { data, error, isError, refetch } = useManagerInsightHistory();
  const insight = useManagerInsight();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isError && error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [isError, error, clearSession, navigate]);

  const loadFailed = isError && !(error instanceof UnauthorizedManagerError);
  const entries = data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (term.length === 0 ? entries : entries.filter((entry) => matches(entry, term))),
    [entries, term],
  );

  const generate = (
    <Button variant="primary" size="sm" full={false} isLoading={insight.isPending} onClick={() => insight.mutate()}>
      Gerar análise
    </Button>
  );

  return (
    <div className="flex flex-col gap-5 md:h-full md:min-h-0">
      {insight.isError && (
        <p role="alert" className="text-label text-danger">
          Não foi possível gerar a análise agora. Tente novamente.
        </p>
      )}

      <DataTableShell
        fill
        toolbar={<DataTableToolbar search={search} onSearchChange={setSearch} action={generate} />}
      >
        {loadFailed ? (
          /* Not "nenhuma análise gerada ainda" — that would tell a coordinator
             the opposite of the truth about their own history. */
          <DataTableError
            message="Não foi possível carregar o histórico de análises."
            onRetry={() => refetch()}
          />
        ) : filtered.length === 0 ? (
          term.length > 0 ? (
            <DataTableEmpty
              title="Nenhuma análise corresponde à busca."
              hint="A busca percorre o resumo, a interpretação e as ações sugeridas."
            />
          ) : (
            <DataTableEmpty
              title="Nenhuma análise gerada ainda."
              hint="Use o botão Gerar análise, acima, para criar a primeira."
            />
          )
        ) : (
          <table data-testid="insight-row-list" className="hidden w-full table-fixed md:table">
            <caption className="sr-only">Histórico de análises com IA</caption>
            <tbody>
              {filtered.map((entry) => (
                <InsightRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>

      {filtered.length > 0 && (
        <ul data-testid="insight-card-list" className="flex flex-col gap-3 md:hidden">
          {/* Deliberately expanded on the phone only. The desktop table shows
              date, summary and actions per row at a glance; a phone card shows
              date and summary, so opening the newest analysis is what makes the
              two carry comparable information on arrival. Collapsing it for
              consistency would cost a tap for the entry most people came for. */}
          {filtered.map((entry, index) => (
            <li key={entry.id}>
              <InsightCard entry={entry} isDefaultOpen={index === 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
