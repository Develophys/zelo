import { useState } from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { routes } from "@/presentation/lib/routes";
import { EncryptionInfoModal } from "@/presentation/components/EncryptionInfoModal";

export function AssessmentSelectPage() {
  const navigate = useNavigate();
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  return (
    <PhoneShell nav centered>
      <div className="pt-[26px]">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <h1 className="mt-4 text-h1 text-ink">Autoavaliação</h1>
        <p className="mt-1 text-caption text-muted">
          Escolha uma escala validada. Leva cerca de 5 minutos.
        </p>

        <div className="mt-5 flex flex-col gap-[12px]">
          <button
            type="button"
            onClick={() => navigate(routes.phq9)}
            className="flex items-center justify-between rounded-card bg-surface p-[18px] text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div>
              <p className="text-body font-extrabold text-ink">PHQ-9</p>
              <p className="text-caption text-muted">Humor e sinais de depressão</p>
            </div>
            <span className="text-brand">→</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(routes.gad7)}
            className="flex items-center justify-between rounded-card bg-surface p-[18px] text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div>
              <p className="text-body font-extrabold text-ink">GAD-7</p>
              <p className="text-caption text-muted">Ansiedade</p>
            </div>
            <span className="text-brand">→</span>
          </button>

          <div className="flex items-center justify-between rounded-card bg-canvas-alt p-[18px] opacity-70">
            <div>
              <p className="text-body font-extrabold text-muted">MBI-HSS</p>
              <p className="text-caption text-muted">Burnout ocupacional</p>
            </div>
            <span className="rounded-pill bg-line px-3 py-1 font-mono text-[11px] text-muted-2">em breve</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEncryptionInfoOpen(true)}
          aria-label="Saiba mais sobre a criptografia AES-256"
          className="mt-6 flex w-full items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Lock size={12} className="text-muted-2" />
          <span className="font-mono text-eyebrow uppercase text-muted-2">tudo processado no seu aparelho</span>
        </button>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </PhoneShell>
  );
}
