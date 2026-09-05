import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BackButton } from '@/presentation/ui/BackButton';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';
import { routes } from '@/presentation/lib/routes';
import { type AppHeaderOverride, resolveAppHeaderMeta } from './app-header-meta';

/**
 * Where the escape hatch is needed. The shell knows which navs it renders at
 * which width, so it decides; the header only draws it.
 */
export type AppHeaderBack = 'always' | 'below-md' | 'from-md';

const BACK_CLASS: Record<AppHeaderBack, string> = {
  always: '',
  'below-md': 'md:hidden',
  'from-md': 'hidden md:flex',
};

interface AppHeaderProps {
  override?: AppHeaderOverride;
  column?: string;
  className?: string;
  back?: AppHeaderBack;
  // The anonymity badge is a promise to the médico. A manager is authenticated
  // by name and role, so showing it on the panel is untrue for that session and
  // dilutes the badge for the audience it was built for.
  chrome?: 'doctor' | 'manager';
}

export function AppHeader({
  override,
  column = '',
  className = '',
  back,
  chrome = 'doctor',
}: AppHeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
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
        {back && (
          <BackButton className={BACK_CLASS[back]} onClick={() => navigate(routes.home)} />
        )}
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">{title}</h1>
          {/* Rendered only when there is something to say: an empty paragraph
              still occupies its line box and pushes the title off optical
              centre on every route without a subtitle. */}
          {subtitle && (
            <p
              data-testid="app-header-subtitle"
              className="min-w-0 text-pretty text-caption text-brand line-clamp-2"
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-none items-center gap-1">
          <ThemeSwitchButton />
          {chrome === 'doctor' && <PrivacyBadge onClick={() => setIsEncryptionInfoOpen(true)} />}
        </div>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </div>
  );
}
