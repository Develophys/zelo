import { ArrowUpRight, Lock } from 'lucide-react';
import { Modal } from '@/presentation/ui/Modal';

interface EncryptionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOC_LINK = 'https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard';

export function EncryptionInfoModal({ isOpen, onClose }: EncryptionInfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Criptografia AES-256" size="md">
      <p className="text-label text-ink-2">
        AES-256 é um método de criptografia usado por bancos, governos e aplicativos de mensagens
        para proteger informações sensíveis.
      </p>
      <p className="mt-3 text-label text-ink-2">
        Antes de qualquer resposta sair do seu aparelho, ela é transformada em um código que só pode
        ser lido com uma chave que existe apenas no seu aparelho — nem o Zelo consegue abrir esse
        código.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-card bg-surface-brand p-3.25">
        <Lock size={16} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
        <p className="text-label font-semibold text-brand">
          Isso significa que suas respostas ficam protegidas, e sua identidade permanece anônima.
        </p>
      </div>
      <a
        href={DOC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-sm text-label font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Para mais informações, veja o artigo na Wikipédia
        <ArrowUpRight size={14} aria-hidden="true" />
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </Modal>
  );
}
