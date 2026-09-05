import { useState, type SubmitEvent } from 'react';
import { Button } from '@/presentation/ui/Button';
import { TextField } from '@/presentation/ui/TextField';
import { MessageBubble } from '@/presentation/ui/MessageBubble';
import { TranscriptScroller } from '@/presentation/ui/TranscriptScroller';
import { useStickToBottom } from '@/presentation/hooks/useStickToBottom';
import { PRIVATE_TEXT_FIELD } from '@/presentation/lib/private-field';
import { useInlineConfirm } from '@/presentation/hooks/useInlineConfirm';

export interface PeerChatMessage {
  from: 'me' | 'peer';
  text: string;
}

interface PeerChatRoomProps {
  messages: PeerChatMessage[];
  onSend: (text: string) => void;
  onLeave: () => void;
  peerLeft: boolean;
  connectionLost?: boolean;
  onRetry?: () => void;
}

export function PeerChatRoom({ messages, onSend, onLeave, peerLeft, connectionLost = false, onRetry }: PeerChatRoomProps) {
  const [text, setText] = useState('');
  // Messages arrive from another person, so the transcript follows new content
  // the way the AI chat does rather than leaving the reader to scroll for it.
  const { scrollerRef, handleScroll } = useStickToBottom(messages.length);
  const leaveConfirm = useInlineConfirm();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText('');
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TranscriptScroller
        scrollerRef={scrollerRef}
        onScroll={handleScroll}
        label="Conversa com o colega"
        role="log"
        live="polite"
        className="min-h-40 py-1"
      >
        <div className={`flex flex-col gap-2 ${isEmpty ? 'min-h-full justify-center' : ''}`}>
          {isEmpty ? (
            <div className="text-center">
              <p className="font-serif text-h2 text-ink">Vocês estão conectados.</p>
              <p className="mt-2 text-pretty text-caption text-muted">
                Ninguém vê a identidade do outro. Diga oi quando quiser começar.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <MessageBubble
                key={index}
                side={message.from === 'me' ? 'own' : 'other'}
                testId={message.from === 'me' ? 'peer-bubble-own' : 'peer-bubble-other'}
                content={message.text}
                startsExchange={index > 0 && messages[index - 1]?.from !== message.from}
              />
            ))
          )}
        </div>
      </TranscriptScroller>

      {peerLeft && (
        <p role="status" className="mt-3 text-label text-muted">
          O colega saiu da conversa.
        </p>
      )}

      {connectionLost && (
        <div className="mt-3 rounded-card border border-danger-border bg-danger-bg p-3">
          <p role="alert" className="text-label font-semibold text-danger">
            A conexão caiu. Suas últimas mensagens podem não ter chegado.
          </p>
          {onRetry && (
            <div className="mt-3">
              <Button variant="outline" size="sm" full={false} onClick={onRetry}>
                Procurar outro colega
              </Button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="peer-chat-message" className="sr-only">
          Mensagem
        </label>
        <TextField
          id="peer-chat-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="flex-1"
          disabled={connectionLost}
          {...PRIVATE_TEXT_FIELD}
        />
        <Button type="submit" full={false} disabled={connectionLost}>
          Enviar
        </Button>
      </form>

      <div className="mt-3">
        {leaveConfirm.isConfirming ? (
          <div
            ref={leaveConfirm.confirmRef}
            tabIndex={-1}
            className="rounded-card border border-line bg-canvas-alt p-3 outline-none"
          >
            <p className="text-label text-ink-2">
              Tem certeza? Você não vai poder voltar a esta conversa.
            </p>
            <div className="mt-3 flex gap-3">
              <Button variant="outline" full={false} className="flex-1" onClick={leaveConfirm.cancel}>
                Cancelar
              </Button>
              <Button variant="danger" full={false} className="flex-1" onClick={onLeave}>
                Sim, sair
              </Button>
            </div>
          </div>
        ) : (
          <Button ref={leaveConfirm.triggerRef} variant="outline" onClick={leaveConfirm.requestConfirm}>
            Sair da conversa
          </Button>
        )}
      </div>
    </div>
  );
}
