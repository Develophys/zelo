import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { ResultBandCard } from '@/presentation/components/ResultBandCard';
import { RiskSignalCallout } from '@/presentation/components/RiskSignalCallout';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';
import { bandFor } from '@/presentation/lib/band-for';
import { isResultState } from '@/presentation/lib/is-result-state';
import { routes } from '@/presentation/lib/routes';

export function AssessmentResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = isResultState(location.state) ? location.state : null;
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  useEffect(() => {
    if (!state) {
      navigate(routes.assessment, { replace: true });
    }
  }, [state, navigate]);

  if (!state) {
    return null;
  }

  const { scaleType, totalScore, max, riskSignal } = state;
  const band = bandFor(scaleType, totalScore);

  return (
    <PhoneShell centered>
      <div className="pt-7">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsEncryptionInfoOpen(true)}
            aria-label="Saiba mais sobre a criptografia AES-256"
            className="flex min-h-11 cursor-pointer items-center gap-1 text-muted-2 transition-colors duration-200 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Lock size={12} />
            <span className="font-mono text-eyebrow uppercase">processado no seu aparelho</span>
          </button>
          <PrivacyBadge />
        </div>

        <div className="mt-4">
          <ResultBandCard scaleType={scaleType} score={totalScore} max={max} band={band} />
        </div>

        <p className="my-4.5 text-body text-muted">
          Isto é um sinal, não um diagnóstico. Ele ajuda a decidir o próximo passo — no seu tempo.
        </p>

        {riskSignal && (
          <div className="mb-4.5">
            <RiskSignalCallout onConnect={() => navigate(routes.crisis)} />
          </div>
        )}

        <Button variant="primary" onClick={() => navigate(routes.chat)}>
          Conversar com o acolhimento
        </Button>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => navigate(routes.assessment)}>
            Voltar ao início
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
