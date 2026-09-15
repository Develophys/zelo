import { Button } from '@/presentation/ui/Button';
import { Modal } from '@/presentation/ui/Modal';
import type { UseBulkDelete } from './useBulkDelete';

/**
 * The confirmation dialog for useBulkDelete. The hook already owns every piece
 * of state this renders — open/closed, title, busy, refusal text — so it takes
 * the hook's return value whole rather than a prop per field.
 */
export function BulkDeleteConfirmModal({ bulk }: { bulk: UseBulkDelete }) {
  return (
    <Modal
      isOpen={bulk.deleteTarget !== null}
      onClose={bulk.closeDeleteConfirm}
      title={bulk.deleteTitle}
      size="sm"
      footer={
        <>
          <Button variant="outline" full={false} onClick={bulk.closeDeleteConfirm}>
            Cancelar
          </Button>
          <Button variant="danger" full={false} isLoading={bulk.deleteBusy} onClick={bulk.confirmDelete}>
            Excluir
          </Button>
        </>
      }
    >
      <p className="text-label text-ink">Esta ação não pode ser desfeita.</p>
      {bulk.deleteMessage && (
        <p role="alert" className="mt-3 text-label text-danger">
          {bulk.deleteMessage}
        </p>
      )}
    </Modal>
  );
}
