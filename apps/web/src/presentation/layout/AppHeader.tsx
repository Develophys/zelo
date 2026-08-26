import { useState } from 'react';
import { useLocation } from 'react-router';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';
import { type AppHeaderOverride, resolveAppHeaderMeta } from './app-header-meta';

interface AppHeaderProps {
  override?: AppHeaderOverride;
  column?: string;
  className?: string;
}

export function AppHeader({ override, column = '', className = '' }: AppHeaderProps) {
  const { pathname } = useLocation();
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  const meta = resolveAppHeaderMeta(pathname);
  const title = override?.title ?? meta?.title;

  if (!title) {
    return null;
  }

  const subtitle = override?.subtitle ?? meta?.subtitle;

  return (
    <div
      data-testid="app-header"
      className={`flex flex-none border-b border-surface-brand bg-surface px-4 md:min-h-app-header ${className}`}
    >
      <div
        data-testid="app-header-row"
        className={`flex w-full items-center gap-3 py-3.5 short:py-2 md:py-2.5 ${column}`}
      >
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">{title}</h1>
          <p
            data-testid="app-header-subtitle"
            className="min-w-0 truncate font-mono text-mono-data text-brand"
            title={subtitle}
          >
            {subtitle}
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1">
          <ThemeSwitchButton />
          <PrivacyBadge onClick={() => setIsEncryptionInfoOpen(true)} />
        </div>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </div>
  );
}
