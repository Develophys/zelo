import type { SubmitEvent, ReactNode } from 'react';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';

interface LinkStepShellProps {
  title: string;
  subtitle: string;
  onSubmit: (event: SubmitEvent) => void;
  submitLabel: string;
  submitDisabled: boolean;
  submitLoading?: boolean;
  children: ReactNode;
}

export function LinkStepShell({
  title,
  subtitle,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitLoading = false,
  children,
}: LinkStepShellProps) {
  return (
    <PhoneShell bottomNav centered headerOverride={{ title, subtitle }}>
      <form onSubmit={onSubmit}>
        <Card>{children}</Card>

        <div className="mt-6 px-4.5">
          <Button type="submit" variant="primary" isLoading={submitLoading} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </PhoneShell>
  );
}
