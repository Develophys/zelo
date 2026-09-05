import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';
import { TextField } from '@/presentation/ui/TextField';

type LinkInstitutionCodeStepProps = Pick<
  LinkInstitutionFlow,
  'code' | 'onCodeChange' | 'codeErrorMessage' | 'isLookupPending' | 'handleCodeSubmit'
>;

export function LinkInstitutionCodeStep({
  code,
  onCodeChange,
  codeErrorMessage,
  isLookupPending,
  handleCodeSubmit,
}: LinkInstitutionCodeStepProps) {
  return (
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
    </LinkStepShell>
  );
}
