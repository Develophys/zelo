import { useNavigate } from 'react-router';
import { BackButton } from '@/presentation/ui/BackButton';
import { routes } from '@/presentation/lib/routes';
import { CHAT_COLUMN } from './chat-column';

export function ChatHeader() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="chat-header"
      className="flex flex-none border-b border-surface-brand bg-surface md:min-h-app-header"
    >
      <div
        className={`${CHAT_COLUMN} flex items-center gap-3 p-[14px_20px] short:p-[8px_20px] md:py-2.5`}
      >
        <BackButton onClick={() => navigate(routes.home)} />
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">Acolhimento</h1>
          <p className="truncate font-mono text-mono-data text-muted-2">
            texto anonimizado antes do envio
          </p>
        </div>
      </div>
    </div>
  );
}
