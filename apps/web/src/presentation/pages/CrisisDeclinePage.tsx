import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { requestHumanHandoffUseCase } from "@/app/container";
import { routes } from "@/presentation/lib/routes";

export function CrisisDeclinePage() {
  const navigate = useNavigate();
  const handoff = requestHumanHandoffUseCase.execute();
  const shortLabel = handoff.externalCrisisLine.label.split(" - ")[0];

  return (
    <PhoneShell centered>
      <div className="flex min-h-full flex-col pt-7.5 gap-3">
        <BackButton label="Voltar" onClick={() => navigate(routes.crisis)} />
        <h1 className="mb-2 mt-4 text-h1 text-ink">Tudo bem. A escolha é sua.</h1>
        <p className="text-body text-muted">
          A oferta continua aberta a qualquer momento — sem pressa e sem penalidade.
        </p>

        <div className="mt-6">
          <Card size="lg" tone="brand">
            <p className="font-mono text-eyebrow uppercase opacity-85">linha de crise · 24h</p>
            <p className="mt-2 font-serif text-[40px]">
              {shortLabel} {handoff.externalCrisisLine.phone}
            </p>
            <p className="mt-2 text-label opacity-85">
              Gratuita, sigilosa e disponível a qualquer hora. Você pode ligar agora.
            </p>
            <a
              href={`tel:${handoff.externalCrisisLine.phone}`}
              className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-pill bg-white px-4 font-sans text-[16px] font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Ligar para o CVV
            </a>
          </Card>
        </div>

        <div className="flex-1" />

        <Button variant="outline" onClick={() => navigate(routes.home)}>
          Voltar ao início
        </Button>
      </div>
    </PhoneShell>
  );
}
