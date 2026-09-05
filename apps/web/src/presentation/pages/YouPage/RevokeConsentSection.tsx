import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { routes } from '@/presentation/lib/routes';
import { useConsentStore } from '@/stores/consent.store';
import { useInlineConfirm } from '@/presentation/hooks/useInlineConfirm';

export function RevokeConsentSection() {
  const navigate = useNavigate();
  const revoke = useConsentStore((state) => state.revoke);
  const { isConfirming, triggerRef, confirmRef, requestConfirm, cancel } = useInlineConfirm();

  const handleRevoke = () => {
    try {
      revoke();
    } catch {
      // no-op
    }
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
        {isConfirming ? (
          <Card tone="brand-tint">
            <div ref={confirmRef} tabIndex={-1} className="outline-none">
              <p className="text-label text-ink-2">
                Tem certeza? Você vai sair da área autenticada e precisará aceitar o consentimento
                novamente para voltar.
              </p>
              <div className="mt-3 flex gap-3">
                <Button variant="outline" full={false} className="flex-1" onClick={cancel}>
                  Cancelar
                </Button>
                <Button variant="danger" full={false} className="flex-1" onClick={handleRevoke}>
                  Sim, revogar
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button ref={triggerRef} variant="danger" onClick={requestConfirm}>
            Revogar consentimento
          </Button>
        )}
      </div>
    </>
  );
}
