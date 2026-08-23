import { RotateCw, Phone, Wifi, WifiOff } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/presentation/ui/Button';
import { getCrisisLine, type CrisisLine } from '@/presentation/lib/crisis-line';
import type { ChatStreamError } from '@/presentation/hooks/useChatConversation';

interface ChatAlertsProps {
  streamError: ChatStreamError | null;
  crisisFallback: boolean;
  isOnline: boolean;
  onRetry: () => void;
}

function CrisisCallLink({ line, className }: { line: CrisisLine; className: string }) {
  return (
    <a
      href={line.telHref}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-4 text-label font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${className}`}
    >
      <Phone size={15} className="shrink-0" />
      Ligar para o {line.label} · {line.phone}
    </a>
  );
}

export const ChatAlerts = memo(function ChatAlerts({
  streamError,
  crisisFallback,
  isOnline,
  onRetry,
}: ChatAlertsProps) {
  const line = getCrisisLine();

  if (crisisFallback) {
    return (
      <div
        role="alert"
        className="self-stretch rounded-card border border-danger-strong bg-danger-strong-bg p-[13px_15px]"
      >
        <p className="text-pretty text-label text-danger-strong">
          Não conseguimos conectar você à IA agora. Se você está em risco, ligue para o {line.label}
          : {line.phone}.
        </p>
        <div className="mt-2.5">
          <CrisisCallLink
            line={line}
            className="border border-fill-edge bg-danger-strong-fill text-on-fill"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {streamError === 'provider' && (
        <div
          role="alert"
          className="self-stretch rounded-card border border-danger-border bg-danger-bg p-[13px_15px]"
        >
          <p className="text-pretty text-label text-danger-ink">
            O acolhimento por IA não respondeu. Você pode tentar de novo, ou falar com uma pessoa
            real pelo atalho abaixo.
          </p>
          <Button
            type="button"
            variant="unstyled"
            size="sm"
            full={false}
            onClick={onRetry}
            className="mt-2.5 border border-danger-border bg-surface text-danger hover:bg-danger-strong-bg"
          >
            <RotateCw size={15} className="shrink-0" />
            Tentar de novo
          </Button>
        </div>
      )}

      {streamError === 'offline' && (
        <div
          role="alert"
          className="self-stretch rounded-card border border-track bg-surface-brand p-[13px_15px]"
        >
          <p className="flex items-start gap-2 text-pretty text-label text-brand-ink">
            {isOnline ? (
              <Wifi size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
            ) : (
              <WifiOff size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
            )}
            <span>
              {isOnline
                ? `A conexão voltou. Sua mensagem continua aqui — toque em tentar de novo para receber a resposta. Ligar para o ${line.label} não depende de internet.`
                : `Você está sem conexão. A conversa continua aqui — quando a internet voltar, toque em tentar de novo. Ligar para o ${line.label} não depende de internet.`}
            </span>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
            <Button
              type="button"
              variant="unstyled"
              size="sm"
              full={false}
              onClick={onRetry}
              className="border border-track bg-surface text-brand hover:bg-canvas"
            >
              <RotateCw size={15} className="shrink-0" />
              Tentar de novo
            </Button>
            <CrisisCallLink
              line={line}
              className="border border-danger-border bg-surface text-danger-strong hover:bg-danger-bg"
            />
          </div>
        </div>
      )}
    </>
  );
});
