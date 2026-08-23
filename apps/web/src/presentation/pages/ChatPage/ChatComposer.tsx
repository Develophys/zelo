import type { SubmitEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import {
  MAX_MESSAGE_LENGTH,
  NEAR_LIMIT_REMAINING,
  REMAINING_ANNOUNCEMENT_STEPS,
} from '@/presentation/lib/chat-limits';
import { PRIVATE_TEXT_FIELD } from '@/presentation/lib/private-field';

const COMPOSER_ACTION =
  'flex h-11 w-11 flex-none items-center justify-center rounded-control border border-fill-edge bg-brand-fill text-on-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

export const ChatComposer = memo(function ChatComposer({
  isStreaming,
  onSend,
  onStop,
  fieldRef,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState('');
  const [blockedByStream, setBlockedByStream] = useState(false);
  const [overScrollbar, setOverScrollbar] = useState(false);
  const [remainingAnnouncement, setRemainingAnnouncement] = useState('');
  const announcedStepRef = useRef<number | null>(null);
  const capRef = useRef(Number.NaN);
  const remaining = MAX_MESSAGE_LENGTH - text.length;
  const nearLimit = remaining <= NEAR_LIMIT_REMAINING;

  const fitToContent = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const caretTop = field.scrollTop;
    field.style.height = 'auto';
    const cap = capRef.current;
    field.style.height = `${Number.isFinite(cap) ? Math.min(field.scrollHeight, cap) : field.scrollHeight}px`;
    field.scrollTop = caretTop;
  }, [fieldRef]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const remeasureCap = () => {
      capRef.current = Number.parseFloat(window.getComputedStyle(field).maxHeight);
      fitToContent();
    };
    remeasureCap();
    window.addEventListener('resize', remeasureCap);
    return () => window.removeEventListener('resize', remeasureCap);
  }, [fieldRef, fitToContent]);

  useEffect(fitToContent, [fitToContent, text]);

  useEffect(() => {
    if (!isStreaming) setBlockedByStream(false);
  }, [isStreaming]);

  useEffect(() => {
    const step = REMAINING_ANNOUNCEMENT_STEPS.find((threshold) => remaining <= threshold);

    if (step === undefined) {
      announcedStepRef.current = null;
      setRemainingAnnouncement('');
      return;
    }

    if (announcedStepRef.current !== null && step >= announcedStepRef.current) return;

    announcedStepRef.current = step;
    setRemainingAnnouncement(
      remaining === 0
        ? `Limite de ${MAX_MESSAGE_LENGTH} caracteres atingido.`
        : `${remaining} caracteres restantes.`,
    );
  }, [remaining]);

  const trySend = () => {
    if (isStreaming) {
      setBlockedByStream(true);
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText('');
  };

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    trySend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    trySend();
  };

  const handleFieldMouseMove = (event: MouseEvent<HTMLTextAreaElement>) => {
    const beyondContent = event.nativeEvent.offsetX > event.currentTarget.clientWidth;
    setOverScrollbar((previous) => (previous === beyondContent ? previous : beyondContent));
  };

  const describedBy = ['chat-composer-keys']
    .concat(nearLimit ? 'chat-composer-remaining' : [])
    .concat(blockedByStream ? 'chat-composer-stream-hint' : [])
    .join(' ');

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-surface-brand bg-surface p-[14px_16px] short:p-[10px_16px]"
    >
      <div className="mx-auto w-full max-w-chat">
        <p
          aria-live="polite"
          aria-atomic="true"
          data-testid="composer-remaining-announcement"
          className="sr-only"
        >
          {remainingAnnouncement}
        </p>

        {blockedByStream && (
          <p
            id="chat-composer-stream-hint"
            role="status"
            className="mb-1.5 pl-5 text-caption text-muted"
          >
            Espere a resposta terminar, ou toque em parar.
          </p>
        )}

        <div className="flex items-end gap-2">
          <label htmlFor="chat-composer-message" className="sr-only">
            Mensagem
          </label>
          <span id="chat-composer-keys" className="sr-only">
            Enter envia a mensagem. Shift e Enter juntos criam uma nova linha.
          </span>
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={fieldRef}
              id="chat-composer-message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              onMouseMove={handleFieldMouseMove}
              onMouseLeave={() => setOverScrollbar(false)}
              placeholder="Escreva como você está…"
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              autoComplete="off"
              enterKeyHint="send"
              {...PRIVATE_TEXT_FIELD}
              aria-describedby={describedBy}
              className={`inset-scrollbar block max-h-38.25 w-full resize-none overflow-y-auto rounded-card-lg border border-line bg-canvas pt-3.25 pr-4.5 pb-8.5 pl-4.5 text-[16px] leading-normal text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                overScrollbar ? 'cursor-default' : ''
              }`}
            />

            <div
              data-testid="composer-counter-slot"
              className="pointer-events-none absolute bottom-px left-px right-3.75 rounded-bl-card-lg bg-canvas pt-1.5 pr-4.5 pb-2 text-right"
            >
              {nearLimit && (
                <span
                  id="chat-composer-remaining"
                  className={`text-caption ${remaining === 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {remaining === 0
                    ? `Limite de ${MAX_MESSAGE_LENGTH} caracteres atingido.`
                    : `${remaining} caracteres restantes`}
                </span>
              )}
            </div>
          </div>

          {isStreaming ? (
            <button
              type="button"
              aria-label="Parar resposta"
              onClick={onStop}
              className={`${COMPOSER_ACTION} hover:bg-brand-fill-hover`}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Enviar"
              disabled={text.trim().length === 0}
              className={`${COMPOSER_ACTION} disabled:bg-track disabled:text-muted`}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
});
