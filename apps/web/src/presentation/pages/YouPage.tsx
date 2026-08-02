import { useState } from "react";
import { Check, Building2 } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { IconBadge } from "@/presentation/ui/IconBadge";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { useConsentStore } from "@/stores/consent.store";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { routes } from "@/presentation/lib/routes";

export function YouPage() {
  const navigate = useNavigate();
  const consentedAt = useConsentStore((state) => state.consentedAt);
  const revoke = useConsentStore((state) => state.revoke);
  const institutionName = useInstitutionLinkStore((state) => state.institutionName);
  const department = useInstitutionLinkStore((state) => state.department);
  const unlink = useInstitutionLinkStore((state) => state.unlink);
  const [step, setStep] = useState<"idle" | "confirming">("idle");

  const handleRevoke = () => {
    revoke();
    navigate(routes.splash, { replace: true });
  };

  return (
    <PhoneShell nav centered>
      <div className="pt-[30px]">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <h1 className="mt-4 text-h1 text-ink">Você</h1>
        <p className="mt-1 text-caption text-muted">Seu consentimento e sua privacidade.</p>

        <Card size="md" className="mt-5">
          <div className="flex items-center gap-3">
            <IconBadge icon={Check} tone="brand" />
            <div>
              <p className="text-body font-extrabold text-ink">Consentimento ativo</p>
              {consentedAt && (
                <p className="text-caption text-muted">
                  Desde{" "}
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(consentedAt))}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card size="md" className="mt-[14px]">
          {institutionName ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconBadge icon={Building2} tone="neutral" />
                <div>
                  <p className="text-body font-extrabold text-ink">Vinculado a {institutionName}</p>
                  <p className="text-caption text-muted">{department}</p>
                </div>
              </div>
              <Button variant="outline" full={false} onClick={unlink}>
                Desvincular
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-body text-ink-2">Ainda não vinculado a nenhum hospital.</p>
              <Button variant="outline" full={false} onClick={() => navigate(routes.linkInstitution)}>
                Vincular a um hospital
              </Button>
            </div>
          )}
        </Card>

        <Card size="md" className="mt-[14px]">
          <p className="text-label text-ink-2">
            Revogar não apaga o histórico anônimo já enviado — os dados agregados não podem ser
            associados a você. Mas você deixa de ter acesso ao check-in, ao chat e ao histórico
            até consentir de novo.
          </p>
        </Card>

        <div className="mt-[14px]">
          {step === "idle" ? (
            <Button variant="danger" onClick={() => setStep("confirming")}>
              Revogar consentimento
            </Button>
          ) : (
            <Card tone="brand-tint">
              <p className="text-label text-ink-2">
                Tem certeza? Você vai sair da área autenticada e precisará aceitar o
                consentimento novamente para voltar.
              </p>
              <div className="mt-3 flex gap-3">
                <Button variant="outline" full={false} className="flex-1" onClick={() => setStep("idle")}>
                  Cancelar
                </Button>
                <Button variant="danger" full={false} className="flex-1" onClick={handleRevoke}>
                  Sim, revogar
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PhoneShell>
  );
}
