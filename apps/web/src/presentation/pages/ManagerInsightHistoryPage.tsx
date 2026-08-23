import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Card } from "@/presentation/ui/Card";
import { Button } from "@/presentation/ui/Button";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { routes } from "@/presentation/lib/routes";
import { useManagerInsightHistory } from "@/presentation/hooks/useManagerInsightHistory";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { downloadInsightAsPdf, downloadInsightAsText } from "@/presentation/lib/download-manager-insight";

function formatDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

export function ManagerInsightHistoryPage() {
  const navigate = useNavigate();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const { data, error, isError } = useManagerInsightHistory();

  useEffect(() => {
    if (isError && error instanceof UnauthorizedManagerError) {
      clearSession();
      navigate(routes.managerLogin, { replace: true });
    }
  }, [isError, error, clearSession, navigate]);

  const entries = data ?? [];

  return (
    <div className="pt-6">
        <SectionLabel>Painel do gestor</SectionLabel>
        <h1 className="mt-2 text-h2 text-ink">Histórico de análises</h1>
        <p className="mt-1 text-caption text-muted">
          Análises geradas anteriormente, da mais recente para a mais antiga.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <p className="font-mono text-[12px] text-muted-2">{formatDate(entry.generatedAt)}</p>
              {entry.createdByManagerName && (
                <p className="mt-1 text-label text-muted">Gerado por {entry.createdByManagerName}</p>
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
                <Button variant="outline" full={false} onClick={() => downloadInsightAsPdf(entry)}>
                  Baixar PDF
                </Button>
                <Button variant="outline" full={false} onClick={() => downloadInsightAsText(entry)}>
                  Baixar texto
                </Button>
              </div>
            </Card>
          ))}
        </div>
    </div>
  );
}
