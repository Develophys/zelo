import type { Blocker } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Modal } from '@/presentation/ui/Modal';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';

interface AbandonAssessmentModalProps {
  blocker: Blocker;
  onConfirmLeave: () => void;
  // True when the self-harm item currently holds a non-zero answer, so this
  // exit point offers the same line the question screen already showed —
  // someone leaving mid-flow shouldn't lose that just by not submitting.
  showCrisisLine?: boolean;
}

export function AbandonAssessmentModal({
  blocker,
  onConfirmLeave,
  showCrisisLine = false,
}: AbandonAssessmentModalProps) {
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
      {showCrisisLine && (
        <div className="mt-4 rounded-card border border-line bg-surface p-3">
          <p className="text-pretty text-label text-ink-2">
            Se precisar falar com alguém agora, a linha está aqui.
          </p>
          <CrisisCallLink line={getCrisisLine()} className="mt-1 text-brand" />
        </div>
      )}
    </Modal>
  );
}
