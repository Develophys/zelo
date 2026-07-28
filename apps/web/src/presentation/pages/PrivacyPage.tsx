import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { SectionLabel } from "@/presentation/ui/SectionLabel";
import { routes } from "@/presentation/lib/routes";

const CLAIMS = [
  { title: "Processado no seu aparelho", body: "O cálculo do seu resultado nunca sai do celular." },
  { title: "Anônimo por padrão", body: "Ninguém do hospital vê quem você é — nem o seu CRM." },
  { title: "Você no controle", body: "Nada é compartilhado sem o seu aceite explícito." },
] as const;

export function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell centered>
      <div className="pt-[30px]">
        <SectionLabel>Privacidade primeiro</SectionLabel>
        <h1 className="mb-[22px] mt-[10px] text-h1 text-ink">Como o Zelo protege você</h1>
        <div className="flex flex-col gap-[14px]">
          {CLAIMS.map((claim, index) => (
            <Card key={claim.title}>
              <div className="flex items-start gap-3">
                <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-icon bg-surface-brand font-serif text-[17px] text-brand">
                  {index + 1}
                </div>
                <div>
                  <p className="text-body font-extrabold text-ink">{claim.title}</p>
                  <p className="text-caption text-muted">{claim.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-[24px]">
          <Button variant="primary" onClick={() => navigate(routes.consent)}>
            Entendi, continuar
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
