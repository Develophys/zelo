import { memo } from 'react';
import { CHAT_COLUMN } from './chat-column';

export const ChatDisclaimerBanner = memo(function ChatDisclaimerBanner() {
  return (
    <div className="flex-none bg-warn-bg px-4 py-2 short:py-1.5">
      <p className={`${CHAT_COLUMN} text-balance text-center text-caption text-warn-ink`}>
        Acolhimento por IA — não substitui atendimento profissional.
      </p>
    </div>
  );
});
