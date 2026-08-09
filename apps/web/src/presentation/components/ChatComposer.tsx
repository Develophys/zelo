import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowUp } from "lucide-react";

export function ChatComposer({
  isStreaming,
  onSend,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length === 0 || isStreaming) return;
    onSend(text);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-surface-brand p-[14px_16px]">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Escreva como você está…"
        disabled={isStreaming}
        className="flex-1 rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      <button
        type="submit"
        aria-label="Enviar"
        disabled={isStreaming}
        className="flex h-11.5 w-11.5 flex-none items-center justify-center rounded-full bg-brand text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowUp size={20} />
      </button>
    </form>
  );
}
