import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { ResultBandCard } from '@/presentation/components/ResultBandCard';
import { RiskSignalCallout } from '@/presentation/components/RiskSignalCallout';
import { BandSupportCard } from '@/presentation/components/BandSupportCard';
import { bandFor, bandNeedsSupport } from '@/presentation/lib/band-for';
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

  const { scaleType, totalScore, max, riskSignal, pendingSync } = state;
  const band = bandFor(scaleType, totalScore);

  return (
    <PhoneShell bottomNav centered>
      <div>
        {/* The same words at every severity, deliberately. Keying the heading to
            the band would let a weekly user decode it as a tell before reading
            the number; the severity-specific warmth lives in the support cards
            below, which exist for exactly that. */}
        <h2 className="mt-2 font-serif text-h2 text-ink">Obrigado por responder até o fim.</h2>

        {/* Above the score, not below it: reassurance that arrives after a 64px
            band-toned number has already been read is not reassurance. */}
        <p className="mt-2 mb-4.5 text-pretty text-body text-muted">
          Isto é um sinal, não um diagnóstico. Ele ajuda a decidir o próximo passo — no seu tempo.
        </p>

        <ResultBandCard scaleType={scaleType} score={totalScore} max={max} band={band} />

        {/* Deliberately makes no promise of a later sync: nothing in the app
            retries the upload, so "vai sincronizar" would be false. It says
            what is true — the record is on the device and in their own
            history — and what is not: the anonymous hospital aggregate. */}
        {pendingSync && (
          <div
            data-testid="pending-sync-notice"
            className="mt-4.5 rounded-card border border-line bg-canvas-alt p-4.5"
          >
            <p className="text-body font-extrabold text-ink">Salvo só neste aparelho.</p>
            <p className="mt-1 text-pretty text-caption text-muted">
              A conexão falhou, então este check-in não entrou nos números anônimos do hospital.
              Ele continua no seu histórico, aqui.
            </p>
          </div>
        )}

        {/* Two distinct treatments on purpose. The danger-toned callout answers
            the item-9 acute-risk signal; the calmer card answers a high or
            severe band with no such signal. Collapsing them would either
            under-serve a severe score or over-alarm someone who is not in
            acute risk. */}
        {riskSignal ? (
          <div className="mb-4.5">
            <RiskSignalCallout onConnect={() => navigate(routes.crisis)} />
          </div>
        ) : (
          bandNeedsSupport(band) && (
            <div className="mb-4.5">
              <BandSupportCard onTalk={() => navigate(routes.crisis)} />
            </div>
          )
        )}

        {/* The support card above already carries a primary. Two full-weight
            buttons ask someone in distress to choose between options that look
            equally urgent. */}
        <Button
          variant={riskSignal || bandNeedsSupport(band) ? 'outline' : 'primary'}
          onClick={() => navigate(routes.chat)}
        >
          Conversar com o acolhimento
        </Button>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => navigate(routes.home)}>
            Voltar ao início
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
