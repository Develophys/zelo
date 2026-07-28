import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { useConsentStore } from "@/stores/consent.store";
import { routes } from "@/presentation/lib/routes";
import { EncryptionInfoModal } from "@/presentation/components/EncryptionInfoModal";

const ROWS: ReactNode[] = [
  <>Entendo que o Zelo <strong>não emite diagnóstico</strong> e não substitui atendimento profissional.</>,
  <>Autorizo o uso <strong>anônimo e agregado</strong> dos meus sinais para melhorar o cuidado da equipe.</>,
  <>Minha identidade só é revelada se <strong>eu escolher</strong> falar com uma pessoa.</>,
];

export function ConsentPage() {
  const navigate = useNavigate();
  const grant = useConsentStore((state) => state.grant);
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  const handleAccept = () => {
    grant();
    navigate(routes.home, { replace: true });
  };

  return (
    <PhoneShell centered>
      <div className="pt-[30px]">
        <BackButton label="Voltar" onClick={() => navigate(routes.privacy)} />
        <h1 className="mb-[6px] mt-4 text-h1 text-ink">Seu consentimento</h1>
        <p className="text-caption text-muted">
          Confirme antes de entrar. Você pode revogar quando quiser.
        </p>
        <div className="mt-5 flex flex-col gap-[12px]">
          {ROWS.map((row, index) => (
            <Card key={index}>
              <div className="flex items-start gap-3">
                <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-brand text-white">
                  <Check size={14} />
                </div>
                <p className="text-label text-ink-2">{row}</p>
              </div>
            </Card>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsEncryptionInfoOpen(true)}
          aria-label="Saiba mais sobre a criptografia AES-256"
          className="mt-[14px] flex w-full items-center gap-2 rounded-2xl bg-surface-brand p-[13px] font-mono text-[12.5px] leading-relaxed text-brand"
        >
          <Lock size={16} />
          <span className="flex-1 text-left">
            Criptografia AES-256 no seu aparelho antes de qualquer envio.
          </span>
          <ChevronRight size={16} />
        </button>
        <div className="mt-[24px]">
          <Button variant="primary" onClick={handleAccept}>
            Aceitar e entrar
          </Button>
        </div>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </PhoneShell>
  );
}
