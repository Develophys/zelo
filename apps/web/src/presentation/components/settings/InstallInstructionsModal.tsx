import type { LucideIcon } from 'lucide-react';
import { Modal } from '@/presentation/ui/Modal';

interface InstallInstructionsStep {
  icon: LucideIcon;
  text: string;
}

interface InstallInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  intro: string;
  steps: InstallInstructionsStep[];
}

export function InstallInstructionsModal({
  isOpen,
  onClose,
  intro,
  steps,
}: InstallInstructionsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar à tela inicial" size="sm">
      <p className="text-label text-ink-2">{intro}</p>
      <ol className="mt-3 flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, index) => (
          <li key={index} className="flex items-start gap-2 rounded-card bg-surface-brand p-3.25">
            <Icon size={16} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
            <p className="text-label font-semibold text-brand">{text}</p>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
