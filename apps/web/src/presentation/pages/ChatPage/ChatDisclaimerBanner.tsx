import { CHAT_COLUMN } from './chat-column';

export function ChatDisclaimerBanner() {
  return (
    <div className="flex-none bg-warn-bg p-2.25 short:p-1.5">
      <p className={`${CHAT_COLUMN} text-balance text-center text-[12.5px] text-warn-ink`}>
        Acolhimento por IA — não substitui atendimento profissional.
      </p>
    </div>
  );
}
