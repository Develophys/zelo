import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { ResultBandCard } from '@/presentation/components/ResultBandCard';
import { RiskSignalCallout } from '@/presentation/components/RiskSignalCallout';
import { bandFor } from '@/presentation/lib/band-for';
import { isResultState } from '@/presentation/lib/is-result-state';
import { routes } from '@/presentation/lib/routes';

export function AssessmentResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = isResultState(location.state) ? location.state : null;

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
    <PhoneShell bottomNav centered>
      <div>
        <ResultBandCard scaleType={scaleType} score={totalScore} max={max} band={band} />

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
    </PhoneShell>
  );
}
