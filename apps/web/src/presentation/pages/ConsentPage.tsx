import { useState, type ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { Checkbox } from '@/presentation/ui/Checkbox';
import { useConsentStore } from '@/stores/consent.store';
import { routes } from '@/presentation/lib/routes';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';

const ROWS: ReactNode[] = [
  <>
    Entendo que o Zelo <strong>não emite diagnóstico</strong> e não substitui atendimento
    profissional.
  </>,
  <>
    Autorizo o uso <strong>anônimo e agregado</strong> dos meus sinais para melhorar o cuidado da
    equipe.
  </>,
  <>
    Minha identidade só é revelada se <strong>eu escolher</strong> falar com uma pessoa.
  </>,
];

// Item 2 is the only row that authorizes anything — the other two are
// disclosures, true regardless of what the médico picks. Declining it never
// blocks entry: it only decides whether check-ins later contribute to the
// hospital's anonymous, aggregated signal.
const AGGREGATE_ROW_INDEX = 1;

export function ConsentPage() {
  const navigate = useNavigate();
  const grant = useConsentStore((state) => state.grant);
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);
  const [aggregateOptIn, setAggregateOptIn] = useState(true);

  const handleAccept = () => {
    try {
      grant(aggregateOptIn);
    } catch {
      // Persisting to localStorage can throw (private browsing quota, storage
      // blocked in an embedded webview); grant() already updated in-memory
      // state before that write, so don't strand the user on this gate over it.
    }
    navigate(routes.home, { replace: true });
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Voltar" onClick={() => navigate(routes.privacy)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Seu consentimento</h1>
        <p className="text-caption text-muted">
          Confirme antes de entrar. Você pode revogar quando quiser.
        </p>
        <ol className="mt-5 flex flex-col gap-3">
          {ROWS.map((row, index) => (
            <li key={index}>
              <Card>
                {index === AGGREGATE_ROW_INDEX ? (
                  <label className="flex items-start gap-3">
                    <div
                      aria-hidden="true"
                      className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-icon bg-surface-brand font-serif text-privacy-badge text-brand"
                    >
                      {index + 1}
                    </div>
                    <p className="flex-1 text-label text-ink-2">{row}</p>
                    <Checkbox
                      checked={aggregateOptIn}
                      onChange={(event) => setAggregateOptIn(event.target.checked)}
                    />
                  </label>
                ) : (
                  <div className="flex items-start gap-3">
                    <div
                      aria-hidden="true"
                      className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-icon bg-surface-brand font-serif text-privacy-badge text-brand"
                    >
                      {index + 1}
                    </div>
                    <p className="text-label text-ink-2">{row}</p>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ol>
        <Button
          variant="unstyled"
          type="button"
          onClick={() => setIsEncryptionInfoOpen(true)}
          className="mt-3.5 flex items-start gap-2 rounded-card bg-surface-brand p-3.25 font-mono text-mono-data text-brand"
        >
          <Lock size={16} aria-hidden="true" />
          <span className="flex-1 text-left">
            Criptografia AES-256 no seu aparelho antes de qualquer envio.
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <div className="mt-6">
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
