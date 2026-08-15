import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { routes } from '@/presentation/lib/routes';
import { useConsentStore } from '@/stores/consent.store';

export function RevokeConsentSection() {
  const navigate = useNavigate();
  const revoke = useConsentStore((state) => state.revoke);
  const [step, setStep] = useState<'idle' | 'confirming'>('idle');
  const [pendingFocus, setPendingFocus] = useState(false);

  const revokeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }
    const target = step === 'confirming' ? confirmRef.current : revokeRef.current;
    target?.focus();
    setPendingFocus(false);
  }, [pendingFocus, step]);

  const handleRevoke = () => {
    revoke();
    navigate(routes.splash, { replace: true });
  };

  return (
    <>
      <Card size="md" className="mt-3.5">
        <p className="text-label text-ink-2">
          Revogar não apaga o histórico anônimo já enviado — os dados agregados não podem ser
          associados a você. Mas você deixa de ter acesso ao check-in, ao chat e ao histórico até
          consentir de novo.
        </p>
      </Card>

      <div className="mt-3.5">
        {step === 'idle' ? (
          <Button
            ref={revokeRef}
            variant="danger"
            onClick={() => {
              setStep('confirming');
              setPendingFocus(true);
            }}
          >
            Revogar consentimento
          </Button>
        ) : (
          <Card tone="brand-tint">
            <div ref={confirmRef} tabIndex={-1} className="outline-none">
              <p className="text-label text-ink-2">
                Tem certeza? Você vai sair da área autenticada e precisará aceitar o consentimento
                novamente para voltar.
              </p>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="outline"
                  full={false}
                  className="flex-1"
                  onClick={() => {
                    setStep('idle');
                    setPendingFocus(true);
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="danger" full={false} className="flex-1" onClick={handleRevoke}>
                  Sim, revogar
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
