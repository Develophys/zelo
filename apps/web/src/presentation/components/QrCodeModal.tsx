import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/presentation/ui/Button";
import { Modal } from "@/presentation/ui/Modal";

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  payload: string;
  downloadFilename: string;
  testId?: string;
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

// qrcode is loaded lazily — every session pays for it only once it actually
// opens a QR modal, not on every visit to the list that can open one.
export function QrCodeModal({
  isOpen,
  onClose,
  title,
  payload,
  downloadFilename,
  testId = "qr-code-canvas",
}: QrCodeModalProps) {
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
        await QRCode.toCanvas(canvas, payload, { width: QR_SIZE, margin: 1 });
        if (!cancelled) setIsReady(true);
      } catch {
        if (!cancelled) setRenderError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, payload]);

  const handleDownload = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) triggerDownload(blob, downloadFilename);
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center gap-4">
        {renderError ? (
          <p role="alert" className="text-label text-danger">
            Não foi possível gerar o QR Code agora. Tente de novo.
          </p>
        ) : (
          <canvas ref={canvasRef} width={QR_SIZE} height={QR_SIZE} className="rounded-card" data-testid={testId} />
        )}
        <p className="text-center text-label text-muted">Código: {payload}</p>
        <Button type="button" variant="outline" full={false} onClick={handleDownload} disabled={!isReady}>
          <Download size={16} aria-hidden="true" />
          Baixar PNG
        </Button>
      </div>
    </Modal>
  );
}
