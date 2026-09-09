import { QrCodeModal } from "./QrCodeModal";

interface InstitutionQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionName: string;
  inviteCode: string;
}

export function InstitutionQrCodeModal({
  isOpen,
  onClose,
  institutionName,
  inviteCode,
}: InstitutionQrCodeModalProps) {
  return (
    <QrCodeModal
      isOpen={isOpen}
      onClose={onClose}
      title={`QR Code — ${institutionName}`}
      payload={inviteCode}
      downloadFilename={`zelo-convite-${inviteCode}.png`}
      testId="institution-qr-canvas"
    />
  );
}
