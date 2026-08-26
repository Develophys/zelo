import type { ReactNode } from 'react';

interface SettingsRowProps {
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Every measurement here is fixed rather than drawn from the density tokens:
 * changing Densidade must not move the screen that changes it.
 */
export function SettingsRow({ title, description, children }: SettingsRowProps) {
  return (
    <div
      data-testid="settings-row"
      className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0 md:flex-row md:items-start md:justify-between md:gap-8"
    >
      <div className="min-w-0 md:max-w-[42ch]">
        <h2 className="font-sans text-body font-extrabold text-ink">{title}</h2>
        <p className="mt-1 text-caption text-muted">{description}</p>
      </div>
      <div className="w-full flex-none md:w-80">{children}</div>
    </div>
  );
}
