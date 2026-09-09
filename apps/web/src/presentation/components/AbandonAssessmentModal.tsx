import type { Blocker } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Modal } from '@/presentation/ui/Modal';

interface AbandonAssessmentModalProps {
  blocker: Blocker;
  onConfirmLeave: () => void;
}

export function AbandonAssessmentModal({ blocker, onConfirmLeave }: AbandonAssessmentModalProps) {
  const isOpen = blocker.state === 'blocked';

  const handleStay = () => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const handleLeave = () => {
    onConfirmLeave();
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleStay}
      title="Sair sem terminar?"
      size="sm"
      footer={
        <>
          <Button variant="outline" full={false} onClick={handleStay}>
            Continuar respondendo
          </Button>
          <Button variant="danger" full={false} onClick={handleLeave}>
            Sair mesmo assim
          </Button>
        </>
      }
    >
      <p className="text-label text-ink">
        Suas respostas ainda não foram enviadas. Você pode retomar de onde parou a qualquer momento.
      </p>
    </Modal>
  );
}
