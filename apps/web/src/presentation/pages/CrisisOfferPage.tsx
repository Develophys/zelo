import { HeartHandshake } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconBadge } from "@/presentation/ui/IconBadge";
import { requestHumanHandoffUseCase } from "@/app/container";
import { routes } from "@/presentation/lib/routes";

export function CrisisOfferPage() {
  const navigate = useNavigate();
  const handoff = requestHumanHandoffUseCase.execute();
  // The use-case's label is the long form ("CVV - Centro de Valorização da Vida");
  // the short form before " - " is what the spec's "CVV · 188" copy expects.
  const shortLabel = handoff.externalCrisisLine.label.split(" - ")[0];

  return (
    <PhoneShell centered>
      <div className="flex min-h-full flex-col pt-7.5 gap-3">
        <IconBadge icon={HeartHandshake} size={60} />
        <h1 className="text-h1 text-ink">Você não está sozinho(a).</h1>
        <p className="mt-2 text-body text-muted">
          A escolha é sempre sua. Você prefere falar com uma pessoa de verdade agora?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Button variant="primary" onClick={() => navigate(routes.crisisConnect)}>
            Sim, quero falar com um psicólogo
          </Button>
          <Button variant="outline" onClick={() => navigate(routes.crisisLine)}>
            Agora não
          </Button>
        </div>

        <div className="flex-1" />

        <Card tone="brand-tint">
          <p className="font-mono text-eyebrow uppercase text-brand">sempre disponível</p>
          <p className="mt-1 text-body font-extrabold text-ink">
            {shortLabel} · {handoff.externalCrisisLine.phone}
          </p>
          <p className="text-caption text-muted">Ligação gratuita e sigilosa, 24h.</p>
        </Card>
      </div>
    </PhoneShell>
  );
}
