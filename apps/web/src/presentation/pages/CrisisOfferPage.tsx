import { HeartHandshake } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconBadge } from "@/presentation/ui/IconBadge";
import { CrisisCallLink } from "@/presentation/components/CrisisCallLink";
import { getCrisisLine } from "@/presentation/lib/crisis-line";
import { routes } from "@/presentation/lib/routes";

export function CrisisOfferPage() {
  const navigate = useNavigate();
  const line = getCrisisLine();

  return (
    <PhoneShell bottomNav centered>
      <div className="flex min-h-full flex-col gap-3">
        <IconBadge icon={HeartHandshake} size={38} />
        <h2 className="mt-2 font-serif text-h2 text-ink">Você não está sozinho(a).</h2>
        <p className="text-body text-muted">
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

        <div className="mt-6">
          <Card tone="brand-tint">
            <p className="font-mono text-eyebrow uppercase text-brand">sempre disponível</p>
            <p className="mt-1 text-caption text-muted">Ligação gratuita e sigilosa, 24h.</p>
            <CrisisCallLink
              line={line}
              className="mt-3 w-full justify-center border border-fill-edge bg-brand-fill text-on-fill"
            />
          </Card>
        </div>

        <div data-testid="crisis-offer-spacer" className="flex-1" />
      </div>
    </PhoneShell>
  );
}
