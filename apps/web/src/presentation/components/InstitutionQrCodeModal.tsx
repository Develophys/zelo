import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Modal } from "@/presentation/ui/Modal";

interface InstitutionQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionName: string;
  inviteCode: string;
}

const QR_SIZE = 240;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// qrcode is loaded lazily — every admin session pays for it only once they
// actually open a QR modal, not on every visit to the institutions list.
export function InstitutionQrCodeModal({
  isOpen,
  onClose,
  institutionName,
  inviteCode,
}: InstitutionQrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      setRenderError(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { default: QRCode } = await import("qrcode");
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      try {
        await QRCode.toCanvas(canvas, inviteCode, { width: QR_SIZE, margin: 1 });
        if (!cancelled) setIsReady(true);
      } catch {
        if (!cancelled) setRenderError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, inviteCode]);

  const handleDownload = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) triggerDownload(blob, `zelo-convite-${inviteCode}.png`);
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`QR Code — ${institutionName}`} size="sm">
      <div className="flex flex-col items-center gap-4">
        {renderError ? (
          <p role="alert" className="text-label text-danger">
            Não foi possível gerar o QR Code agora. Tente de novo.
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            width={QR_SIZE}
            height={QR_SIZE}
            className="rounded-card"
            data-testid="institution-qr-canvas"
          />
        )}
        <p className="text-center text-label text-muted">Código: {inviteCode}</p>
        <Button type="button" variant="outline" full={false} onClick={handleDownload} disabled={!isReady}>
          <Download size={16} aria-hidden="true" />
          Baixar PNG
        </Button>
      </div>
    </Modal>
  );
}
