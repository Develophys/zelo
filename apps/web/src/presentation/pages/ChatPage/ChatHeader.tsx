import { memo } from 'react';
import { useNavigate } from 'react-router';
import { BackButton } from '@/presentation/ui/BackButton';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { routes } from '@/presentation/lib/routes';
import { AnonymityNote } from './AnonymityNote';
import { CHAT_COLUMN } from './chat-column';

export const ChatHeader = memo(function ChatHeader() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="chat-header"
      className="flex flex-none border-b border-surface-brand bg-surface px-4 md:min-h-app-header"
    >
      <div className={`${CHAT_COLUMN} flex items-center gap-3 py-3.5 short:py-2 md:py-2.5`}>
        <BackButton onClick={() => navigate(routes.home)} />
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">Acolhimento</h1>
          <AnonymityNote truncate className="font-mono text-mono-data">
            anonimizado antes do envio
          </AnonymityNote>
        </div>
        <ThemeSwitchButton className="ml-auto flex-none" />
      </div>
    </div>
  );
});
