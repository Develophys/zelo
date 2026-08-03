import { useState, type FormEvent } from "react";
import { Button } from "@/presentation/ui/Button";

export interface PeerChatMessage {
  from: "me" | "peer";
  text: string;
}

interface PeerChatRoomProps {
  messages: PeerChatMessage[];
  onSend: (text: string) => void;
  onLeave: () => void;
  peerLeft: boolean;
}

export function PeerChatRoom({ messages, onSend, onLeave, peerLeft }: PeerChatRoomProps) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        {messages.map((message, index) => (
          <p key={index} className={message.from === "me" ? "text-right text-ink" : "text-left text-ink-2"}>
            {message.text}
          </p>
        ))}
      </div>

      {peerLeft && (
        <p role="status" className="mt-3 text-label text-muted">
          O colega saiu da conversa.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="peer-chat-message" className="sr-only">
          Mensagem
        </label>
        <input
          id="peer-chat-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="flex-1 rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
        />
        <Button type="submit" full={false}>
          Enviar
        </Button>
      </form>

      <div className="mt-3">
        <Button variant="outline" onClick={onLeave}>
          Sair da conversa
        </Button>
      </div>
    </div>
  );
}
