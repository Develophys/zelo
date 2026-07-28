import { HeartHandshake, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { useChatConversation } from "@/presentation/hooks/useChatConversation";
import { ChatComposer } from "@/presentation/components/ChatComposer";
import { routes } from "@/presentation/lib/routes";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

export function ChatPage() {
  const navigate = useNavigate();
  const { messages, isStreaming, crisisFallback, providerError, sendMessage } =
    useChatConversation(CONVERSATION_ID);

  return (
    <PhoneShell nav centered bg="surface">
      <div className="flex min-h-full flex-col">
        <div className="flex items-center gap-3 border-b border-surface-brand bg-surface p-[14px_20px]">
          <BackButton onClick={() => navigate(routes.home)} />
          <div>
            <p className="text-body font-extrabold text-ink">Acolhimento</p>
            <p className="font-mono text-[12px] text-muted-2">texto anonimizado antes do envio</p>
          </div>
        </div>

        <div className="bg-warn-bg p-[9px] text-center text-[12.5px] text-warn-ink">
          Acolhimento por IA — não substitui atendimento profissional.
        </div>

        <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto p-[18px_16px]">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div
                key={index}
                className="max-w-[80%] self-end rounded-[20px] rounded-br-md bg-brand p-[13px_15px] text-[14.5px] leading-relaxed text-white"
              >
                {message.content}
              </div>
            ) : (
              <div
                key={index}
                className="max-w-[80%] self-start rounded-[20px] rounded-bl-md bg-surface p-[13px_15px] text-[14.5px] leading-relaxed text-ink shadow-card"
              >
                {message.content}
              </div>
            ),
          )}
          {providerError && (
            <p className="text-[13px] text-danger">
              O acolhimento por IA está indisponível no momento. Tente novamente em instantes, ou use o
              atalho "Falar com uma pessoa real" abaixo.
            </p>
          )}
          {crisisFallback && (
            <p className="text-[13px] text-danger">
              Não conseguimos conectar você à IA agora. Se você está em risco, ligue para o CVV: 188.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(routes.crisis)}
          className="mx-4 mb-3 flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-surface-brand p-[13px] font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <HeartHandshake size={18} />
          Falar com uma pessoa real
        </button>

        <button
          type="button"
          onClick={() => navigate(routes.assessment)}
          className="mx-4 mb-3 flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-surface-brand p-[13px] font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ClipboardList size={18} />
          Avaliar como estou
        </button>

        {/* hasActiveRiskSignal is hardcoded false: real risk-signal detection is a separate,
            not-yet-built feature. Feeding crisisFallback back in here would be circular — that
            state only ever becomes true as a RESULT of hasActiveRiskSignal already being true. */}
        <ChatComposer isStreaming={isStreaming} onSend={(text) => sendMessage(text, false)} />
      </div>
    </PhoneShell>
  );
}
