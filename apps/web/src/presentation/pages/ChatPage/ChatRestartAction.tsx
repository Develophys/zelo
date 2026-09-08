import { RotateCcw } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/presentation/ui/Button';
import { Modal } from '@/presentation/ui/Modal';
import { CHAT_COLUMN } from './chat-column';

interface ChatRestartActionProps {
  hasMessages: boolean;
  onConfirm: () => void;
}

// Nothing to restart with an empty transcript — showing the button anyway
// would be an action with no effect to confirm.
export const ChatRestartAction = memo(function ChatRestartAction({
  hasMessages,
  onConfirm,
}: ChatRestartActionProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  if (!hasMessages) return null;

  return (
    <div className="flex-none px-4 pt-2 short:pt-1.5">
      <div className={`${CHAT_COLUMN} flex justify-end`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          full={false}
          onClick={() => setIsConfirmOpen(true)}
          className="enabled:hover:text-brand"
        >
          <RotateCcw size={14} className="shrink-0" aria-hidden="true" />
          Nova conversa
        </Button>
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Começar uma nova conversa?"
        size="sm"
        footer={
          <>
            <Button variant="outline" full={false} onClick={() => setIsConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              full={false}
              onClick={() => {
                setIsConfirmOpen(false);
                onConfirm();
              }}
            >
              Apagar e recomeçar
            </Button>
          </>
        }
      >
        <p className="text-label text-ink">Esta conversa será apagada e não poderá ser recuperada.</p>
      </Modal>
    </div>
  );
});
