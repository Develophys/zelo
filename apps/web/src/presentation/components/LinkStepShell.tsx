import type { FormEvent, ReactNode } from 'react';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';

interface LinkStepShellProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle: ReactNode;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  submitDisabled: boolean;
  submitLoading?: boolean;
  children: ReactNode;
}

export function LinkStepShell({
  backLabel,
  onBack,
  title,
  subtitle,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitLoading = false,
  children,
}: LinkStepShellProps) {
  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label={backLabel} onClick={onBack} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">{title}</h1>
        <p className="text-caption text-muted">{subtitle}</p>

        <form onSubmit={onSubmit}>
          <Card className="mt-5">{children}</Card>

          <div className="mt-6">
            <Button type="submit" variant="primary" loading={submitLoading} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
