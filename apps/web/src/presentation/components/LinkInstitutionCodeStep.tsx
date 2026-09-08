import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { useHasCamera } from '@/presentation/hooks/useHasCamera';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';
import { LinkInstitutionQrScanModal } from '@/presentation/components/LinkInstitutionQrScanModal';
import { Button } from '@/presentation/ui/Button';
import { TextField } from '@/presentation/ui/TextField';

type LinkInstitutionCodeStepProps = Pick<
  LinkInstitutionFlow,
  'code' | 'onCodeChange' | 'codeErrorMessage' | 'isLookupPending' | 'handleCodeSubmit' | 'handleCodeScanned'
>;

export function LinkInstitutionCodeStep({
  code,
  onCodeChange,
  codeErrorMessage,
  isLookupPending,
  handleCodeSubmit,
  handleCodeScanned,
}: LinkInstitutionCodeStepProps) {
  const hasCamera = useHasCamera();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <>
      <LinkStepShell
        title="Vincular ao hospital"
        subtitle="Digite o código do seu hospital para aparecer nos números do seu time."
        onSubmit={handleCodeSubmit}
        submitLabel="Continuar"
        submitDisabled={code.trim().length === 0}
        submitLoading={isLookupPending}
      >
        <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
          Código do hospital
        </label>
        <TextField
          id="invite-code"
          required
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          placeholder="Digite o código"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2"
          aria-invalid={codeErrorMessage ? true : undefined}
          aria-describedby={codeErrorMessage ? "invite-code-error" : undefined}
        />

        {codeErrorMessage && (
          <p id="invite-code-error" role="alert" className="mt-2 text-label text-danger">
            {codeErrorMessage}
          </p>
        )}

        {/* Hidden with no camera behind it rather than shown and left to
            fail — same rule as the PWA install row: no dead-end controls. */}
        {hasCamera && (
          <Button
            type="button"
            variant="outline"
            full={false}
            className="mt-4"
            onClick={() => setIsScannerOpen(true)}
          >
            <ScanLine size={16} aria-hidden="true" />
            Escanear QR Code
          </Button>
        )}
      </LinkStepShell>

      <LinkInstitutionQrScanModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanned={(scannedCode) => {
          setIsScannerOpen(false);
          handleCodeScanned(scannedCode);
        }}
      />
    </>
  );
}
