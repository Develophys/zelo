import type { FormEvent } from 'react';
import { memo, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const MAX_MESSAGE_LENGTH = 2000;

export const ChatComposer = memo(function ChatComposer({
  isStreaming,
  onSend,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || isStreaming) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-surface-brand bg-surface p-[14px_16px] short:p-[10px_16px]"
    >
      <div className="mx-auto flex w-full max-w-chat items-center gap-2">
        <label htmlFor="chat-composer-message" className="sr-only">
          Mensagem
        </label>
        <input
          id="chat-composer-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escreva como você está…"
          maxLength={MAX_MESSAGE_LENGTH}
          autoComplete="off"
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-pill border border-line bg-canvas p-[13px_18px] text-[16px] text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={isStreaming || text.trim().length === 0}
          className="flex h-11.5 w-11.5 flex-none items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <ArrowUp size={20} />
        </button>
      </div>
    </form>
  );
});
