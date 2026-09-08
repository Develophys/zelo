import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { Modal } from "@/presentation/ui/Modal";

interface LinkInstitutionQrScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}

const CAMERA_ERROR = "Não conseguimos acessar a câmera. Digite o código manualmente.";

// qr-scanner (and the worker it drives the actual decoding on) is loaded
// lazily — only a médico who opens this modal pays for it.
export function LinkInstitutionQrScanModal({ isOpen, onClose, onScanned }: LinkInstitutionQrScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Read through a ref rather than listed as an effect dependency: onScanned
  // is a fresh function every render of the parent, and the camera stream
  // must not restart just because that identity changed while the modal
  // sits open.
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);

  useEffect(() => {
    if (!isOpen) return;
    setCameraError(null);
    let cancelled = false;

    (async () => {
      // Vite bundles the decode worker on its own via the dynamic import
      // inside qr-scanner itself — no manual WORKER_PATH wiring needed.
      const { default: QrScannerCtor } = await import("qr-scanner");

      const video = videoRef.current;
      if (!video || cancelled) return;

      const scanner = new QrScannerCtor(video, (result) => onScannedRef.current(result.data), {
        highlightScanRegion: true,
      });
      scannerRef.current = scanner;

      try {
        await scanner.start();
      } catch {
        if (!cancelled) setCameraError(CAMERA_ERROR);
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Escanear QR Code" size="sm">
      <div className="flex flex-col gap-3">
        {cameraError ? (
          <p role="alert" className="text-label text-danger">
            {cameraError}
          </p>
        ) : (
          <>
            <p className="text-label text-ink-2">Aponte a câmera para o QR Code do seu hospital.</p>
            {/* qr-scanner reads frames straight off this element — it is the
                scan surface, not just a preview. */}
            <video ref={videoRef} muted playsInline className="w-full rounded-card" data-testid="qr-scan-video" />
          </>
        )}
      </div>
    </Modal>
  );
}
