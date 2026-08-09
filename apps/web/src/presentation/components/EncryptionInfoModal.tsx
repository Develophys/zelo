import { Modal } from '@/presentation/ui/Modal';

interface EncryptionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOC_LINK = 'https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard';

export function EncryptionInfoModal({ isOpen, onClose }: EncryptionInfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Criptografia AES-256" size="sm">
      <p className="text-label text-ink-2">
        AES-256 é um método de criptografia usado por bancos, governos e aplicativos de mensagens
        para proteger informações sensíveis.
      </p>
      <p className="mt-3 text-label text-ink-2">
        Antes de qualquer resposta sair do seu aparelho, ela é transformada em um código que só
        pode ser lido com uma chave que existe apenas no seu dispositivo — nem o Zelo consegue
        abrir esse código.
      </p>
      <p className="mt-3 text-label text-ink-2">
        Isso significa que suas respostas ficam protegidas, e sua identidade permanece anônima.
      </p>
      <a
        href={DOC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-label font-bold text-brand"
      >
        Para mais informações, acesse a documentação →
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </Modal>
  );
}
