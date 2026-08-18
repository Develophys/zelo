import { Phone, RotateCw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/presentation/ui/Button';
import { getCrisisLine } from '@/presentation/lib/crisis-line';

export function ChatTranscriptFallback({
  onRetry,
  focusRetry = false,
}: {
  onRetry: () => void;
  focusRetry?: boolean;
}) {
  const line = getCrisisLine();
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusRetry) retryRef.current?.focus();
  }, [focusRetry]);

  return (
    <div
      role="alert"
      data-testid="chat-transcript-fallback"
      className="m-auto w-full max-w-[52ch] rounded-input border border-track bg-surface-brand p-[15px_17px]"
    >
      <p className="flex items-start gap-2 text-pretty text-label text-brand-ink">
        <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
        <span>
          Não foi possível mostrar a conversa. Os atalhos abaixo continuam funcionando, e ligar para
          o {line.label} não depende desta tela.
        </span>
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
        <Button
          ref={retryRef}
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

        <a
          href={line.telHref}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-danger-border bg-surface px-4 text-label font-semibold text-danger-strong hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Phone size={15} className="shrink-0" />
          Ligar para o {line.label} · {line.phone}
        </a>
      </div>
    </div>
  );
}
