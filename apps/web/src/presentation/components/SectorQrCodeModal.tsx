import { QrCodeModal } from "./QrCodeModal";

interface SectorQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectorName: string;
  inviteCode: string;
}

export function SectorQrCodeModal({ isOpen, onClose, sectorName, inviteCode }: SectorQrCodeModalProps) {
  return (
    <QrCodeModal
      isOpen={isOpen}
      onClose={onClose}
      title={`QR Code — ${sectorName}`}
      payload={inviteCode}
      downloadFilename={`zelo-setor-${inviteCode}.png`}
      testId="sector-qr-canvas"
    />
  );
}
