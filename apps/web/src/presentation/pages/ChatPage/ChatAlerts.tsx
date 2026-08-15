import { RotateCw, Phone } from 'lucide-react';

interface ChatAlertsProps {
  providerError: boolean;
  crisisFallback: boolean;
  onRetry: () => void;
}

export function ChatAlerts({ providerError, crisisFallback, onRetry }: ChatAlertsProps) {
  return (
    <>
      {providerError && (
        <div
          role="alert"
          className="self-stretch rounded-input border border-danger-border bg-danger-bg p-[13px_15px]"
        >
          <p className="text-pretty text-label text-danger-ink">
            O acolhimento por IA não respondeu. Você pode tentar de novo, ou falar com uma pessoa
            real pelo atalho abaixo.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill border border-danger-border bg-surface px-4 text-label font-semibold text-danger transition-colors hover:bg-danger-strong-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            <RotateCw size={15} className="shrink-0" />
            Tentar de novo
          </button>
        </div>
      )}

      {crisisFallback && (
        <div
          role="alert"
          className="self-stretch rounded-input border border-danger-border bg-danger-strong-bg p-[13px_15px]"
        >
          <p className="text-pretty text-label text-danger-strong">
            Não conseguimos conectar você à IA agora. Se você está em risco, ligue para o CVV: 188.
          </p>
          <a
            href="tel:188"
            className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-danger-strong px-4 text-label font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-strong focus-visible:ring-offset-2"
          >
            <Phone size={15} className="shrink-0" />
            Ligar para o CVV · 188
          </a>
        </div>
      )}
    </>
  );
}
