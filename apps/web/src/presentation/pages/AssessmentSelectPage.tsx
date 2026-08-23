import { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { CardButton } from '@/presentation/ui/CardButton';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { routes } from '@/presentation/lib/routes';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';

export function AssessmentSelectPage() {
  const navigate = useNavigate();
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  return (
    <PhoneShell nav centered>
      <div className="pt-6.5 md:pt-10">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <h1 className="mt-4 text-h1 text-ink">Autoavaliação</h1>
        <p className="mt-1 text-caption text-muted">
          Escolha uma escala validada. Leva cerca de 5 minutos.
        </p>

        <div className="mt-5 flex flex-col gap-3 md:mt-7 md:grid md:grid-cols-2 md:gap-4">
          <CardButton
            onClick={() => navigate(routes.phq9)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">PHQ-9</p>
              <p className="text-caption text-muted">Humor e sinais de depressão</p>
            </div>
            <ArrowRight size={18} className="flex-none text-brand md:self-end" />
          </CardButton>

          <CardButton
            onClick={() => navigate(routes.gad7)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">GAD-7</p>
              <p className="text-caption text-muted">Ansiedade</p>
            </div>
            <ArrowRight size={18} className="flex-none text-brand md:self-end" />
          </CardButton>

          <div className="flex items-center justify-between rounded-card bg-canvas-alt p-4.5 opacity-70 md:col-span-2 md:p-6">
            <div>
              <p className="text-body font-extrabold text-muted">MBI-HSS</p>
              <p className="text-caption text-muted">Burnout ocupacional</p>
            </div>
            <span className="rounded-status bg-line px-3 py-1 font-mono text-[11px] text-muted-2">
              em breve
            </span>
          </div>
        </div>

        <Button
          variant="unstyled"
          type="button"
          onClick={() => setIsEncryptionInfoOpen(true)}
          aria-label="Saiba mais sobre a criptografia AES-256"
          className="mt-2 flex min-h-11 items-center justify-center gap-1 text-muted hover:text-brand md:mt-6"
        >
          <Lock size={12} />
          <span className="font-mono text-eyebrow uppercase">tudo processado no seu aparelho</span>
        </Button>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </PhoneShell>
  );
}
