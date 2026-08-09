import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';

type LinkInstitutionCodeStepProps = Pick<
  LinkInstitutionFlow,
  'code' | 'onCodeChange' | 'codeErrorMessage' | 'isLookupPending' | 'handleCodeSubmit' | 'goToYou'
>;

export function LinkInstitutionCodeStep({
  code,
  onCodeChange,
  codeErrorMessage,
  isLookupPending,
  handleCodeSubmit,
  goToYou,
}: LinkInstitutionCodeStepProps) {
  return (
    <LinkStepShell
      backLabel="Você"
      onBack={goToYou}
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
      <input
        id="invite-code"
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        placeholder="Digite o código"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />

      {codeErrorMessage && (
        <p role="alert" className="mt-2 text-label text-danger">
          {codeErrorMessage}
        </p>
      )}
    </LinkStepShell>
  );
}
